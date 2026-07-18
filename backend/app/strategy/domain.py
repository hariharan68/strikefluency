"""
app/strategy/domain.py
──────────────────────
The core dataclasses every other part of the Strategy Builder speaks in:

    OptionContract  one tradeable instrument (a strike+expiry+CE/PE, or a future)
    Leg             a directional position in one contract, sized in lots
    Strategy        an underlying + a set of legs (draft or executed)
    Fill            what actually happened when a leg was executed
    PaperPosition   an executed Strategy with money attached

Deliberately dumb objects. Validation lives in the builder (Phase 3), maths
lives in payoff.py / greeks.py / margin.py (Phase 2). These just hold state and
answer questions that are pure functions of their own fields.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from typing import Optional

from app.core.constants import (
    LegInstrumentType,
    LegStatus,
    OrderAction,
    StrategyStatus,
)
from app.core.instruments import InstrumentSpec, get_spec


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ── Market data for one contract ──────────────────────────────
@dataclass
class OptionContract:
    """
    A single tradeable contract plus its current market snapshot.

    Market fields are Optional on purpose. Illiquid far-OTM strikes genuinely
    have no LTP, no bid/ask and no IV, and the honest representation of that is
    None — not 0.0. Code that consumes these must check. `has_tradeable_price`
    exists so callers don't each reinvent that check.

    For a futures leg (instrument_type == FUT), `strike` is None.
    """

    underlying: str
    expiry: date
    instrument_type: str                    # CE | PE | FUT
    strike: Optional[float] = None          # None for FUT

    # Market snapshot
    ltp: Optional[float] = None
    bid: Optional[float] = None
    ask: Optional[float] = None
    iv: Optional[float] = None              # implied vol, as a decimal (0.14 = 14%)
    oi: Optional[int] = None
    volume: Optional[int] = None

    # Greeks. Populated by greeks.py (Phase 2) rather than trusted from the
    # provider: Fyers supplies only delta+IV, and the mock provider's delta is
    # random.uniform() — i.e. noise. Never treat a provider delta as truth.
    delta: Optional[float] = None
    gamma: Optional[float] = None
    theta: Optional[float] = None
    vega: Optional[float] = None

    # Where the snapshot came from and when — needed to flag stale quotes.
    quote_time: Optional[datetime] = None
    source: Optional[str] = None            # e.g. fyers | fyers_cached | mock

    def __post_init__(self) -> None:
        self.underlying = self.underlying.strip().upper()
        self.instrument_type = self.instrument_type.strip().upper()

    @property
    def is_option(self) -> bool:
        return self.instrument_type in LegInstrumentType.OPTIONS

    @property
    def is_future(self) -> bool:
        return self.instrument_type == LegInstrumentType.FUT

    @property
    def has_tradeable_price(self) -> bool:
        """
        True when this contract can be filled at a real price.

        A zero LTP is treated as absent, not as a free option — a strike
        quoting 0 is one nobody is trading.
        """
        return self.ltp is not None and self.ltp > 0

    @property
    def mid_price(self) -> Optional[float]:
        """Bid/ask midpoint, or None when either side is missing."""
        if self.bid is None or self.ask is None:
            return None
        if self.bid <= 0 or self.ask <= 0:
            return None
        return (self.bid + self.ask) / 2.0

    @property
    def spread(self) -> Optional[float]:
        if self.bid is None or self.ask is None:
            return None
        return self.ask - self.bid

    def is_expired(self, as_of: Optional[date] = None) -> bool:
        return self.expiry < (as_of or date.today())

    def days_to_expiry(self, as_of: Optional[date] = None) -> int:
        """Calendar days until expiry. Negative once expired."""
        return (self.expiry - (as_of or date.today())).days

    def key(self) -> tuple:
        """Identity of the contract itself, ignoring the market snapshot."""
        return (self.underlying, self.expiry, self.instrument_type, self.strike)

    def label(self) -> str:
        """Human-readable, e.g. 'NIFTY 24050 CE 21Jul' or 'NIFTY FUT 28Jul'."""
        stamp = self.expiry.strftime("%d%b")
        if self.is_future:
            return f"{self.underlying} FUT {stamp}"
        strike = int(self.strike) if self.strike == int(self.strike or 0) else self.strike
        return f"{self.underlying} {strike} {self.instrument_type} {stamp}"


# ── One leg of a strategy ─────────────────────────────────────
@dataclass
class Leg:
    """
    A directional position in one contract, sized in lots.

    `lots` is always a positive integer; direction is carried by `action`, not
    by the sign of the quantity. `sign` converts the two into the +1/-1 that
    the payoff and greeks maths multiply through. Storing a negative quantity
    instead would make the DB CheckConstraint (`quantity > 0`) and the maths
    disagree, so keep them separate.
    """

    contract: OptionContract
    action: str                             # BUY | SELL
    lots: int
    lot_size: int

    entry_price: Optional[float] = None     # None until filled
    status: str = LegStatus.PENDING
    id: uuid.UUID = field(default_factory=uuid.uuid4)

    def __post_init__(self) -> None:
        self.action = self.action.strip().upper()

    @property
    def sign(self) -> int:
        """+1 for a long leg, -1 for a short leg."""
        return 1 if self.action == OrderAction.BUY else -1

    @property
    def quantity(self) -> int:
        """Contract quantity = lots × lot_size."""
        return self.lots * self.lot_size

    @property
    def signed_quantity(self) -> int:
        """Contract quantity carrying direction. This is what the maths wants."""
        return self.sign * self.quantity

    @property
    def is_open(self) -> bool:
        return self.status == LegStatus.OPEN

    @property
    def premium(self) -> Optional[float]:
        """
        Cash effect of entering this leg, signed.

        Negative = cash paid out (a long leg debits you).
        Positive = cash received (a short leg credits you).
        None when the leg has not been filled.
        """
        if self.entry_price is None:
            return None
        return -self.sign * self.entry_price * self.quantity

    def label(self) -> str:
        return f"{self.action} {self.lots}× {self.contract.label()}"


# ── A strategy ────────────────────────────────────────────────
@dataclass
class Strategy:
    """
    An underlying plus a set of legs.

    Lives in DRAFT until executed — a draft is free to edit and commits no
    capital. `allow_calendar` gates whether legs may span different expiries;
    it is per-strategy rather than global because most structures must NOT mix
    expiries (a straddle with mismatched expiries is a bug), while calendar and
    diagonal spreads exist precisely to do so.
    """

    underlying: str
    legs: list[Leg] = field(default_factory=list)

    name: Optional[str] = None
    template_id: Optional[str] = None       # set when built from a template
    status: str = StrategyStatus.DRAFT
    allow_calendar: bool = False

    id: uuid.UUID = field(default_factory=uuid.uuid4)
    created_at: datetime = field(default_factory=_utcnow)
    updated_at: datetime = field(default_factory=_utcnow)

    def __post_init__(self) -> None:
        self.underlying = self.underlying.strip().upper()

    @property
    def spec(self) -> InstrumentSpec:
        return get_spec(self.underlying)

    @property
    def lot_size(self) -> int:
        return self.spec.lot_size

    @property
    def is_draft(self) -> bool:
        return self.status == StrategyStatus.DRAFT

    @property
    def open_legs(self) -> list[Leg]:
        return [leg for leg in self.legs if leg.is_open]

    @property
    def expiries(self) -> list[date]:
        """Distinct expiries across all legs, earliest first."""
        return sorted({leg.contract.expiry for leg in self.legs})

    @property
    def is_calendar(self) -> bool:
        """True when the legs actually span more than one expiry."""
        return len(self.expiries) > 1

    @property
    def has_short_legs(self) -> bool:
        return any(leg.sign < 0 for leg in self.legs)

    @property
    def has_future_legs(self) -> bool:
        return any(leg.contract.is_future for leg in self.legs)

    @property
    def net_premium(self) -> Optional[float]:
        """
        Net cash effect of opening every leg, signed.

        Positive = net credit received. Negative = net debit paid.
        None when any leg is unfilled, because a partial answer here would be
        silently wrong rather than obviously missing.
        """
        premiums = [leg.premium for leg in self.legs]
        if not premiums or any(p is None for p in premiums):
            return None
        return sum(premiums)

    def touch(self) -> None:
        self.updated_at = _utcnow()


# ── Execution ─────────────────────────────────────────────────
@dataclass
class Fill:
    """What actually happened when a leg was filled — kept for audit."""

    leg_id: uuid.UUID
    price: float                # price actually filled at, after slippage
    quoted_ltp: float           # what was on screen before slippage
    quantity: int
    filled_at: datetime = field(default_factory=_utcnow)

    @property
    def slippage(self) -> float:
        return self.price - self.quoted_ltp


@dataclass
class PaperPosition:
    """
    An executed Strategy with money attached.

    Split from Strategy so a draft stays a pure, capital-free object: you can
    build, tweak and discard strategies all day without touching the account.
    """

    strategy_id: uuid.UUID
    underlying: str

    fills: list[Fill] = field(default_factory=list)
    margin_blocked: float = 0.0
    realized_pnl: float = 0.0
    unrealized_pnl: float = 0.0
    brokerage: float = 0.0

    is_open: bool = True
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    opened_at: datetime = field(default_factory=_utcnow)
    closed_at: Optional[datetime] = None

    @property
    def total_pnl(self) -> float:
        """Net of brokerage — the number that actually hits the account."""
        return self.realized_pnl + self.unrealized_pnl - self.brokerage

    def fill_for(self, leg_id: uuid.UUID) -> Optional[Fill]:
        for f in self.fills:
            if f.leg_id == leg_id:
                return f
        return None
