"""
app/services/strategy_service.py
────────────────────────────────
Draft management + persistence for the Strategy Builder, plus conversion between
the ORM rows and the in-memory app.strategy.domain objects the maths runs on.

Follows the app's service conventions: module-level functions taking
(db: Session, user: User), raising domain exceptions, and NEVER committing —
the router owns db.commit().
"""

from __future__ import annotations

import logging
import uuid
from datetime import date
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from app.core.constants import StrategyStatus
from app.core.exceptions import OrderNotFoundError, StrategyValidationError
from app.core.instruments import get_spec
from app.models.strategy import Strategy as StrategyORM
from app.models.strategy import StrategyLeg as StrategyLegORM
from app.models.user import User
from app.models.virtual_account import VirtualAccount
from app.strategy import builder, templates
from app.strategy.domain import Leg, OptionContract, Strategy as StrategyDomain
from app.strategy.greeks import strategy_greeks, years_to_expiry
from app.strategy.margin import estimate_margin
from app.strategy.payoff import payoff_curve

logger = logging.getLogger(__name__)


# ── ORM ⇄ domain conversion ───────────────────────────────────
def leg_to_domain(row: StrategyLegORM) -> Leg:
    contract = OptionContract(
        underlying=row.instrument,
        expiry=row.expiry_date,
        instrument_type=row.instrument_type,
        strike=float(row.strike_price) if row.strike_price is not None else None,
    )
    return Leg(
        contract=contract,
        action=row.action,
        lots=row.lots,
        lot_size=row.lot_size,
        entry_price=float(row.entry_price) if row.entry_price is not None else None,
        status=row.status,
        id=row.id,
    )


def to_domain(orm: StrategyORM) -> StrategyDomain:
    """Rebuild an in-memory Strategy (for payoff/greeks/margin) from ORM rows."""
    s = StrategyDomain(
        underlying=orm.underlying,
        name=orm.name,
        template_id=orm.template_id,
        status=orm.status,
        allow_calendar=orm.allow_calendar,
        id=orm.id,
    )
    s.legs = [leg_to_domain(r) for r in orm.legs]
    return s


def _account(db: Session, user: User) -> VirtualAccount:
    account = db.query(VirtualAccount).filter(VirtualAccount.user_id == user.id).first()
    if account is None:
        raise OrderNotFoundError("No virtual account for this user")
    return account


def _persist_leg(db: Session, user: User, strategy_id: uuid.UUID, leg: Leg) -> StrategyLegORM:
    row = StrategyLegORM(
        id=leg.id,
        strategy_id=strategy_id,
        user_id=user.id,
        tenant_id=user.tenant_id,
        instrument=leg.contract.underlying,
        expiry_date=leg.contract.expiry,
        strike_price=Decimal(str(leg.contract.strike)) if leg.contract.strike is not None else None,
        instrument_type=leg.contract.instrument_type,
        action=leg.action,
        lots=leg.lots,
        lot_size=leg.lot_size,
        entry_price=Decimal(str(leg.entry_price)) if leg.entry_price is not None else None,
        status=leg.status,
    )
    db.add(row)
    return row


# ── draft creation ────────────────────────────────────────────
def create_from_template(db: Session, user: User, *, template_id: str,
                         underlying: str, spot: float, expiries: list[date],
                         lots: int = 1, setup_tag: Optional[str] = None) -> StrategyORM:
    """
    Build a draft Strategy from a template and persist it (header + legs).

    Legs are structural (unpriced) — pricing happens at execution against the
    live chain. Raises StrategyValidationError via the builder on any bad leg.
    """
    domain = templates.build_template(template_id, underlying, spot, expiries, lots=lots)
    account = _account(db, user)

    orm = StrategyORM(
        id=domain.id,
        user_id=user.id,
        tenant_id=user.tenant_id,
        account_id=account.id,
        underlying=domain.underlying,
        name=domain.name,
        template_id=domain.template_id,
        status=StrategyStatus.DRAFT,
        allow_calendar=domain.allow_calendar,
        setup_tag=setup_tag,
    )
    db.add(orm)
    db.flush()
    for leg in domain.legs:
        _persist_leg(db, user, orm.id, leg)
    logger.info("Draft strategy %s (%s) created for user %s", orm.id, template_id, user.id)
    return orm


def create_empty_draft(db: Session, user: User, *, underlying: str,
                       name: Optional[str] = None, allow_calendar: bool = False,
                       setup_tag: Optional[str] = None) -> StrategyORM:
    """Create an empty draft the user will add legs to manually."""
    get_spec(underlying)   # validate underlying up front (raises if unknown)
    account = _account(db, user)
    orm = StrategyORM(
        id=uuid.uuid4(), user_id=user.id, tenant_id=user.tenant_id,
        account_id=account.id, underlying=underlying.strip().upper(),
        name=name, status=StrategyStatus.DRAFT,
        allow_calendar=allow_calendar, setup_tag=setup_tag,
    )
    db.add(orm)
    db.flush()
    return orm


# ── lookups ───────────────────────────────────────────────────
def get_strategy(db: Session, user: User, strategy_id: uuid.UUID) -> StrategyORM:
    orm = db.query(StrategyORM).filter(
        StrategyORM.id == strategy_id, StrategyORM.user_id == user.id
    ).first()
    if orm is None:
        raise OrderNotFoundError(f"Strategy {strategy_id} not found")
    return orm


def list_strategies(db: Session, user: User, status: Optional[str] = None,
                    limit: int = 50, offset: int = 0) -> list[StrategyORM]:
    q = db.query(StrategyORM).filter(StrategyORM.user_id == user.id)
    if status:
        q = q.filter(StrategyORM.status == status)
    return q.order_by(StrategyORM.created_at.desc()).limit(limit).offset(offset).all()


def _require_draft(orm: StrategyORM) -> None:
    if orm.status != StrategyStatus.DRAFT:
        raise StrategyValidationError(
            code="NOT_A_DRAFT",
            message=f"Strategy is {orm.status}; only drafts can be edited.",
        )


# ── draft leg editing (persisted) ─────────────────────────────
def add_leg(db: Session, user: User, strategy_id: uuid.UUID, *, instrument_type: str,
            action: str, lots: int, expiry: date, strike: Optional[float]) -> StrategyLegORM:
    orm = get_strategy(db, user, strategy_id)
    _require_draft(orm)
    domain = to_domain(orm)
    leg = builder.make_leg(orm.underlying, instrument_type, action, lots, expiry, strike=strike)
    builder.add_leg(domain, leg)             # validates against existing legs
    row = _persist_leg(db, user, orm.id, leg)
    db.flush()
    return row


def remove_leg(db: Session, user: User, strategy_id: uuid.UUID, leg_id: uuid.UUID) -> None:
    orm = get_strategy(db, user, strategy_id)
    _require_draft(orm)
    row = next((l for l in orm.legs if l.id == leg_id), None)
    if row is None:
        raise StrategyValidationError(code="LEG_NOT_FOUND",
                                      message=f"No leg {leg_id} in this strategy")
    db.delete(row)
    db.flush()


def delete_draft(db: Session, user: User, strategy_id: uuid.UUID) -> None:
    orm = get_strategy(db, user, strategy_id)
    _require_draft(orm)
    for row in list(orm.legs):
        db.delete(row)
    db.delete(orm)
    db.flush()


# ── analytics preview (payoff + greeks + margin) ──────────────
def _probability_of_profit(prices: list[float], pnls: list[float], spot: float,
                           iv_pct: Optional[float], t_years: float) -> Optional[float]:
    """
    Rough POP: integrate a normal density of the expiry price (centred at spot,
    sd = spot·σ·√T) over the region of the payoff curve where P&L > 0.
    Returns a percentage. None when we have no vol estimate.
    """
    if not iv_pct or iv_pct <= 0 or t_years <= 0 or spot <= 0 or len(prices) < 2:
        return None
    import math
    sd = spot * (iv_pct / 100.0) * math.sqrt(t_years)
    if sd <= 0:
        return None

    def pdf(x):
        z = (x - spot) / sd
        return math.exp(-0.5 * z * z) / (sd * math.sqrt(2 * math.pi))

    total = 0.0
    profit = 0.0
    for i in range(len(prices) - 1):
        width = prices[i + 1] - prices[i]
        density = (pdf(prices[i]) + pdf(prices[i + 1])) / 2.0
        mass = density * width
        total += mass
        if pnls[i] > 0 or pnls[i + 1] > 0:
            profit += mass
    return round(profit / total * 100.0, 1) if total > 0 else None


def analyze(underlying: str, spot: Optional[float], legs: list) -> dict:
    """
    Compute payoff / greeks / margin / POP for an ad-hoc set of legs — the live
    interactive builder path. No persistence, no account. Each leg carries the
    ltp (entry) and iv the client read off the live chain; missing option ltp is
    priced from the provider chain as a fallback.

    `legs` items are pydantic AnalyzeLeg (attr access).
    """
    from app.market.provider_factory import get_market_provider
    from app.strategy.chain import ChainPricer

    spec = get_spec(underlying)
    if not legs:
        raise StrategyValidationError(code="EMPTY", message="Add at least one leg.")

    if spot is None:
        spot = float(get_market_provider().get_spot_price(underlying))

    domain = StrategyDomain(underlying=underlying, allow_calendar=True)
    pricer = None
    problems: list[str] = []
    ivs: list[float] = []

    for item in legs:
        contract = OptionContract(
            underlying=underlying, expiry=item.expiry,
            instrument_type=item.instrument_type,
            strike=item.strike, ltp=item.ltp,
            iv=(item.iv / 100.0) if item.iv else None,
        )
        entry = item.ltp
        if entry is None:                       # fallback: price from live chain
            if pricer is None:
                pricer = ChainPricer(get_market_provider(), underlying)
            try:
                built = pricer.build_contract(item.strike, item.instrument_type, item.expiry, spot)
                entry = built.ltp
                contract.iv = built.iv if built.iv else contract.iv
            except Exception as e:
                problems.append(str(e))
        leg = builder.make_leg(
            underlying, item.instrument_type, item.action, item.lots,
            item.expiry, strike=item.strike, entry_price=entry, contract=contract,
        )
        builder.add_leg(domain, leg)
        if item.iv:
            ivs.append(item.iv)

    payoff = payoff_curve(domain, spot) if domain.net_premium is not None else None
    try:
        g = strategy_greeks(domain, spot)
        greeks = {"delta": g.delta, "gamma": g.gamma, "theta": g.theta, "vega": g.vega}
    except Exception:
        greeks = {"delta": 0.0, "gamma": 0.0, "theta": 0.0, "vega": 0.0}
    margin = estimate_margin(domain, spot)

    pop = None
    if payoff is not None and ivs:
        t = years_to_expiry(min(l.contract.expiry for l in domain.legs))
        pop = _probability_of_profit(payoff.prices, payoff.pnls, spot,
                                     sum(ivs) / len(ivs), t)

    return {
        "underlying": spec.symbol,
        "spot": spot,
        "net_premium": domain.net_premium,
        "max_profit": payoff.max_profit if payoff else None,
        "max_loss": payoff.max_loss if payoff else None,
        "breakevens": payoff.breakevens if payoff else [],
        "prices": payoff.prices if payoff else [],
        "pnls": payoff.pnls if payoff else [],
        "margin": margin.total,
        "is_defined_risk": margin.is_defined_risk,
        "pop": pop,
        "greeks": greeks,
        "problems": problems,
    }


def expand_template(template_id: str, underlying: str,
                    expiry: Optional[str] = None) -> dict:
    """
    Turn a template into concrete, chain-priced legs for the interactive builder
    (no persistence). Returns legs with strike/action/type/lots/ltp/iv so the
    client can drop them straight into the positions table and analyze.
    """
    from app.market.provider_factory import get_market_provider
    from app.strategy.chain import ChainPricer

    provider = get_market_provider()
    pricer = ChainPricer(provider, underlying)
    spot = float(provider.get_spot_price(underlying))

    raw = provider.get_expiries(underlying) or []
    exps = [date.fromisoformat(e) if isinstance(e, str) else e for e in raw]
    if expiry:
        sel = date.fromisoformat(expiry)
        exps = [sel] + [e for e in exps if e != sel]
    if not exps:
        raise StrategyValidationError(code="NO_EXPIRY", message="No expiries available.")

    meta = templates.get_template(template_id)
    domain = templates.build_template(template_id, underlying, spot,
                                      exps[:max(meta.min_expiries, 1)])
    out = []
    for leg in domain.legs:
        c = leg.contract
        ltp, iv = None, None
        try:
            built = pricer.build_contract(c.strike, c.instrument_type, c.expiry, spot)
            ltp = built.ltp
            iv = round(built.iv * 100, 2) if built.iv else None
        except Exception:
            pass
        out.append({
            "action": leg.action, "instrument_type": c.instrument_type,
            "strike": c.strike, "lots": leg.lots,
            "expiry": c.expiry.isoformat(), "ltp": ltp, "iv": iv,
        })
    return {"underlying": get_spec(underlying).symbol, "spot": spot,
            "name": meta.name, "legs": out}


def analytics(orm: StrategyORM, spot: float, as_of: Optional[date] = None) -> dict:
    """
    Payoff summary + net greeks + margin estimate for a strategy at `spot`.

    For an unpriced DRAFT, legs are priced from the live chain first (on an
    in-memory copy — the persisted draft is not mutated) so the payoff preview
    works before execution. None max_profit/max_loss means unlimited.
    """
    domain = to_domain(orm)
    result: dict = {"underlying": orm.underlying, "spot": spot}

    # Price unpriced legs from the chain so a draft still gets a payoff preview.
    if domain.net_premium is None and domain.legs:
        from app.market.provider_factory import get_market_provider
        from app.strategy.chain import ChainPricer
        pricer = ChainPricer(get_market_provider(), orm.underlying)
        pricer.price_strategy(domain, set_entry=True, as_of=as_of)

    if domain.net_premium is not None:
        payoff = payoff_curve(domain, spot)
        result["payoff"] = {
            "max_profit": payoff.max_profit,
            "max_loss": payoff.max_loss,
            "breakevens": payoff.breakevens,
            "net_premium": payoff.net_premium,
            "prices": payoff.prices,
            "pnls": payoff.pnls,
        }
    try:
        g = strategy_greeks(domain, spot, as_of=as_of)
        result["greeks"] = {"delta": g.delta, "gamma": g.gamma,
                            "theta": g.theta, "vega": g.vega}
    except Exception:
        result["greeks"] = None   # unpriced legs have no IV yet

    m = estimate_margin(domain, spot)
    result["margin"] = {"total": m.total, "is_defined_risk": m.is_defined_risk,
                        "premium_credit": m.premium_credit, "notes": m.notes}
    return result
