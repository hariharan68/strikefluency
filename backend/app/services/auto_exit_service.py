"""
app/services/auto_exit_service.py
──────────────────────────────────
Discipline-aware auto-exit worker.

A stop-loss or target on a VirtualOrder is only a promise until something
enforces it. This scanner runs on the market scheduler and closes any open
order whose current option premium has crossed its sl_price / target_price —
whether or not the user is watching the desk.

It delegates the actual close to virtual_order_service.close_position(), so all
the existing consequences flow automatically:
  • SL_HIT   → revenge-trading cooldown + discipline score update
  • TARGET_HIT → clean book, no cooldown
  • was_free_play orders → auto-exit with NO cooldown / score impact

Trigger semantics (premium-based, per leg direction):
  BUY  option (long premium):  SL when ltp <= sl_price,  TGT when ltp >= target_price
  SELL option (short premium): SL when ltp >= sl_price,  TGT when ltp <= target_price

When both SL and target are crossed in the same tick (a gap), SL wins — the
conservative, discipline-consistent choice.
"""

import logging
from collections import defaultdict

from sqlalchemy.orm import Session

from app.core.constants import ExitReason, OrderStatus
from app.core.exceptions import OrderAlreadyClosedError
from app.market.provider_factory import get_market_provider
from app.models.user import User
from app.models.virtual_order import VirtualOrder
from app.services.virtual_order_service import _get_ltp_from_chain, close_position

logger = logging.getLogger(__name__)


def _decide_exit(order: VirtualOrder, ltp) -> str | None:
    """
    Return the ExitReason if this order's SL/target is crossed at `ltp`,
    else None. SL takes priority over target on a same-tick gap.
    """
    sl = order.sl_price
    tgt = order.target_price

    if order.action == "BUY":
        if sl is not None and ltp <= sl:
            return ExitReason.SL_HIT
        if tgt is not None and ltp >= tgt:
            return ExitReason.TARGET_HIT
    else:  # SELL — short the option, loss when premium rises
        if sl is not None and ltp >= sl:
            return ExitReason.SL_HIT
        if tgt is not None and ltp <= tgt:
            return ExitReason.TARGET_HIT

    return None


def scan_and_exit(db: Session) -> int:
    """
    Scan every open order carrying an SL or target and auto-close the ones
    whose premium has crossed a level. Returns the number of orders closed.

    The caller owns the transaction (commit/rollback) — mirrors the
    _mtm_tick pattern in market_scheduler.py.
    """
    orders = (
        db.query(VirtualOrder)
        .filter(
            VirtualOrder.status == OrderStatus.OPEN,
            (VirtualOrder.sl_price.isnot(None)) | (VirtualOrder.target_price.isnot(None)),
        )
        .all()
    )

    if not orders:
        return 0

    # One option-chain fetch per instrument, reused across its orders.
    by_instrument: dict[str, list[VirtualOrder]] = defaultdict(list)
    for order in orders:
        by_instrument[order.instrument].append(order)

    provider = get_market_provider()
    user_cache: dict = {}
    closed = 0

    for instrument, instr_orders in by_instrument.items():
        try:
            chain = provider.get_option_chain(instrument)
        except Exception as e:
            logger.error("Auto-exit: chain fetch failed for %s: %s", instrument, e)
            continue

        for order in instr_orders:
            ltp, _ = _get_ltp_from_chain(chain, int(order.strike_price), order.option_type)

            reason = _decide_exit(order, ltp)
            if reason is None:
                continue

            # Re-load the owning user (close_position needs it for scoping).
            user = user_cache.get(order.user_id)
            if user is None:
                user = db.query(User).filter(User.id == order.user_id).first()
                if user is None:
                    logger.warning("Auto-exit: user %s not found, skipping", order.user_id)
                    continue
                user_cache[order.user_id] = user

            try:
                close_position(
                    db, user, order.id, exit_reason=reason, exit_ltp=ltp
                )
                closed += 1
                logger.info(
                    "Auto-exit %s: %s %s%s %s @ premium ₹%s",
                    reason, order.instrument, int(order.strike_price),
                    order.option_type, order.action, ltp,
                )
            except OrderAlreadyClosedError:
                # Closed manually between query and action — benign race, skip.
                continue
            except Exception as e:
                logger.error("Auto-exit failed for order %s: %s", order.id, e)

    return closed
