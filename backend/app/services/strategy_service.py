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
from app.strategy.greeks import strategy_greeks
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
