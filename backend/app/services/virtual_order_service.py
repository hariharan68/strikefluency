"""
app/services/virtual_order_service.py
───────────────────────────────────────
Core virtual trading engine — place and close orders.
"""

import logging
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from app.config import settings
from app.core.constants import ExitReason, OrderStatus
from app.core.instruments import get_spec
from app.core.exceptions import (
    InsufficientBalanceError,
    MarketClosedError,
    OrderAlreadyClosedError,
    OrderNotFoundError,
)
from app.core.utils import calculate_pnl, is_market_open
from app.market.provider_factory import get_market_provider
from app.models.journal_entry import JournalEntry
from app.models.virtual_account import VirtualAccount
from app.models.virtual_order import VirtualOrder
from app.models.virtual_position import VirtualPosition
from app.models.user import User
from app.services.brokerage_calculator import calculate_brokerage
from app.services.discipline_engine import DisciplineEngine
from app.services.slippage_engine import calculate_slippage
from app.services.trading_session_service import (
    activate_cooldown,
    get_or_create_today,
    increment_trade_count,
    update_realized_pnl,
)

logger = logging.getLogger(__name__)


def place_order(db: Session, user: User, order_data: dict) -> VirtualOrder:
    """
    Place a new virtual order after running all discipline checks.

    order_data keys:
        instrument, expiry_date, strike_price, option_type,
        action, quantity, lot_size, sl_price, target_price, setup_tag
    """
    if not is_market_open() and not settings.is_development:
        raise MarketClosedError(
            "Market is closed. Orders only accepted between 09:15 and 15:30 IST."
        )

    account = db.query(VirtualAccount).filter(
        VirtualAccount.user_id == user.id
    ).first()

    session  = get_or_create_today(db, user)

    open_positions = db.query(VirtualPosition).filter(
        VirtualPosition.user_id == user.id,
        VirtualPosition.is_open == True,
    ).all()

    # ── Get current LTP from market provider ───────────────
    provider     = get_market_provider()
    instrument   = order_data["instrument"]
    strike_price = int(order_data["strike_price"])
    option_type  = order_data["option_type"]
    expiry_date  = order_data["expiry_date"]
    action       = order_data["action"]
    quantity     = int(order_data["quantity"])
    lot_size     = order_data.get("lot_size") or get_spec(instrument).lot_size

    chain = provider.get_option_chain(instrument)
    ltp, atm_strike = _get_ltp_from_chain(chain, strike_price, option_type)

    order_data["ltp"] = ltp

    # ── Run discipline engine ──────────────────────────────
    engine = DisciplineEngine(db, user)
    engine.check_order(order_data, session, account, open_positions)

    # ── Calculate fill price with slippage ─────────────────
    fill_price, slippage_points = calculate_slippage(
        ltp=ltp,
        strike=strike_price,
        atm_strike=atm_strike,
        action=action,
        instrument=instrument,
    )

    # ── Calculate margin (5x leverage) ────────────────────
    gross_value     = fill_price * Decimal(lot_size) * Decimal(quantity)
    margin_required = (gross_value / Decimal("5")).quantize(Decimal("0.01"))

    if account.balance < margin_required:
        raise InsufficientBalanceError(
            f"Insufficient balance. Required: ₹{margin_required}, "
            f"Available: ₹{account.balance}"
        )

    # ── Brokerage on entry ─────────────────────────────────
    entry_brokerage = calculate_brokerage(fill_price, quantity, lot_size, action)

    # ── Create order ───────────────────────────────────────
    order = VirtualOrder(
        id=uuid.uuid4(),
        user_id=user.id,
        tenant_id=user.tenant_id,
        account_id=account.id,
        instrument=instrument,
        expiry_date=expiry_date,
        strike_price=Decimal(str(strike_price)),
        option_type=option_type,
        action=action,
        quantity=quantity,
        lot_size=lot_size,
        entry_ltp=ltp,
        entry_price=fill_price,
        sl_price=Decimal(str(order_data["sl_price"])),
        target_price=Decimal(str(order_data["target_price"])) if order_data.get("target_price") else None,
        status=OrderStatus.OPEN,
        brokerage=entry_brokerage.total,
        slippage_points=slippage_points,
        setup_tag=order_data["setup_tag"],
        is_discipline_compliant=True,
    )
    db.add(order)
    db.flush()

    # ── Create position ────────────────────────────────────
    position = VirtualPosition(
        id=uuid.uuid4(),
        order_id=order.id,
        user_id=user.id,
        tenant_id=user.tenant_id,
        account_id=account.id,
        instrument=instrument,
        expiry_date=expiry_date,
        strike_price=Decimal(str(strike_price)),
        option_type=option_type,
        quantity=quantity,
        avg_entry_price=fill_price,
        current_ltp=ltp,
        unrealized_pnl=Decimal("0.00"),
        margin_blocked=margin_required,
        is_open=True,
    )
    db.add(position)

    # ── Deduct margin + update session ─────────────────────
    account.balance -= margin_required
    increment_trade_count(session)

    logger.info(
        f"Order placed: {instrument} {strike_price} {option_type} {action} "
        f"qty={quantity} fill=₹{fill_price} margin=₹{margin_required}"
    )

    return order


def close_position(
    db: Session,
    user: User,
    order_id: uuid.UUID,
    exit_reason: str = ExitReason.MANUAL,
    exit_ltp: Decimal = None,
) -> VirtualOrder:
    """Close an open position and calculate final P&L."""

    order = db.query(VirtualOrder).filter(
        VirtualOrder.id == order_id,
        VirtualOrder.user_id == user.id,
    ).first()

    if not order:
        raise OrderNotFoundError(f"Order {order_id} not found")

    if order.status != OrderStatus.OPEN:
        raise OrderAlreadyClosedError(f"Order {order_id} is already {order.status}")

    position = db.query(VirtualPosition).filter(
        VirtualPosition.order_id == order.id
    ).first()

    account = db.query(VirtualAccount).filter(
        VirtualAccount.user_id == user.id
    ).first()

    session = get_or_create_today(db, user)

    # ── Get exit LTP (one provider call, reused for both) ──
    provider = get_market_provider()
    chain    = provider.get_option_chain(order.instrument)

    if exit_ltp is None:
        exit_ltp, _ = _get_ltp_from_chain(
            chain, int(order.strike_price), order.option_type
        )

    _, atm_strike = _get_ltp_from_chain(
        chain, int(order.strike_price), order.option_type
    )

    # ── Exit fill price with slippage ──────────────────────
    exit_action = "SELL" if order.action == "BUY" else "BUY"
    exit_fill_price, _ = calculate_slippage(
        ltp=exit_ltp,
        strike=int(order.strike_price),
        atm_strike=atm_strike,
        action=exit_action,
        instrument=order.instrument,
    )

    # ── P&L calculation ────────────────────────────────────
    gross_pnl = calculate_pnl(
        action=order.action,
        entry_price=order.entry_price,
        exit_price=exit_fill_price,
        quantity=order.quantity,
        lot_size=order.lot_size,
    )

    exit_brokerage = calculate_brokerage(
        exit_fill_price, order.quantity, order.lot_size, exit_action
    )
    net_pnl = gross_pnl - exit_brokerage.total

    # ── Update order ───────────────────────────────────────
    if exit_reason == ExitReason.SL_HIT:
        order.status = OrderStatus.SL_HIT
    elif exit_reason == ExitReason.TARGET_HIT:
        order.status = OrderStatus.TARGET_HIT
    else:
        order.status = OrderStatus.CLOSED

    order.exit_price  = exit_fill_price
    order.exit_time   = datetime.now(timezone.utc)
    order.pnl         = net_pnl
    order.exit_reason = exit_reason
    order.brokerage  += exit_brokerage.total

    # ── Update position ────────────────────────────────────
    if position:
        position.is_open   = False
        position.closed_at = datetime.now(timezone.utc)
        position.current_ltp = exit_fill_price

    # ── Release margin + apply P&L to balance ─────────────
    margin_to_release = position.margin_blocked if position else Decimal("0")
    account.balance  += margin_to_release + net_pnl

    # ── Update session ─────────────────────────────────────
    update_realized_pnl(session, net_pnl)

    if exit_reason == ExitReason.SL_HIT:
        activate_cooldown(session)
        order.is_discipline_compliant = False

    # ── Discipline score ───────────────────────────────────
    engine = DisciplineEngine(db, user)
    engine.update_discipline_score(account, was_compliant=order.is_discipline_compliant)

    # ── Auto journal ───────────────────────────────────────
    _create_journal_entry(db, user, order, net_pnl, exit_reason)

    logger.info(
        f"Position closed: {order.instrument} {order.strike_price} "
        f"{order.option_type} P&L=₹{net_pnl} reason={exit_reason}"
    )

    return order


def get_open_positions(db: Session, user: User) -> list:
    return db.query(VirtualPosition).filter(
        VirtualPosition.user_id == user.id,
        VirtualPosition.is_open == True,
    ).all()


def update_position_ltp(
    db: Session, order_id: uuid.UUID, new_ltp: Decimal
) -> None:
    """Update live LTP and unrealized P&L on an open position."""
    position = db.query(VirtualPosition).filter(
        VirtualPosition.order_id == order_id,
        VirtualPosition.is_open == True,
    ).first()

    if not position:
        return

    order = db.query(VirtualOrder).filter(VirtualOrder.id == order_id).first()
    if not order:
        return

    position.current_ltp    = new_ltp
    position.unrealized_pnl = calculate_pnl(
        action=order.action,
        entry_price=order.entry_price,
        exit_price=new_ltp,
        quantity=order.quantity,
        lot_size=order.lot_size,
    )


# ── Private helpers ───────────────────────────────────────────

def _get_ltp_from_chain(
    chain: dict, strike: int, option_type: str
) -> tuple:
    """Extract LTP for a specific strike from the option chain. Returns (ltp, atm_strike)."""
    atm_strike = chain.get("atm_strike", strike)

    for strike_data in chain.get("strikes", []):
        if strike_data["strike"] == strike:
            side = "ce" if option_type == "CE" else "pe"
            ltp  = Decimal(str(strike_data[side].get("ltp", 0)))
            return ltp, atm_strike

    spot = Decimal(str(chain.get("spot_price", 100)))
    return spot, atm_strike


def _create_journal_entry(
    db: Session, user: User, order: VirtualOrder,
    pnl: Decimal, exit_reason: str,
) -> None:
    """Auto-create journal entry on trade close."""
    try:
        entry_time = order.entry_time
        exit_time  = order.exit_time or datetime.now(timezone.utc)
        duration   = int((exit_time - entry_time).total_seconds() / 60)

        journal = JournalEntry(
            order_id=order.id,
            user_id=user.id,
            tenant_id=user.tenant_id,
            entry_price=order.entry_price,
            exit_price=order.exit_price,
            pnl=pnl,
            brokerage=order.brokerage,
            setup_tag=order.setup_tag,
            exit_reason=exit_reason,
            is_discipline_compliant=order.is_discipline_compliant,
            duration_minutes=duration,
            trade_date=date.today(),
        )
        db.add(journal)
    except Exception as e:
        logger.error(f"Journal entry creation failed: {e}")