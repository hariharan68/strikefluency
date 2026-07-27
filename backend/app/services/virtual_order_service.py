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
from app.core.constants import ExitReason, LEVERAGE_MULTIPLIER, OrderStatus, ProductType
from app.core.instruments import get_spec
from app.core.exceptions import (
    IdempotencyConflictError,
    InsufficientBalanceError,
    MarketClosedError,
    OrderAlreadyClosedError,
    OrderNotFoundError,
    QuoteUnavailableError,
)
from app.core.utils import calculate_pnl, current_trading_day, is_market_open
from app.market import freshness
from app.market.provider_factory import get_market_provider
from app.models.journal_entry import JournalEntry
from app.models.virtual_account import VirtualAccount
from app.models.virtual_order import VirtualOrder
from app.models.virtual_position import VirtualPosition
from app.models.user import User
from app.models.user_settings import UserSettings
from app.services.brokerage_calculator import calculate_brokerage
from app.services.discipline_engine import DisciplineEngine
from app.services import ledger_service
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

    # The account is the per-user serialization point for every balance,
    # session and order mutation. The lock is held until the router commits.
    account = db.query(VirtualAccount).filter(
        VirtualAccount.user_id == user.id
    ).with_for_update().first()

    client_order_id = order_data.get("client_order_id")
    if client_order_id is not None:
        client_order_id = uuid.UUID(str(client_order_id))
        existing = db.query(VirtualOrder).filter(
            VirtualOrder.user_id == user.id,
            VirtualOrder.client_order_id == client_order_id,
        ).first()
        if existing is not None:
            if not _matches_idempotent_payload(existing, order_data):
                raise IdempotencyConflictError(
                    f"Client order ID {client_order_id} was already used "
                    "for a different order."
                )
            existing._idempotent_replay = True
            return existing

    session = get_or_create_today(db, user, for_update=True)

    open_positions = db.query(VirtualPosition).filter(
        VirtualPosition.user_id == user.id,
        VirtualPosition.is_open == True,
    ).with_for_update().all()

    # ── Get current LTP from market provider ───────────────
    provider     = get_market_provider()
    instrument   = order_data["instrument"]
    strike_price = int(order_data["strike_price"])
    option_type  = order_data["option_type"]
    expiry_date  = order_data["expiry_date"]
    action       = order_data["action"]
    quantity     = int(order_data["quantity"])
    lot_size     = order_data.get("lot_size") or get_spec(instrument).lot_size
    product_type = order_data.get("product_type") or ProductType.INTRADAY

    try:
        chain = provider.get_option_chain(instrument)
        # The provider's own check first, where it is stricter (Kite demands a
        # tick under 30s old because it has a live feed), then the shared
        # backstop that every provider is held to.
        provider_check = getattr(provider, "assert_orderable", None)
        if callable(provider_check):
            provider_check(chain)
        freshness.assert_orderable(chain, instrument=instrument)
    except RuntimeError as exc:
        raise QuoteUnavailableError(str(exc)) from exc
    ltp, atm_strike = _get_ltp_from_chain(chain, strike_price, option_type)
    if ltp is None:
        raise QuoteUnavailableError(
            f"No tradable quote for {instrument} {strike_price} {option_type} — "
            f"the strike is outside the current chain. Pick a strike from the chain."
        )

    order_data["ltp"] = ltp

    # ── Run discipline engine (skipped in free-play mode) ──
    free_play = not account.discipline_mode_enabled
    if not free_play:
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

    # ── Calculate margin ──────────────────────────────────
    # Per-user leverage setting: ON → block leveraged margin (contract / 5x);
    # OFF → block the full contract value (1x) from the sandbox funds.
    settings_row = db.query(UserSettings).filter(
        UserSettings.user_id == user.id
    ).first()
    leverage_enabled = (settings_row.data or {}).get("leverage_enabled", True) if settings_row else True
    leverage = LEVERAGE_MULTIPLIER if leverage_enabled else 1

    gross_value     = fill_price * Decimal(lot_size) * Decimal(quantity)
    margin_required = (gross_value / Decimal(leverage)).quantize(Decimal("0.01"))

    # ── Brokerage on entry ─────────────────────────────────
    # Computed before the affordability check: entry brokerage is debited from
    # the balance alongside the margin, so the check must cover both. Checking
    # margin alone lets an order at the boundary drive the balance negative,
    # which trips ck_virtual_accounts_balance_non_negative at the router's
    # commit — an IntegrityError 500 instead of this clean 400.
    entry_brokerage = calculate_brokerage(fill_price, quantity, lot_size, action)

    total_required = margin_required + entry_brokerage.total

    if account.balance < total_required:
        raise InsufficientBalanceError(
            f"Insufficient balance. Required: ₹{total_required} "
            f"(margin ₹{margin_required} + brokerage ₹{entry_brokerage.total}), "
            f"Available: ₹{account.balance}"
        )

    # ── Create order ───────────────────────────────────────
    # SL / setup tag may be absent in free-play mode (the engine that requires
    # them is skipped). setup_tag is NOT NULL, so default it to OTHER.
    sl_raw = order_data.get("sl_price")
    order = VirtualOrder(
        id=uuid.uuid4(),
        user_id=user.id,
        tenant_id=user.tenant_id,
        account_id=account.id,
        client_order_id=client_order_id,
        instrument=instrument,
        expiry_date=expiry_date,
        strike_price=Decimal(str(strike_price)),
        option_type=option_type,
        action=action,
        quantity=quantity,
        lot_size=lot_size,
        entry_ltp=ltp,
        entry_price=fill_price,
        sl_price=_optional_decimal(sl_raw),
        target_price=_optional_decimal(order_data.get("target_price")),
        status=OrderStatus.OPEN,
        product_type=product_type,
        trading_day=current_trading_day(),
        brokerage=entry_brokerage.total,
        entry_brokerage=entry_brokerage.total,
        slippage_points=slippage_points,
        setup_tag=order_data.get("setup_tag") or "OTHER",
        is_discipline_compliant=True,
        was_free_play=free_play,
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

    # ── Deduct margin + charge entry brokerage + update session ──
    ledger_service.block_margin(
        db, account, margin_required,
        reference_type=ledger_service.LedgerRef.VIRTUAL_ORDER,
        reference_id=order.id,
        description=f"Margin blocked: {instrument} {strike_price} {option_type} {action}",
    )
    # Charged at entry, not netted into `pnl`. `pnl` deducts only the exit leg
    # (close_position), so adding the entry leg there as well would charge it
    # twice. Reporting reads `pnl - entry_brokerage` for the round-trip net.
    ledger_service.charge(
        db, account, entry_brokerage.total,
        reference_type=ledger_service.LedgerRef.VIRTUAL_ORDER,
        reference_id=order.id,
        description=f"Entry brokerage: {instrument} {strike_price} {option_type} {action}",
    )
    increment_trade_count(session)
    order._idempotent_replay = False

    logger.info(
        f"Order placed: {instrument} {strike_price} {option_type} {action} "
        f"qty={quantity} fill=₹{fill_price} margin=₹{margin_required} "
        f"brokerage=₹{entry_brokerage.total}"
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

    # Lock in the same order as placement: account -> order -> position ->
    # session. This serializes manual, SL/target and EOD close attempts and
    # prevents balance/P&L/margin from being applied twice.
    account = db.query(VirtualAccount).filter(
        VirtualAccount.user_id == user.id
    ).with_for_update().first()

    order = db.query(VirtualOrder).filter(
        VirtualOrder.id == order_id,
        VirtualOrder.user_id == user.id,
    ).with_for_update().first()

    if not order:
        raise OrderNotFoundError(f"Order {order_id} not found")

    if order.status != OrderStatus.OPEN:
        raise OrderAlreadyClosedError(f"Order {order_id} is already {order.status}")

    position = db.query(VirtualPosition).filter(
        VirtualPosition.order_id == order.id
    ).with_for_update().first()

    session = get_or_create_today(db, user, for_update=True)

    # ── Get exit LTP (one provider call, reused for both) ──
    provider = get_market_provider()
    chain    = provider.get_option_chain(order.instrument)

    quoted, atm_strike = _get_ltp_from_chain(
        chain, int(order.strike_price), order.option_type
    )
    if exit_ltp is None:
        exit_ltp = quoted
    if exit_ltp is None:
        # Strike no longer in the chain window — exit at the last stored mark
        # (never at spot). The user must always be able to close a position.
        exit_ltp = position.current_ltp if position else order.entry_ltp

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
    # Posted as two rows rather than one combined movement: a statement line
    # reading "+1113.19 margin released" then "-42.60 P&L" is legible, whereas
    # a single net figure explains nothing.
    margin_to_release = position.margin_blocked if position else Decimal("0")
    if margin_to_release:
        ledger_service.release_margin(
            db, account, margin_to_release,
            reference_type=ledger_service.LedgerRef.VIRTUAL_ORDER,
            reference_id=order.id,
            description=f"Margin released: {order.instrument} {order.strike_price} {order.option_type}",
        )
    ledger_service.settle_pnl(
        db, account, net_pnl,
        reference_type=ledger_service.LedgerRef.VIRTUAL_ORDER,
        reference_id=order.id,
        description=f"Realised P&L ({exit_reason}): {order.instrument} {order.strike_price} {order.option_type}",
    )

    # ── Update session ─────────────────────────────────────
    update_realized_pnl(session, net_pnl)

    # Free-play trades never trigger a cooldown or touch the discipline score —
    # the rules were off when they were placed.
    if not order.was_free_play:
        if exit_reason == ExitReason.SL_HIT:
            activate_cooldown(session)
            order.is_discipline_compliant = False

        # ── Discipline score ───────────────────────────────
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

def _optional_decimal(value) -> Decimal | None:
    return Decimal(str(value)) if value is not None else None


def _matches_idempotent_payload(order: VirtualOrder, order_data: dict) -> bool:
    """
    A client order ID identifies one immutable order intent. Market-derived
    fields (quote, fill and slippage) are intentionally excluded: a replay must
    return the original fill instead of re-pricing the order.
    """
    instrument = order_data["instrument"]
    expected_lot_size = order_data.get("lot_size") or get_spec(instrument).lot_size
    return all((
        order.instrument == instrument,
        order.expiry_date == order_data["expiry_date"],
        order.strike_price == Decimal(str(order_data["strike_price"])),
        order.option_type == order_data["option_type"],
        order.action == order_data["action"],
        order.quantity == int(order_data["quantity"]),
        order.lot_size == int(expected_lot_size),
        order.product_type == (order_data.get("product_type") or ProductType.INTRADAY),
        order.sl_price == _optional_decimal(order_data.get("sl_price")),
        order.target_price == _optional_decimal(order_data.get("target_price")),
        order.setup_tag == (order_data.get("setup_tag") or "OTHER"),
    ))


def _get_ltp_from_chain(
    chain: dict, strike: int, option_type: str
) -> tuple:
    """
    Extract LTP for a specific strike from the option chain.
    Returns (ltp, atm_strike); ltp is None when the strike is not in the chain.

    Never falls back to spot: an index level is thousands of points away from an
    option premium, so treating it as the LTP corrupts P&L and can falsely
    trigger SL/target exits. Callers decide their own safe fallback.
    """
    atm_strike = chain.get("atm_strike", strike)

    for strike_data in chain.get("strikes", []):
        if strike_data["strike"] == strike:
            side = "ce" if option_type == "CE" else "pe"
            ltp  = Decimal(str(strike_data[side].get("ltp", 0)))
            return (ltp if ltp > 0 else None), atm_strike

    return None, atm_strike


def _create_journal_entry(
    db: Session, user: User, order: VirtualOrder,
    pnl: Decimal, exit_reason: str,
) -> None:
    """Auto-create journal entry on trade close."""
    try:
        # entry_time comes from the DB (naive), exit_time is set as aware UTC.
        # Normalize both to UTC-aware so the subtraction never raises.
        entry_time = order.entry_time
        exit_time  = order.exit_time or datetime.now(timezone.utc)
        if entry_time.tzinfo is None:
            entry_time = entry_time.replace(tzinfo=timezone.utc)
        if exit_time.tzinfo is None:
            exit_time = exit_time.replace(tzinfo=timezone.utc)
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
