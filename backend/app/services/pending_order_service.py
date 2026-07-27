"""
app/services/pending_order_service.py
──────────────────────────────────────
Resting LIMIT orders — the "Open Pending" book.

A MARKET order is a decision made now, so it becomes a VirtualOrder now. A LIMIT
order is a decision about a price that has not happened yet, so it rests here as
a PendingOrder until the option premium reaches the limit. Only then does the
fill scanner call virtual_order_service.place_order() and create the real order
and position — which means every downstream system (orderbook, auto-exit, EOD
square-off, journal, analytics) keeps working on VirtualOrder untouched.

Trigger semantics (premium-based, per side):
  BUY  limit → fills when ltp <= limit_price   (buy at the limit or cheaper)
  SELL limit → fills when ltp >= limit_price   (sell at the limit or richer)

Funds: margin is blocked at placement and released the moment the order leaves
PENDING (fill, cancel, expiry, rejection), so a resting order can never promise
capital the account does not have.

Discipline: the rules run at placement AND again when the limit triggers. A
pending order that would breach a cooldown or trade limit set in the meantime is
REJECTED at fill with the rule's message stored on the row, never filled quietly.
"""

import logging
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal
from typing import Callable, Optional

from sqlalchemy.orm import Session

from app.config import settings
from app.core.constants import (
    LEVERAGE_MULTIPLIER,
    PendingOrderStatus,
    ProductType,
)
from app.core.exceptions import (
    DisciplineViolationError,
    IdempotencyConflictError,
    InsufficientBalanceError,
    MarketClosedError,
    PendingOrderNotCancellableError,
    PendingOrderNotFoundError,
    QuoteUnavailableError,
)
from app.core.instruments import get_spec
from app.core.utils import current_trading_day, is_market_open
from app.market.provider_factory import get_market_provider
from app.models.pending_order import PendingOrder
from app.models.user import User
from app.models.user_settings import UserSettings
from app.models.virtual_account import VirtualAccount
from app.models.virtual_position import VirtualPosition
from app.services.discipline_engine import DisciplineEngine
from app.services.trading_session_service import get_or_create_today
from app.services.virtual_order_service import _get_ltp_from_chain, place_order

logger = logging.getLogger(__name__)


# ── Placement ─────────────────────────────────────────────────

def place_pending_order(db: Session, user: User, order_data: dict) -> PendingOrder:
    """
    Park a LIMIT order in the pending book after running the discipline checks
    and blocking margin. The caller owns the commit.

    order_data keys: instrument, expiry_date, strike_price, option_type, action,
    quantity, lot_size, product_type, limit_price, sl_price, target_price,
    setup_tag, client_order_id
    """
    if not is_market_open() and not settings.is_development:
        raise MarketClosedError(
            "Market is closed. Orders only accepted between 09:15 and 15:30 IST."
        )

    # Same lock ordering as place_order: account first, always.
    account = db.query(VirtualAccount).filter(
        VirtualAccount.user_id == user.id
    ).with_for_update().first()

    client_order_id = order_data.get("client_order_id")
    if client_order_id is not None:
        client_order_id = uuid.UUID(str(client_order_id))
        existing = db.query(PendingOrder).filter(
            PendingOrder.user_id == user.id,
            PendingOrder.client_order_id == client_order_id,
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

    instrument   = order_data["instrument"]
    strike_price = int(order_data["strike_price"])
    option_type  = order_data["option_type"]
    limit_price  = _money(order_data["limit_price"])
    quantity     = int(order_data["quantity"])
    lot_size     = order_data.get("lot_size") or get_spec(instrument).lot_size
    product_type = order_data.get("product_type") or ProductType.INTRADAY

    # The strike must be quotable now, even though we are not filling now — a
    # limit resting on a strike outside the chain could never trigger.
    provider = get_market_provider()
    try:
        chain = provider.get_option_chain(instrument)
        assert_orderable = getattr(provider, "assert_orderable", None)
        if callable(assert_orderable):
            assert_orderable(chain)
    except RuntimeError as exc:
        raise QuoteUnavailableError(str(exc)) from exc

    placed_ltp, _atm = _get_ltp_from_chain(chain, strike_price, option_type)
    if placed_ltp is None:
        raise QuoteUnavailableError(
            f"No tradable quote for {instrument} {strike_price} {option_type} — "
            f"the strike is outside the current chain. Pick a strike from the chain."
        )

    # ── Discipline pass 1 (skipped in free-play mode) ──────
    # The SL rule compares against order_data["ltp"]; for a resting limit the
    # meaningful reference is the price this order will actually enter at, so
    # the limit is passed as the LTP rather than the current market premium.
    free_play = not account.discipline_mode_enabled
    if not free_play:
        engine = DisciplineEngine(db, user)
        engine.check_order(
            {**order_data, "ltp": limit_price}, session, account, open_positions
        )

    # ── Block margin at placement ──────────────────────────
    # Priced off the limit, not the market: that is the price this order has
    # committed to pay, and it is what the fill will cost at worst.
    margin_required = _margin_for(db, user, limit_price, lot_size, quantity)

    if account.balance < margin_required:
        raise InsufficientBalanceError(
            f"Insufficient balance. Required: ₹{margin_required}, "
            f"Available: ₹{account.balance}"
        )

    pending = PendingOrder(
        id=uuid.uuid4(),
        user_id=user.id,
        tenant_id=user.tenant_id,
        account_id=account.id,
        client_order_id=client_order_id,
        instrument=instrument,
        expiry_date=order_data["expiry_date"],
        strike_price=Decimal(str(strike_price)),
        option_type=option_type,
        action=order_data["action"],
        quantity=quantity,
        lot_size=lot_size,
        product_type=product_type,
        limit_price=limit_price,
        placed_ltp=placed_ltp,
        sl_price=_optional_money(order_data.get("sl_price")),
        target_price=_optional_money(order_data.get("target_price")),
        setup_tag=order_data.get("setup_tag") or "OTHER",
        status=PendingOrderStatus.PENDING,
        margin_blocked=margin_required,
        trading_day=current_trading_day(),
    )
    db.add(pending)
    db.flush()

    account.balance -= margin_required
    pending._idempotent_replay = False

    logger.info(
        "Limit order parked: %s %s %s %s qty=%s limit=₹%s (ltp ₹%s) margin=₹%s",
        instrument, strike_price, option_type, pending.action,
        quantity, limit_price, placed_ltp, margin_required,
    )

    return pending


# ── Cancellation ──────────────────────────────────────────────

def cancel_pending_order(db: Session, user: User, pending_id: uuid.UUID) -> PendingOrder:
    """Withdraw a resting limit order and release its margin. Caller commits."""
    account = db.query(VirtualAccount).filter(
        VirtualAccount.user_id == user.id
    ).with_for_update().first()

    pending = db.query(PendingOrder).filter(
        PendingOrder.id == pending_id,
        PendingOrder.user_id == user.id,
    ).with_for_update().first()

    if not pending:
        raise PendingOrderNotFoundError(f"Pending order {pending_id} not found")

    if pending.status != PendingOrderStatus.PENDING:
        raise PendingOrderNotCancellableError(
            f"Pending order {pending_id} is already {pending.status}"
        )

    released = _close_pending(pending, PendingOrderStatus.CANCELLED)
    account.balance += released
    # The row's reservation is zeroed by now, so carry the amount out-of-band
    # for the response rather than making the caller re-derive it.
    pending._released_margin = released

    logger.info(
        "Limit order cancelled: %s %s %s — ₹%s margin released",
        pending.instrument, int(pending.strike_price), pending.option_type, released,
    )
    return pending


# ── Fill scanner ──────────────────────────────────────────────

def scan_and_fill(db: Session,
                  on_fill: Optional[Callable[[object, str], None]] = None) -> int:
    """
    Scan every resting limit order and fill the ones whose premium has reached
    the limit. Returns the number filled.

    Unlike scan_and_exit, this function OWNS its transaction and commits per
    order. A fill runs the discipline engine a second time, and a rejection must
    persist (status + released margin) without discarding the fills that already
    succeeded in the same sweep — which a single batch transaction cannot do.

    on_fill(user_id, reason) is invoked after each committed fill or rejection so
    the caller can notify that user. Callback errors are swallowed.
    """
    pendings = (
        db.query(PendingOrder)
        .filter(PendingOrder.status == PendingOrderStatus.PENDING)
        .all()
    )

    if not pendings:
        return 0

    # One option-chain fetch per instrument, reused across its orders.
    by_instrument: dict[str, list[PendingOrder]] = defaultdict(list)
    for pending in pendings:
        by_instrument[pending.instrument].append(pending)

    provider = get_market_provider()
    filled = 0

    for instrument, instr_pendings in by_instrument.items():
        try:
            chain = provider.get_option_chain(instrument)
        except Exception as e:
            logger.error("Limit fill: chain fetch failed for %s: %s", instrument, e)
            continue

        for pending in instr_pendings:
            ltp, _atm = _get_ltp_from_chain(
                chain, int(pending.strike_price), pending.option_type
            )
            if ltp is None:
                # Strike outside the current chain window — no quote to compare
                # the limit against. Leave it resting.
                continue

            if not _is_triggered(pending, ltp):
                continue

            pending_id = pending.id
            user_id = pending.user_id
            try:
                _fill_one(db, pending_id, ltp)
                db.commit()
                filled += 1
                _notify(on_fill, user_id, "limit_filled")
            except (DisciplineViolationError, InsufficientBalanceError,
                    QuoteUnavailableError, MarketClosedError) as e:
                # A legitimate refusal: record why, release the funds, move on.
                db.rollback()
                message = getattr(e, "message", None) or str(e)
                try:
                    _reject_one(db, pending_id, message)
                    db.commit()
                    _notify(on_fill, user_id, "limit_rejected")
                except Exception as inner:
                    db.rollback()
                    logger.error(
                        "Limit fill: could not record rejection for %s: %s",
                        pending_id, inner,
                    )
            except Exception as e:
                # Unexpected failure — leave the order resting and retry next tick.
                db.rollback()
                logger.error("Limit fill failed for pending order %s: %s", pending_id, e)

    return filled


def _fill_one(db: Session, pending_id: uuid.UUID, ltp: Decimal) -> None:
    """
    Turn one triggered pending order into a real VirtualOrder, inside the
    caller's transaction. Raises on any refusal so the caller can reject it.
    """
    pending = db.query(PendingOrder).filter(
        PendingOrder.id == pending_id
    ).with_for_update().first()

    # Re-read under the lock: a user cancel may have landed since the scan.
    if pending is None or pending.status != PendingOrderStatus.PENDING:
        return

    user = db.query(User).filter(User.id == pending.user_id).first()
    if user is None:
        raise RuntimeError(f"User {pending.user_id} not found for pending order {pending_id}")

    account = db.query(VirtualAccount).filter(
        VirtualAccount.user_id == pending.user_id
    ).with_for_update().first()

    # Release the reservation first — place_order blocks its own margin from the
    # live fill price, and must not be charged twice for the same order.
    reserved = pending.margin_blocked or Decimal("0.00")
    account.balance += reserved
    pending.margin_blocked = Decimal("0.00")

    order = place_order(db, user, {
        "client_order_id": pending.client_order_id,
        "instrument":   pending.instrument,
        "expiry_date":  pending.expiry_date,
        "strike_price": int(pending.strike_price),
        "option_type":  pending.option_type,
        "action":       pending.action,
        "quantity":     pending.quantity,
        "lot_size":     pending.lot_size,
        "product_type": pending.product_type,
        "sl_price":     pending.sl_price,
        "target_price": pending.target_price,
        "setup_tag":    pending.setup_tag,
    })
    db.flush()

    pending.status = PendingOrderStatus.FILLED
    pending.filled_order_id = order.id
    pending.fill_price = order.entry_price
    pending.filled_at = datetime.now(timezone.utc)
    pending.closed_at = pending.filled_at

    logger.info(
        "Limit order FILLED: %s %s %s %s limit=₹%s premium=₹%s fill=₹%s",
        pending.instrument, int(pending.strike_price), pending.option_type,
        pending.action, pending.limit_price, ltp, order.entry_price,
    )


def _reject_one(db: Session, pending_id: uuid.UUID, reason: str) -> None:
    """Mark a triggered-but-refused order REJECTED and give the funds back."""
    pending = db.query(PendingOrder).filter(
        PendingOrder.id == pending_id
    ).with_for_update().first()

    if pending is None or pending.status != PendingOrderStatus.PENDING:
        return

    account = db.query(VirtualAccount).filter(
        VirtualAccount.user_id == pending.user_id
    ).with_for_update().first()

    released = _close_pending(pending, PendingOrderStatus.REJECTED, reason=reason)
    if account is not None:
        account.balance += released

    logger.info(
        "Limit order REJECTED at trigger: %s %s %s — %s",
        pending.instrument, int(pending.strike_price), pending.option_type, reason,
    )


# ── Expiry (DAY validity) ─────────────────────────────────────

def expire_pending_orders(db: Session, before_trading_day=None) -> int:
    """
    Expire resting limit orders and release their margin. Limit orders are DAY
    validity: anything unfilled when the bell rings is gone.

    Called at EOD with no argument (expire everything still resting), and at the
    pre-market reset with today's trading day (a safety net that clears orders
    stranded from a previous session without touching today's).

    Returns the count expired. The caller owns the commit.
    """
    query = db.query(PendingOrder).filter(
        PendingOrder.status == PendingOrderStatus.PENDING
    )
    if before_trading_day is not None:
        query = query.filter(PendingOrder.trading_day < before_trading_day)

    pendings = query.with_for_update().all()
    if not pendings:
        return 0

    # One account lock per user, reused across that user's orders.
    accounts: dict = {}
    for pending in pendings:
        account = accounts.get(pending.user_id)
        if account is None:
            account = db.query(VirtualAccount).filter(
                VirtualAccount.user_id == pending.user_id
            ).with_for_update().first()
            accounts[pending.user_id] = account

        released = _close_pending(pending, PendingOrderStatus.EXPIRED)
        if account is not None:
            account.balance += released

    logger.info("Expired %d unfilled limit order(s), margin released", len(pendings))
    return len(pendings)


# ── Private helpers ───────────────────────────────────────────

def _is_triggered(pending: PendingOrder, ltp: Decimal) -> bool:
    """
    A BUY limit wants to pay no more than the limit; a SELL limit wants to
    receive no less. An order placed at or through the market is marketable and
    triggers on the very next scan — correct, and visible as a fill either way.
    """
    if pending.action == "BUY":
        return ltp <= pending.limit_price
    return ltp >= pending.limit_price


def _close_pending(pending: PendingOrder, status: str, reason: str | None = None) -> Decimal:
    """
    Move a pending order to a terminal state and zero its reservation.
    Returns the margin amount the caller must credit back to the account.
    """
    released = pending.margin_blocked or Decimal("0.00")
    pending.status = status
    pending.margin_blocked = Decimal("0.00")
    pending.closed_at = datetime.now(timezone.utc)
    if reason:
        pending.reject_reason = reason[:300]
    return released


def _margin_for(db: Session, user: User, price: Decimal,
                lot_size: int, quantity: int) -> Decimal:
    """Margin for a contract at `price`, honouring the user's leverage setting."""
    settings_row = db.query(UserSettings).filter(
        UserSettings.user_id == user.id
    ).first()
    leverage_enabled = (settings_row.data or {}).get("leverage_enabled", True) if settings_row else True
    leverage = LEVERAGE_MULTIPLIER if leverage_enabled else 1

    gross_value = Decimal(str(price)) * Decimal(lot_size) * Decimal(quantity)
    return (gross_value / Decimal(leverage)).quantize(Decimal("0.01"))


def _money(value) -> Decimal:
    """
    Round to the 2dp the price columns actually store.

    Without this, a limit of 26.9625 is persisted as 26.96 but compared against
    the raw 26.9625 on replay, so an honest retry looks like a different order
    and 409s. Quantize on the way in and every comparison is against what the
    database really holds.
    """
    return Decimal(str(value)).quantize(Decimal("0.01"))


def _optional_money(value) -> Decimal | None:
    return _money(value) if value is not None else None


def _notify(callback, user_id, reason: str) -> None:
    if callback is None:
        return
    try:
        callback(user_id, reason)
    except Exception:
        pass


def _matches_idempotent_payload(pending: PendingOrder, order_data: dict) -> bool:
    """
    A client order ID identifies one immutable order intent. Unlike a market
    order there is no fill to preserve, but the resting terms must match exactly
    or the replay is a different order wearing the same ID.
    """
    instrument = order_data["instrument"]
    expected_lot_size = order_data.get("lot_size") or get_spec(instrument).lot_size
    return all((
        pending.instrument == instrument,
        pending.expiry_date == order_data["expiry_date"],
        pending.strike_price == Decimal(str(order_data["strike_price"])),
        pending.option_type == order_data["option_type"],
        pending.action == order_data["action"],
        pending.quantity == int(order_data["quantity"]),
        pending.lot_size == int(expected_lot_size),
        pending.product_type == (order_data.get("product_type") or ProductType.INTRADAY),
        pending.limit_price == _money(order_data["limit_price"]),
        pending.sl_price == _optional_money(order_data.get("sl_price")),
        pending.target_price == _optional_money(order_data.get("target_price")),
        pending.setup_tag == (order_data.get("setup_tag") or "OTHER"),
    ))
