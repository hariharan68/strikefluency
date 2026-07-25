"""
app/services/strategy_execution_service.py
──────────────────────────────────────────
Paper execution for the Strategy Builder: fill legs, block margin, open a
StrategyPosition, mirror legs into VirtualOrder rows, and support partial exits,
full square-off, expiry-day auto square-off, and mark-to-market.

Conventions (mirrors virtual_order_service):
  - module functions taking (db, user, ...), raising domain exceptions
  - the service NEVER commits — the router owns db.commit()

Discipline: an executed strategy counts as ONE trade. Only the three
strategy-level rules apply (setup tag, max trades/day, max daily loss); the
per-leg rules (direction flip, averaging down) are skipped by design — an iron
condor is deliberately multi-directional. See STRATEGY_DISCIPLINE_RULES.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from app.config import settings
from app.core.constants import (
    ExitReason,
    LegInstrumentType,
    LegStatus,
    OrderAction,
    OrderStatus,
    ProductType,
    StrategyStatus,
)
from app.core.exceptions import (
    DisciplineViolationError,
    InsufficientBalanceError,
    MarketClosedError,
    OrderNotFoundError,
    StrategyValidationError,
)
from app.core.instruments import get_spec
from app.core.utils import current_trading_day, is_market_open
from app.market.provider_factory import get_market_provider
from app.models.strategy import StrategyLeg as StrategyLegORM
from app.models.strategy import StrategyPosition as StrategyPositionORM
from app.models.user import User
from app.models.virtual_account import VirtualAccount
from app.models.virtual_order import VirtualOrder
from app.services import strategy_service
from app.services.brokerage_calculator import calculate_brokerage
from app.services.discipline_engine import DisciplineEngine
from app.services.slippage_engine import calculate_slippage
from app.services.trading_session_service import (
    get_or_create_today,
    increment_trade_count,
    update_realized_pnl,
)
from app.strategy import builder
from app.strategy.chain import ChainPricer, StrikeNotInChainError
from app.strategy.domain import Leg, Strategy as StrategyDomain
from app.strategy.margin import estimate_margin

logger = logging.getLogger(__name__)


# ── pure execution planning (testable, no DB) ─────────────────
@dataclass
class LegFill:
    leg_id: uuid.UUID
    action: str
    instrument_type: str
    strike: Optional[float]
    quoted_ltp: float
    fill_price: float
    lots: int
    lot_size: int
    brokerage: float

    @property
    def quantity(self) -> int:
        return self.lots * self.lot_size


@dataclass
class ExecutionPlan:
    fills: list[LegFill] = field(default_factory=list)
    margin: float = 0.0
    total_brokerage: float = 0.0
    net_premium: Optional[float] = None
    problems: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.problems


def plan_execution(domain: StrategyDomain, pricer: ChainPricer,
                   as_of: Optional[date] = None) -> ExecutionPlan:
    """
    Price every leg from the chain, apply slippage, and compute margin +
    brokerage. Pure w.r.t. the DB — only reads market data through `pricer`.

    A leg whose strike is missing from the chain is a hard problem (never a
    silent spot fill). The caller must not execute a plan with problems.
    """
    plan = ExecutionPlan()
    chain = pricer.chain_for(domain.legs[0].contract.expiry) if domain.legs else {}
    spot = float(chain.get("spot_price", 0.0))
    atm = int(chain.get("atm_strike", spot))

    for leg in domain.legs:
        c = leg.contract
        try:
            quote = pricer.quote_leg(leg, as_of=as_of)
        except StrikeNotInChainError as e:
            plan.problems.append(str(e))
            continue

        if not quote.usable:
            plan.problems.append(quote.reason or f"{c.label()}: no usable price")
            continue

        ltp = float(c.ltp)
        if c.is_future:
            fill = ltp   # futures fill at price, slippage model is option-specific
        else:
            fill_dec, _ = calculate_slippage(
                ltp=Decimal(str(ltp)), strike=int(c.strike), atm_strike=atm,
                action=leg.action, instrument=domain.underlying,
            )
            fill = float(fill_dec)

        leg.entry_price = fill
        brk = calculate_brokerage(Decimal(str(fill)), leg.lots, leg.lot_size, leg.action)
        plan.fills.append(LegFill(
            leg_id=leg.id, action=leg.action, instrument_type=c.instrument_type,
            strike=c.strike, quoted_ltp=ltp, fill_price=fill,
            lots=leg.lots, lot_size=leg.lot_size, brokerage=float(brk.total),
        ))

    plan.total_brokerage = round(sum(f.brokerage for f in plan.fills), 2)
    if plan.ok:
        plan.margin = round(estimate_margin(domain, spot).total, 2)
        plan.net_premium = domain.net_premium
    return plan


# ── discipline (strategy = one trade) ─────────────────────────
def _check_strategy_discipline(engine: DisciplineEngine, setup_tag: Optional[str],
                               session, account) -> None:
    """Run only the three strategy-level rules; log + raise on the first failure."""
    order_data = {"setup_tag": setup_tag}
    for check in (engine._check_mandatory_setup_tag,
                  engine._check_max_trades_per_day,
                  engine._check_max_daily_loss):
        try:
            check(order_data, session, account, [])
        except DisciplineViolationError as e:
            engine._log_violation(e.rule_code, order_data, was_blocked=True)
            raise


# ── execution ─────────────────────────────────────────────────
def execute_strategy(db: Session, user: User, strategy_id: uuid.UUID) -> StrategyPositionORM:
    """
    Execute a DRAFT strategy: fill every leg, block margin, open a position, and
    mirror each option leg into a VirtualOrder tagged with the strategy id.
    """
    orm = strategy_service.get_strategy(db, user, strategy_id)
    if orm.status != StrategyStatus.DRAFT:
        raise StrategyValidationError(code="NOT_A_DRAFT",
                                      message=f"Strategy is already {orm.status}.")
    if not orm.legs:
        raise StrategyValidationError(code="EMPTY", message="Strategy has no legs.")

    if not is_market_open() and not settings.is_development:
        raise MarketClosedError("Market is closed (09:15–15:30 IST).")

    account = db.query(VirtualAccount).filter(VirtualAccount.user_id == user.id).first()
    session = get_or_create_today(db, user)

    # Full structural re-validation in case the draft was assembled by bypassing
    # add_leg (e.g. loaded from persistence).
    domain = strategy_service.to_domain(orm)
    builder.validate_strategy(domain)

    # Price + plan against the live chain.
    pricer = ChainPricer(get_market_provider(), orm.underlying)
    plan = plan_execution(domain, pricer)
    if not plan.ok:
        raise StrategyValidationError(
            code="UNPRICEABLE",
            message="Cannot execute — some legs have no valid quote: "
                    + "; ".join(plan.problems),
        )

    margin = Decimal(str(plan.margin))
    if account.balance < margin:
        raise InsufficientBalanceError(
            f"Insufficient balance. Margin required ₹{margin}, available ₹{account.balance}."
        )

    # Discipline: one trade, three rules (skipped in free-play mode).
    free_play = not account.discipline_mode_enabled
    if not free_play:
        engine = DisciplineEngine(db, user)
        _check_strategy_discipline(engine, orm.setup_tag, session, account)

    # ── persist: legs, mirror orders, position ────────────────
    fills_by_leg = {f.leg_id: f for f in plan.fills}
    now = datetime.now(timezone.utc)

    for row in orm.legs:
        fill = fills_by_leg.get(row.id)
        if fill is None:
            continue
        row.entry_price = Decimal(str(fill.fill_price))
        row.status = LegStatus.OPEN
        row.opened_at = now
        _mirror_order(db, user, orm, row, fill, free_play)

    exec_spot = float(pricer.chain_for(domain.legs[0].contract.expiry).get("spot_price", 0.0))
    payoff = _safe_payoff(domain, exec_spot)
    orm.status = StrategyStatus.EXECUTED
    orm.net_premium = _to_dec(plan.net_premium)
    orm.max_profit = _to_dec(payoff.get("max_profit"))
    orm.max_loss = _to_dec(payoff.get("max_loss"))

    position = StrategyPositionORM(
        id=uuid.uuid4(), strategy_id=orm.id, user_id=user.id,
        tenant_id=user.tenant_id, account_id=account.id,
        margin_blocked=margin, brokerage=Decimal(str(plan.total_brokerage)),
        is_open=True,
    )
    db.add(position)

    account.balance -= margin
    increment_trade_count(session)   # ONE trade for the whole strategy
    db.flush()
    logger.info("Strategy %s executed: %d legs, margin ₹%s", orm.id, len(plan.fills), margin)
    return position


def _mirror_order(db: Session, user: User, orm, leg_row: StrategyLegORM,
                  fill: LegFill, free_play: bool = False) -> Optional[VirtualOrder]:
    """
    Mirror one OPTION leg into a VirtualOrder so existing analytics/journal see
    it. FUT legs are skipped: virtual_orders is CE/PE-only (CHECK constraint) and
    requires a strike, which futures lack.
    """
    if fill.instrument_type == LegInstrumentType.FUT:
        logger.info("Skipping VirtualOrder mirror for FUT leg %s", leg_row.id)
        return None
    order = VirtualOrder(
        id=uuid.uuid4(), user_id=user.id, tenant_id=user.tenant_id,
        account_id=orm.account_id, instrument=orm.underlying,
        expiry_date=leg_row.expiry_date, strike_price=leg_row.strike_price,
        option_type=fill.instrument_type, action=fill.action,
        quantity=fill.lots, lot_size=fill.lot_size,
        entry_ltp=Decimal(str(fill.quoted_ltp)), entry_price=Decimal(str(fill.fill_price)),
        sl_price=None,   # nullable since Phase 5 — no per-leg stop on a strategy
        status=OrderStatus.OPEN,
        product_type=getattr(orm, "product_type", None) or ProductType.INTRADAY,
        trading_day=current_trading_day(),
        brokerage=Decimal(str(fill.brokerage)),
        setup_tag=orm.setup_tag or "OTHER",
        is_discipline_compliant=True, strategy_id=orm.id,
        was_free_play=free_play,
    )
    db.add(order)
    return order


# ── partial exit + square-off ─────────────────────────────────
def close_leg(db: Session, user: User, strategy_id: uuid.UUID, leg_id: uuid.UUID,
              exit_ltp: Optional[float] = None) -> StrategyLegORM:
    """Close a single OPEN leg while the rest of the strategy stays live."""
    orm = strategy_service.get_strategy(db, user, strategy_id)
    row = next((l for l in orm.legs if l.id == leg_id), None)
    if row is None:
        raise StrategyValidationError(code="LEG_NOT_FOUND", message=f"No leg {leg_id}")
    if row.status != LegStatus.OPEN:
        raise StrategyValidationError(code="LEG_NOT_OPEN",
                                      message=f"Leg is {row.status}, not OPEN.")

    pricer = ChainPricer(get_market_provider(), orm.underlying)
    realized = _close_single_leg(db, user, orm, row, pricer, exit_ltp, ExitReason.MANUAL)

    position = _position(db, orm.id)
    if position:
        position.realized_pnl += realized
    _close_if_all_legs_done(db, user, orm, position)
    db.flush()
    return row


def square_off(db: Session, user: User, strategy_id: uuid.UUID,
               reason: str = ExitReason.MANUAL) -> StrategyPositionORM:
    """Close every open leg, release margin, realize P&L."""
    orm = strategy_service.get_strategy(db, user, strategy_id)
    if orm.status != StrategyStatus.EXECUTED:
        raise StrategyValidationError(code="NOT_EXECUTED",
                                      message=f"Strategy is {orm.status}, not executed.")
    pricer = ChainPricer(get_market_provider(), orm.underlying)
    position = _position(db, orm.id)

    total_realized = Decimal("0.00")
    for row in orm.legs:
        if row.status == LegStatus.OPEN:
            total_realized += _close_single_leg(db, user, orm, row, pricer, None, reason)

    if position:
        position.realized_pnl += total_realized
    _close_if_all_legs_done(db, user, orm, position)
    db.flush()
    logger.info("Strategy %s squared off (%s): realized ₹%s", orm.id, reason, total_realized)
    return position


def _close_single_leg(db, user, orm, row: StrategyLegORM, pricer: ChainPricer,
                      exit_ltp: Optional[float], reason: str) -> Decimal:
    """Fill the exit of one leg, update it + its mirrored order, return realized P&L."""
    domain_leg = strategy_service.leg_to_domain(row)
    c = domain_leg.contract

    if exit_ltp is None:
        try:
            quote = pricer.quote_leg(domain_leg)
            exit_ltp = c.ltp if quote.usable else None
        except StrikeNotInChainError:
            exit_ltp = None
    # On expiry/illiquid with no quote, settle at intrinsic value (cash-settled).
    if exit_ltp is None:
        chain = pricer.chain_for(c.expiry)
        spot = float(chain.get("spot_price", 0.0))
        from app.strategy.payoff import value_at_expiry
        exit_ltp = value_at_expiry(c, spot)

    exit_action = OrderAction.SELL if row.action == OrderAction.BUY else OrderAction.BUY
    if c.is_future:
        exit_fill = float(exit_ltp)
    else:
        chain = pricer.chain_for(c.expiry)
        atm = int(chain.get("atm_strike", exit_ltp))
        fill_dec, _ = calculate_slippage(
            ltp=Decimal(str(exit_ltp)), strike=int(c.strike), atm_strike=atm,
            action=exit_action, instrument=orm.underlying,
        )
        exit_fill = float(fill_dec)

    # realized P&L = sign × (exit − entry) × qty  (sign: +1 long, −1 short)
    entry = float(row.entry_price or 0.0)
    realized = domain_leg.sign * (exit_fill - entry) * domain_leg.quantity
    exit_brk = calculate_brokerage(Decimal(str(exit_fill)), row.lots, row.lot_size, exit_action)
    realized_dec = (Decimal(str(realized)) - exit_brk.total).quantize(Decimal("0.01"))

    row.exit_price = Decimal(str(exit_fill))
    row.realized_pnl = realized_dec
    row.status = LegStatus.CLOSED
    row.closed_at = datetime.now(timezone.utc)

    _close_mirrored_order(db, orm.id, row, exit_fill, realized_dec, reason)
    return realized_dec


def _close_mirrored_order(db, strategy_id, leg_row, exit_fill, realized, reason):
    """Close the VirtualOrder mirroring this leg, if one exists (not for FUT)."""
    if leg_row.instrument_type == LegInstrumentType.FUT:
        return
    order = db.query(VirtualOrder).filter(
        VirtualOrder.strategy_id == strategy_id,
        VirtualOrder.strike_price == leg_row.strike_price,
        VirtualOrder.option_type == leg_row.instrument_type,
        VirtualOrder.action == leg_row.action,
        VirtualOrder.status == OrderStatus.OPEN,
    ).first()
    if order is None:
        return
    order.exit_price = Decimal(str(exit_fill))
    order.exit_time = datetime.now(timezone.utc)
    order.pnl = realized
    order.status = OrderStatus.CLOSED
    order.exit_reason = reason


def _close_if_all_legs_done(db, user, orm, position: Optional[StrategyPositionORM]) -> None:
    """When the last leg closes: release margin, apply P&L, close the position."""
    if any(l.status == LegStatus.OPEN for l in orm.legs):
        return
    orm.status = StrategyStatus.CLOSED
    if position and position.is_open:
        account = db.query(VirtualAccount).filter(VirtualAccount.user_id == user.id).first()
        net = position.realized_pnl - position.brokerage
        account.balance += position.margin_blocked + net
        session = get_or_create_today(db, user)
        update_realized_pnl(session, net)
        position.is_open = False
        position.unrealized_pnl = Decimal("0.00")
        position.closed_at = datetime.now(timezone.utc)


# ── mark-to-market ────────────────────────────────────────────
def mark_to_market(db: Session, user: User,
                   strategy_id: Optional[uuid.UUID] = None) -> int:
    """
    Recompute unrealized P&L for open strategy positions from current quotes.
    Returns how many positions were updated. Safe to call on every tick.
    """
    q = db.query(StrategyPositionORM).filter(
        StrategyPositionORM.user_id == user.id, StrategyPositionORM.is_open == True
    )
    if strategy_id:
        q = q.filter(StrategyPositionORM.strategy_id == strategy_id)
    positions = q.all()

    updated = 0
    for pos in positions:
        orm = db.query(strategy_service.StrategyORM).filter(
            strategy_service.StrategyORM.id == pos.strategy_id
        ).first()
        if orm is None:
            continue
        pricer = ChainPricer(get_market_provider(), orm.underlying)
        unrealized = Decimal("0.00")
        for row in orm.legs:
            if row.status != LegStatus.OPEN:
                continue
            leg = strategy_service.leg_to_domain(row)
            try:
                quote = pricer.quote_leg(leg)
                if not quote.usable:
                    continue
            except StrikeNotInChainError:
                continue
            mtm = leg.sign * (float(leg.contract.ltp) - float(row.entry_price or 0)) * leg.quantity
            unrealized += Decimal(str(round(mtm, 2)))
        pos.unrealized_pnl = unrealized
        updated += 1
    db.flush()
    return updated


def mark_to_market_all(db: Session) -> int:
    """
    MTM every open strategy position across all users. Used by the scheduler so
    unrealized P&L keeps updating even when nobody has a WebSocket open (the
    per-user path early-returns on no data; this one iterates the whole table).
    Caller owns the commit.
    """
    positions = db.query(StrategyPositionORM).filter(
        StrategyPositionORM.is_open == True
    ).all()
    user_ids = {p.user_id for p in positions}
    total = 0
    for uid in user_ids:
        user = db.query(User).filter(User.id == uid).first()
        if user is not None:
            total += mark_to_market(db, user)
    return total


# ── expiry-day auto square-off ────────────────────────────────
def auto_square_off_expiry(db: Session, as_of: Optional[date] = None) -> int:
    """
    Square off every open strategy whose nearest leg expires today, at intrinsic
    value (index options are cash-settled — no delivery). Returns count.

    Intended to be called by the EOD scheduler on expiry day. Iterates all users'
    open positions; the caller owns the commit.
    """
    as_of = as_of or date.today()
    open_positions = db.query(StrategyPositionORM).filter(
        StrategyPositionORM.is_open == True
    ).all()

    squared = 0
    for pos in open_positions:
        orm = db.query(strategy_service.StrategyORM).filter(
            strategy_service.StrategyORM.id == pos.strategy_id
        ).first()
        if orm is None:
            continue
        expiring = any(
            l.status == LegStatus.OPEN and l.expiry_date <= as_of for l in orm.legs
        )
        if not expiring:
            continue
        user = db.query(User).filter(User.id == orm.user_id).first()
        if user is None:
            continue
        square_off(db, user, orm.id, reason=ExitReason.EOD_SQUAREOFF)
        squared += 1
    return squared


# ── helpers ───────────────────────────────────────────────────
def _position(db, strategy_id) -> Optional[StrategyPositionORM]:
    return db.query(StrategyPositionORM).filter(
        StrategyPositionORM.strategy_id == strategy_id
    ).first()


def _safe_payoff(domain: StrategyDomain, spot: float) -> dict:
    try:
        from app.strategy.payoff import payoff_curve
        r = payoff_curve(domain, spot)
        return {"max_profit": r.max_profit, "max_loss": r.max_loss}
    except Exception:
        return {"max_profit": None, "max_loss": None}


def _to_dec(v) -> Optional[Decimal]:
    return Decimal(str(round(v, 2))) if v is not None else None
