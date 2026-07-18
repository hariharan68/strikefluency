"""
app/core/expiry_calendar.py
───────────────────────────
Rule-based expiry dates, derived from the weekday rules in instruments.py.

THIS IS THE FALLBACK, NOT THE SOURCE OF TRUTH.

When a broker is connected, expiry dates come from the provider's expiry list
(see MarketDataProvider.get_expiries). That list is already holiday-adjusted and
it self-corrects when SEBI moves an expiry day — no code change needed here.
This module exists for the mock provider, offline development, and unit tests,
where there is no broker to ask.

Consequence worth knowing: these functions do NOT account for trading holidays.
A rule-derived expiry falling on a holiday will be wrong, and only the broker
list will be right. That is an accepted limitation of the offline path, not a
bug to fix by hand-maintaining a holiday list.

Replaces mock_provider._nearest_expiry(), which assumed Thursday (NIFTY moved to
Tuesday) and used `date.replace(day=today.day + n)` — that raises ValueError
whenever the offset crosses a month boundary. Everything here uses timedelta.
"""

from __future__ import annotations

import calendar
from datetime import date, timedelta
from typing import Optional

from app.core.instruments import InstrumentSpec, get_spec


def _next_weekday_on_or_after(start: date, weekday: int) -> date:
    """The first date >= `start` falling on `weekday` (Mon=0 … Sun=6)."""
    return start + timedelta(days=(weekday - start.weekday()) % 7)


def last_weekday_of_month(year: int, month: int, weekday: int) -> date:
    """The last `weekday` in a given month — how monthly expiries are defined."""
    last_day = calendar.monthrange(year, month)[1]
    d = date(year, month, last_day)
    return d - timedelta(days=(d.weekday() - weekday) % 7)


def _add_month(d: date) -> date:
    """First day of the following month. Avoids day-overflow entirely."""
    return date(d.year + (d.month // 12), (d.month % 12) + 1, 1)


def weekly_expiries(spec: InstrumentSpec, count: int,
                    as_of: Optional[date] = None) -> list[date]:
    """
    The next `count` weekly expiries, today included if today is expiry day.

    Empty when the underlying has no weeklies (BANKNIFTY).
    """
    if not spec.has_weekly or spec.weekly_expiry_weekday is None:
        return []
    start = as_of or date.today()
    first = _next_weekday_on_or_after(start, spec.weekly_expiry_weekday)
    return [first + timedelta(weeks=i) for i in range(count)]


def monthly_expiries(spec: InstrumentSpec, count: int,
                     as_of: Optional[date] = None) -> list[date]:
    """The next `count` monthly expiries, today included if today is expiry day."""
    if not spec.has_monthly:
        return []
    start = as_of or date.today()
    out: list[date] = []
    cursor = date(start.year, start.month, 1)
    while len(out) < count:
        candidate = last_weekday_of_month(
            cursor.year, cursor.month, spec.monthly_expiry_weekday
        )
        if candidate >= start:
            out.append(candidate)
        cursor = _add_month(cursor)
    return out


def next_expiries(underlying: str, count: int = 4,
                  as_of: Optional[date] = None) -> list[date]:
    """
    The next `count` expiries for an underlying, soonest first.

    Weeklies and monthlies are merged and de-duplicated: the last weekly of a
    month IS that month's monthly expiry, so it must appear once, not twice.
    """
    spec = get_spec(underlying)
    start = as_of or date.today()

    merged = set(weekly_expiries(spec, count, start))
    merged |= set(monthly_expiries(spec, count, start))
    return sorted(merged)[:count]


def nearest_expiry(underlying: str, as_of: Optional[date] = None) -> date:
    """The soonest expiry, today included if today is expiry day."""
    found = next_expiries(underlying, count=1, as_of=as_of)
    if not found:
        raise ValueError(f"{underlying} has no weekly or monthly expiry cycle")
    return found[0]


def days_to_expiry(expiry: date, as_of: Optional[date] = None) -> int:
    """Calendar days until expiry — the `(5d)` / `(12d)` labels in the UI."""
    return (expiry - (as_of or date.today())).days


def is_expiry_day(underlying: str, as_of: Optional[date] = None) -> bool:
    """True when `as_of` is an expiry day — drives expiry-day auto square-off."""
    today = as_of or date.today()
    return nearest_expiry(underlying, as_of=today) == today
