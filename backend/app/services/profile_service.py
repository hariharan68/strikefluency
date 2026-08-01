"""Lifetime profile overview: virtual-account snapshot + all-time trade stats.

The Console services (console_service) are deliberately date-windowed (capped at
366 days) because they drive a range picker. The Profile page wants *lifetime*
totals, so this reuses the same trade-unit + P&L primitives over an all-time
window — keeping the numbers identical in definition to Console/Analytics.
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.user import User
from app.models.virtual_account import VirtualAccount
from app.services import console_service
from app.services.console_service import ZERO, _live_unrealized, _load_units, _money

# Comfortably older than any trade this app can hold; paired with "now" it makes
# _load_units an all-time query without special-casing None bounds.
_EPOCH_UTC = datetime(2000, 1, 1)


def get_overview(db: Session, user: User) -> dict:
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    units = _load_units(db, user, _EPOCH_UTC, now_utc, None)

    total_trades = len(units)
    net_realized = sum((unit.net_pnl for unit in units), ZERO)
    winners = sum(1 for unit in units if unit.net_pnl > 0)
    win_rate = round((winners / total_trades * 100), 2) if total_trades else 0.0

    account = db.query(VirtualAccount).filter(VirtualAccount.user_id == user.id).first()

    return {
        "account": {
            "balance": _money(account.balance) if account else ZERO,
            "initial_capital": _money(account.initial_balance) if account else ZERO,
            "tier": account.tier if account else "TIER_1",
        },
        "stats": {
            "total_trades": total_trades,
            "net_realized": _money(net_realized),
            "unrealized": _live_unrealized(db, user),
            "win_rate": win_rate,
        },
    }
