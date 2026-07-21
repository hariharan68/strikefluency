"""
app/services/eod_service.py
────────────────────────────
End-of-day and pre-market lifecycle jobs that give the app a real trading-day
rhythm:

  • square_off_intraday   — at 15:29 IST, close every OPEN INTRADAY position
                            (standalone orders + intraday strategies) at the
                            live closing price. NRML positions are skipped and
                            carry forward.
  • settle_expiring_options — at 15:29 IST, cash-settle standalone options that
                            expire today, regardless of product type (so a
                            carried-forward NRML option still settles at expiry).
                            Strategy expiries are handled by the existing
                            strategy_execution_service.auto_square_off_expiry.
  • premarket_reset       — at 08:30 IST, a safety net: force-close any INTRADAY
                            position still OPEN from a previous trading day (e.g.
                            the 15:29 job did not run) using the last stored LTP.

All three delegate the actual close to virtual_order_service.close_position /
strategy_execution_service.square_off, so margin release, P&L, journal entries,
and discipline effects flow automatically. They mirror the scan_and_exit
pattern: the caller owns the transaction (commit/rollback), users are re-loaded
per row with a cache, and OrderAlreadyClosedError is treated as a benign race.
"""

import logging
from datetime import date
from typing import Optional

from sqlalchemy.orm import Session

from app.core.constants import ExitReason, OrderStatus, ProductType
from app.core.exceptions import OrderAlreadyClosedError
from app.core.utils import current_trading_day, get_ist_now
from app.models.strategy import Strategy, StrategyPosition
from app.models.user import User
from app.models.virtual_order import VirtualOrder
from app.models.virtual_position import VirtualPosition
from app.services.strategy_execution_service import square_off
from app.services.virtual_order_service import close_position

logger = logging.getLogger(__name__)


def _load_user(db: Session, cache: dict, user_id) -> Optional[User]:
    """Re-load (and cache) the owning user — close_position needs it for scoping."""
    user = cache.get(user_id)
    if user is None:
        user = db.query(User).filter(User.id == user_id).first()
        if user is None:
            logger.warning("EOD: user %s not found, skipping", user_id)
            return None
        cache[user_id] = user
    return user


def square_off_intraday(db: Session, as_of: Optional[date] = None) -> int:
    """
    Close every OPEN INTRADAY position at the live price. Returns the count of
    positions closed (standalone orders + intraday strategies). The caller owns
    the commit.
    """
    user_cache: dict = {}
    closed = 0

    # ── Standalone INTRADAY orders (strategy legs handled below) ──
    orders = (
        db.query(VirtualOrder)
        .filter(
            VirtualOrder.status == OrderStatus.OPEN,
            VirtualOrder.product_type == ProductType.INTRADAY,
            VirtualOrder.strategy_id.is_(None),
        )
        .all()
    )
    for order in orders:
        user = _load_user(db, user_cache, order.user_id)
        if user is None:
            continue
        try:
            close_position(db, user, order.id, exit_reason=ExitReason.EOD_SQUAREOFF)
            closed += 1
        except OrderAlreadyClosedError:
            continue
        except Exception as e:
            logger.error("Intraday square-off failed for order %s: %s", order.id, e)

    # ── INTRADAY strategies (closes their mirrored legs too) ──
    positions = (
        db.query(StrategyPosition).filter(StrategyPosition.is_open == True).all()
    )
    for pos in positions:
        strat = db.query(Strategy).filter(Strategy.id == pos.strategy_id).first()
        if strat is None or strat.product_type != ProductType.INTRADAY:
            continue
        user = _load_user(db, user_cache, strat.user_id)
        if user is None:
            continue
        try:
            square_off(db, user, strat.id, reason=ExitReason.EOD_SQUAREOFF)
            closed += 1
        except Exception as e:
            logger.error("Intraday strategy square-off failed for %s: %s", strat.id, e)

    return closed


def settle_expiring_options(db: Session, as_of: Optional[date] = None) -> int:
    """
    Cash-settle standalone options that expire on/before `as_of` (default: today
    IST), regardless of product type. Ensures carried-forward NRML options do not
    live past expiry. Returns the count closed. Caller owns the commit.
    """
    as_of = as_of or get_ist_now().date()
    user_cache: dict = {}
    closed = 0

    orders = (
        db.query(VirtualOrder)
        .filter(
            VirtualOrder.status == OrderStatus.OPEN,
            VirtualOrder.strategy_id.is_(None),
            VirtualOrder.expiry_date <= as_of,
        )
        .all()
    )
    for order in orders:
        user = _load_user(db, user_cache, order.user_id)
        if user is None:
            continue
        try:
            close_position(db, user, order.id, exit_reason=ExitReason.EOD_SQUAREOFF)
            closed += 1
        except OrderAlreadyClosedError:
            continue
        except Exception as e:
            logger.error("Expiry settle failed for order %s: %s", order.id, e)

    return closed


def premarket_reset(db: Session, as_of: Optional[date] = None) -> int:
    """
    Safety net: close any INTRADAY position still OPEN from a *previous* trading
    day (the 15:29 square-off did not run). Uses the last stored position LTP,
    since there is no live market at 08:30. Idempotent — returns 0 when clean.
    Caller owns the commit.
    """
    tday = as_of or current_trading_day()
    user_cache: dict = {}
    closed = 0

    orders = (
        db.query(VirtualOrder)
        .filter(
            VirtualOrder.status == OrderStatus.OPEN,
            VirtualOrder.product_type == ProductType.INTRADAY,
            VirtualOrder.strategy_id.is_(None),
            VirtualOrder.trading_day < tday,
        )
        .all()
    )
    for order in orders:
        user = _load_user(db, user_cache, order.user_id)
        if user is None:
            continue
        position = (
            db.query(VirtualPosition)
            .filter(
                VirtualPosition.order_id == order.id,
                VirtualPosition.is_open == True,
            )
            .first()
        )
        exit_ltp = position.current_ltp if position else None
        try:
            close_position(
                db, user, order.id,
                exit_reason=ExitReason.EOD_SQUAREOFF, exit_ltp=exit_ltp,
            )
            closed += 1
            logger.info("Pre-market safety square-off: closed stale intraday order %s", order.id)
        except OrderAlreadyClosedError:
            continue
        except Exception as e:
            # No live market pre-open; the provider fetch may fail. Skip and retry
            # at the next EOD — never block startup / the pre-market job.
            logger.warning("Pre-market reset skipped order %s: %s", order.id, e)

    return closed
