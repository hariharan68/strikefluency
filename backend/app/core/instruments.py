"""
app/core/instruments.py
───────────────────────
Single source of truth for per-underlying contract specs.

WHY THIS FILE EXISTS
────────────────────
Before this module, lot sizes / strike intervals / expiry rules were scattered
across at least six places (core/constants.LOT_SIZES, config.NIFTY_LOT_SIZE,
market/fyers_provider.LOT_SIZES, market/mock_provider.LOT_SIZES +
_get_strike_interval, services/slippage_engine._get_strike_interval) and they
had already drifted out of sync with each other. Everything new reads from here.

LOT SIZES AND EXPIRY DAYS ARE CONFIRMED AS OF 2026-07-17.
STRIKE INTERVALS ARE STILL INFERRED — see the per-entry `# VERIFY` comments.

SEBI and the exchanges revise these. When that happens, edit this file and
nothing else. Each spec carries a `source` recording when it was last checked.

Historical trades are unaffected by a revision: every executed row stores the
lot size it actually used (VirtualOrder.lot_size, and strategy_legs.lot_size
from Phase 5), and utils.calculate_pnl() takes lot_size as a parameter rather
than re-reading config. A past trade therefore never re-values. That snapshot
is why this module needs no version history or effective dating.

Expiry DATES are not computed from this file when a broker is connected — the
provider's expiry list is the source of truth (it is already holiday-adjusted
and self-corrects when SEBI moves expiry day). The weekday rules below drive
app/core/expiry_calendar.py, which is the offline/mock fallback only.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Optional


# ── Exchanges ─────────────────────────────────────────────────
class Exchange:
    NSE = "NSE"
    BSE = "BSE"


# ── Expiry cycles ─────────────────────────────────────────────
class ExpiryCycle:
    WEEKLY = "WEEKLY"
    MONTHLY = "MONTHLY"


# Weekday numbers follow `datetime.date.weekday()`: Monday=0 … Sunday=6.
class Weekday:
    MONDAY = 0
    TUESDAY = 1
    WEDNESDAY = 2
    THURSDAY = 3
    FRIDAY = 4


@dataclass(frozen=True)
class InstrumentSpec:
    """
    Contract specification for one underlying.

    Frozen so a spec can't be mutated by accident at runtime. Use
    `override()` to derive a modified copy (handy in tests and when an
    exchange circular lands mid-session).
    """

    symbol: str
    exchange: str

    # Number of units in one lot. Orders are placed in lots; contract
    # quantity = lots × lot_size.
    lot_size: int                       # VERIFY

    # Gap between adjacent strikes in the option chain, in index points.
    strike_interval: int                # VERIFY

    # Which expiry cycles this underlying actually offers.
    has_weekly: bool                    # VERIFY
    has_monthly: bool

    # Weekday the weekly contract expires on. None when has_weekly is False.
    weekly_expiry_weekday: Optional[int]    # VERIFY

    # Weekday the monthly contract expires on (last such weekday of the month).
    monthly_expiry_weekday: int             # VERIFY

    # Minimum price increment for option premiums.
    tick_size: float = 0.05

    # When this spec was last confirmed against an official source. A blanket
    # "# VERIFY" comment stops being useful the moment someone checks half the
    # values and can't record which half.
    source: str = "unverified"

    # Index options in India are European and cash-settled — no physical
    # delivery, no early assignment. This drives both the Black-Scholes model
    # choice (Phase 2) and expiry-day auto-square-off (Phase 7).
    is_european: bool = True
    is_cash_settled: bool = True

    def override(self, **changes) -> "InstrumentSpec":
        """Return a copy with fields replaced. Does not mutate the original."""
        return replace(self, **changes)

    def contract_quantity(self, lots: int) -> int:
        """Convert a lot count into contract quantity."""
        return lots * self.lot_size

    def is_valid_strike(self, strike: float) -> bool:
        """True when `strike` sits exactly on this underlying's strike grid."""
        return strike > 0 and float(strike) % self.strike_interval == 0

    def nearest_strike(self, price: float) -> int:
        """Round `price` to the closest strike on the grid (used for ATM)."""
        step = self.strike_interval
        return int(round(price / step) * step)


# ── The registry ──────────────────────────────────────────────
# Edit these values. Do not edit the code that reads them.
INSTRUMENTS: dict[str, InstrumentSpec] = {
    "NIFTY": InstrumentSpec(
        symbol="NIFTY",
        exchange=Exchange.NSE,
        lot_size=65,
        strike_interval=50,                         # VERIFY — inferred from a chain screenshot
        has_weekly=True,
        has_monthly=True,
        weekly_expiry_weekday=Weekday.TUESDAY,
        monthly_expiry_weekday=Weekday.TUESDAY,
        source="confirmed 2026-07-17",
    ),
    "BANKNIFTY": InstrumentSpec(
        symbol="BANKNIFTY",
        exchange=Exchange.NSE,
        lot_size=30,
        strike_interval=100,                        # VERIFY — inferred, never confirmed
        has_weekly=False,                           # monthly only — weeklies discontinued
        has_monthly=True,
        weekly_expiry_weekday=None,
        monthly_expiry_weekday=Weekday.TUESDAY,
        source="confirmed 2026-07-17",
    ),
    "SENSEX": InstrumentSpec(
        symbol="SENSEX",
        exchange=Exchange.BSE,
        lot_size=20,
        strike_interval=100,                        # VERIFY — inferred, never confirmed
        has_weekly=True,
        has_monthly=True,
        weekly_expiry_weekday=Weekday.THURSDAY,
        monthly_expiry_weekday=Weekday.THURSDAY,
        source="confirmed 2026-07-17",
    ),
}

SUPPORTED_UNDERLYINGS: list[str] = list(INSTRUMENTS.keys())


class UnknownInstrumentError(ValueError):
    """Raised when an underlying is not in the registry."""


def get_spec(underlying: str) -> InstrumentSpec:
    """
    Look up an underlying's spec.

    Raises UnknownInstrumentError rather than returning a default — a silent
    fallback here would mean filling orders at the wrong lot size.
    """
    key = (underlying or "").strip().upper()
    try:
        return INSTRUMENTS[key]
    except KeyError:
        raise UnknownInstrumentError(
            f"Unknown underlying {underlying!r}. "
            f"Supported: {', '.join(SUPPORTED_UNDERLYINGS)}"
        ) from None


def is_supported(underlying: str) -> bool:
    return (underlying or "").strip().upper() in INSTRUMENTS
