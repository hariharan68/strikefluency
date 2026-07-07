"""
app/core/utils.py
──────────────────
Small pure utility functions used across the app.
No DB access, no imports from services — just helpers.
"""

from datetime import datetime, timezone, time
from decimal import Decimal

from app.core.constants import (
    MARKET_OPEN_HOUR, MARKET_OPEN_MINUTE,
    MARKET_CLOSE_HOUR, MARKET_CLOSE_MINUTE,
    LOT_SIZES,
)


def get_ist_now() -> datetime:
    """
    Return current datetime in IST (UTC+5:30).
    Always use this instead of datetime.now() — never naive datetimes.
    """
    from zoneinfo import ZoneInfo
    return datetime.now(ZoneInfo("Asia/Kolkata"))


def is_market_open() -> bool:
    """
    Return True if current IST time is within NSE market hours.
    Market hours: 09:15 – 15:30 IST, Monday–Friday.
    Does not check for exchange holidays (Phase 1 simplification).
    """
    now = get_ist_now()

    # Weekends — market closed
    if now.weekday() >= 5:  # 5=Saturday, 6=Sunday
        return False

    market_open  = time(MARKET_OPEN_HOUR,  MARKET_OPEN_MINUTE)
    market_close = time(MARKET_CLOSE_HOUR, MARKET_CLOSE_MINUTE)

    return market_open <= now.time() < market_close


def calculate_pnl(
    action: str,
    entry_price: Decimal,
    exit_price: Decimal,
    quantity: int,
    lot_size: int,
) -> Decimal:
    """
    Calculate gross P&L before brokerage.

    For BUY  (long):  pnl = (exit - entry) × qty × lot_size
    For SELL (short): pnl = (entry - exit) × qty × lot_size

    Args:
        action      : "BUY" or "SELL"
        entry_price : fill price when position was opened
        exit_price  : fill price when position was closed
        quantity    : number of lots
        lot_size    : units per lot (NIFTY=50)

    Returns:
        Decimal P&L rounded to 2 decimal places
    """
    units = Decimal(quantity * lot_size)

    if action == "BUY":
        pnl = (exit_price - entry_price) * units
    else:
        pnl = (entry_price - exit_price) * units

    return pnl.quantize(Decimal("0.01"))


def get_lot_size(instrument: str) -> int:
    """Return lot size for a given instrument. Defaults to 50."""
    return LOT_SIZES.get(instrument, 50)


def round_to_tick(price: Decimal, tick_size: Decimal = Decimal("0.05")) -> Decimal:
    """
    Round a price to the nearest valid tick size.
    NSE options tick size is ₹0.05.
    """
    return (price / tick_size).quantize(Decimal("1")) * tick_size