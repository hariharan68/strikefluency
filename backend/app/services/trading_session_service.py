"""
app/services/trading_session_service.py
─────────────────────────────────────────
Manages the daily trading session for each user.

A TradingSession is created once per user per day.
The DisciplineEngine reads from it to enforce:
  - Max trades per day (trades_count)
  - Max daily loss cap (realized_pnl)
  - Revenge trading cooldown (is_cooldown_active, cooldown_until)

Key functions:
  get_or_create_today()   → get or create today's session
  increment_trade_count() → called when order is placed
  update_realized_pnl()   → called when position is closed
  activate_cooldown()     → called when SL is hit
  check_cooldown()        → called by DisciplineEngine before order
"""

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from app.config import settings
from app.models.trading_session import TradingSession
from app.models.user import User


def get_or_create_today(db: Session, user: User) -> TradingSession:
    """
    Get today's trading session for the user.
    Creates a new one if it doesn't exist yet.
    Called at the start of every order placement.
    """
    today = date.today()

    session = db.query(TradingSession).filter(
        TradingSession.user_id == user.id,
        TradingSession.session_date == today,
    ).first()

    if not session:
        session = TradingSession(
            user_id=user.id,
            tenant_id=user.tenant_id,
            session_date=today,
            trades_count=0,
            realized_pnl=Decimal("0.00"),
            is_cooldown_active=False,
        )
        db.add(session)
        db.flush()

    return session


def increment_trade_count(session: TradingSession) -> None:
    """
    Increment trade count when a new order is placed.
    Called after discipline check passes.
    """
    session.trades_count += 1


def update_realized_pnl(session: TradingSession, pnl: Decimal) -> None:
    """
    Add P&L to the session's running total.
    Called when a position is closed.
    pnl can be negative (loss) — that's fine, it accumulates.
    """
    session.realized_pnl += pnl


def activate_cooldown(
    session: TradingSession,
    cooldown_minutes: int = None,
) -> None:
    """
    Activate revenge trading cooldown after an SL hit.
    User cannot place new orders until cooldown_until passes.

    Args:
        session          : today's TradingSession
        cooldown_minutes : from discipline rule, defaults to settings value
    """
    if cooldown_minutes is None:
        cooldown_minutes = settings.DEFAULT_COOLDOWN_MINUTES

    now = datetime.now(timezone.utc)
    session.is_cooldown_active = True
    session.cooldown_until = now + timedelta(minutes=cooldown_minutes)
    session.last_sl_hit_at = now


def check_and_reset_cooldown(session: TradingSession) -> bool:
    """
    Check if cooldown is still active. If expired, reset it.

    Returns True if cooldown IS active (order should be blocked).
    Returns False if cooldown is not active (order can proceed).
    """
    if not session.is_cooldown_active:
        return False

    now = datetime.now(timezone.utc)

    cooldown_until = session.cooldown_until
    if cooldown_until and cooldown_until.tzinfo is None:
        cooldown_until = cooldown_until.replace(tzinfo=timezone.utc)

    if cooldown_until and now >= cooldown_until:
        # Cooldown has expired — reset it
        session.is_cooldown_active = False
        session.cooldown_until = None
        return False

    return True  # Still in cooldown


def get_cooldown_remaining(session: TradingSession) -> int:
    """
    Returns seconds remaining in cooldown, or 0 if not active.
    Used in the DisciplineViolationError message so user knows
    exactly how long to wait.
    """
    if not session.is_cooldown_active or not session.cooldown_until:
        return 0

    now = datetime.now(timezone.utc)
    cooldown_until = session.cooldown_until
    if cooldown_until.tzinfo is None:
        cooldown_until = cooldown_until.replace(tzinfo=timezone.utc)

    remaining = (cooldown_until - now).total_seconds()
    return max(0, int(remaining))