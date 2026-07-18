"""
app/strategy/builder.py
───────────────────────
Leg management for a draft Strategy: add, remove, edit — each fully validated.

Pure — no DB, no network. Operates on the in-memory Strategy from domain.py.
Persistence (Phase 5) and paper execution (Phase 7) call these to mutate a draft
before anything is committed.

Every mutation validates BEFORE it touches the strategy, so a rejected operation
leaves the draft exactly as it was — no half-applied edits. Failures raise
StrategyValidationError(code, message); the code lets the UI react to the
specific problem, the message is human-readable.

These rules are structural only (does this leg belong in this strategy?). They
are NOT the discipline rules (max trades/day, daily loss) — those apply once, to
the whole strategy, at execution time (Phase 7).
"""

from __future__ import annotations

from datetime import date
from typing import Optional

from app.core.constants import (
    LegInstrumentType,
    LegStatus,
    MAX_STRATEGY_LEGS,
    OrderAction,
)
from app.core.exceptions import StrategyValidationError
from app.core.instruments import InstrumentSpec, UnknownInstrumentError, get_spec
from app.strategy.domain import Leg, OptionContract, Strategy


# ── Validation codes ──────────────────────────────────────────
class ValidationCode:
    UNKNOWN_UNDERLYING = "UNKNOWN_UNDERLYING"
    UNDERLYING_MISMATCH = "UNDERLYING_MISMATCH"
    STRIKE_OFF_GRID = "STRIKE_OFF_GRID"
    STRIKE_REQUIRED = "STRIKE_REQUIRED"
    BAD_OPTION_TYPE = "BAD_OPTION_TYPE"
    BAD_ACTION = "BAD_ACTION"
    BAD_QUANTITY = "BAD_QUANTITY"
    MAX_LEGS = "MAX_LEGS"
    CALENDAR_NOT_ALLOWED = "CALENDAR_NOT_ALLOWED"
    EXPIRY_IN_PAST = "EXPIRY_IN_PAST"
    LEG_NOT_FOUND = "LEG_NOT_FOUND"
    NOT_A_DRAFT = "NOT_A_DRAFT"


def _fail(code: str, message: str) -> None:
    raise StrategyValidationError(code=code, message=message)


# ── Leg-level validation ──────────────────────────────────────
def validate_leg(leg: Leg, spec: InstrumentSpec) -> None:
    """
    Check one leg in isolation against its underlying's contract spec.

    Does not consider the rest of the strategy — that is _validate_against_strategy.
    """
    c = leg.contract

    if c.instrument_type not in LegInstrumentType.ALL:
        _fail(ValidationCode.BAD_OPTION_TYPE,
              f"Instrument type must be CE, PE or FUT (got {c.instrument_type!r}).")

    if leg.action not in (OrderAction.BUY, OrderAction.SELL):
        _fail(ValidationCode.BAD_ACTION,
              f"Action must be BUY or SELL (got {leg.action!r}).")

    # Quantity is carried as a positive integer number of lots; direction lives
    # in `action`, never in a negative quantity.
    if not isinstance(leg.lots, int) or leg.lots <= 0:
        _fail(ValidationCode.BAD_QUANTITY,
              f"Quantity must be a positive whole number of lots (got {leg.lots!r}).")

    if c.is_option:
        if c.strike is None:
            _fail(ValidationCode.STRIKE_REQUIRED,
                  f"A {c.instrument_type} leg needs a strike.")
        if not spec.is_valid_strike(c.strike):
            _fail(ValidationCode.STRIKE_OFF_GRID,
                  f"{c.strike:g} is not a valid {spec.symbol} strike "
                  f"(interval {spec.strike_interval}).")
    # FUT legs carry no strike — nothing to grid-check.


def _validate_against_strategy(leg: Leg, strategy: Strategy,
                               ignore_leg_id=None) -> None:
    """Check a leg against the rest of the strategy (shared underlying, expiries)."""
    if leg.contract.underlying != strategy.underlying:
        _fail(ValidationCode.UNDERLYING_MISMATCH,
              f"All legs must be {strategy.underlying}; "
              f"this leg is {leg.contract.underlying}.")

    # Calendar gate: legs may only span expiries when the strategy opts in.
    other_expiries = {
        l.contract.expiry for l in strategy.legs if l.id != ignore_leg_id
    }
    if other_expiries and leg.contract.expiry not in other_expiries:
        if not strategy.allow_calendar:
            _fail(ValidationCode.CALENDAR_NOT_ALLOWED,
                  "Legs have different expiries. Enable calendar spreads on this "
                  "strategy to mix expiries.")


def _require_draft(strategy: Strategy) -> None:
    if not strategy.is_draft:
        _fail(ValidationCode.NOT_A_DRAFT,
              f"Strategy is {strategy.status}, not a draft; legs can no longer "
              f"be edited. Square off or clone it instead.")


# ── Construction helper ───────────────────────────────────────
def make_leg(underlying: str, instrument_type: str, action: str, lots: int,
             expiry: date, strike: Optional[float] = None,
             entry_price: Optional[float] = None,
             contract: Optional[OptionContract] = None) -> Leg:
    """
    Build a Leg from primitives, resolving lot_size from the registry.

    Pass an existing `contract` to keep a live market snapshot (LTP/IV/greeks);
    otherwise a bare contract is created from the primitives.
    """
    try:
        spec = get_spec(underlying)
    except UnknownInstrumentError as e:
        _fail(ValidationCode.UNKNOWN_UNDERLYING, str(e))

    if contract is None:
        contract = OptionContract(
            underlying=underlying, expiry=expiry,
            instrument_type=instrument_type, strike=strike,
        )
    return Leg(contract=contract, action=action, lots=lots,
               lot_size=spec.lot_size, entry_price=entry_price)


# ── Mutations ─────────────────────────────────────────────────
def add_leg(strategy: Strategy, leg: Leg) -> Leg:
    """
    Validate and append a leg. Raises before mutating on any failure.

    Returns the leg for convenient chaining.
    """
    _require_draft(strategy)

    if len(strategy.legs) >= MAX_STRATEGY_LEGS:
        _fail(ValidationCode.MAX_LEGS,
              f"A strategy can hold at most {MAX_STRATEGY_LEGS} legs.")

    spec = get_spec(strategy.underlying)
    validate_leg(leg, spec)
    _validate_against_strategy(leg, strategy)

    strategy.legs.append(leg)
    strategy.touch()
    return leg


def remove_leg(strategy: Strategy, leg_id) -> Leg:
    """Remove a leg by id. Raises if the strategy isn't a draft or id is unknown."""
    _require_draft(strategy)

    for i, leg in enumerate(strategy.legs):
        if leg.id == leg_id:
            removed = strategy.legs.pop(i)
            strategy.touch()
            return removed
    _fail(ValidationCode.LEG_NOT_FOUND, f"No leg with id {leg_id} in this strategy.")


def edit_leg(strategy: Strategy, leg_id, *, strike: Optional[float] = None,
             expiry: Optional[date] = None, lots: Optional[int] = None,
             action: Optional[str] = None,
             instrument_type: Optional[str] = None) -> Leg:
    """
    Change fields on an existing leg. Only the passed fields change.

    Builds a candidate copy, validates it fully, and only then commits — so a
    rejected edit leaves the original leg untouched (no half-applied change).
    """
    _require_draft(strategy)

    target = next((l for l in strategy.legs if l.id == leg_id), None)
    if target is None:
        _fail(ValidationCode.LEG_NOT_FOUND, f"No leg with id {leg_id} in this strategy.")

    c = target.contract
    new_contract = OptionContract(
        underlying=c.underlying,
        expiry=expiry if expiry is not None else c.expiry,
        instrument_type=instrument_type if instrument_type is not None else c.instrument_type,
        strike=strike if strike is not None else c.strike,
        # keep the market snapshot only if strike/expiry/type are unchanged
        ltp=c.ltp, bid=c.bid, ask=c.ask, iv=c.iv, oi=c.oi,
        delta=c.delta, gamma=c.gamma, theta=c.theta, vega=c.vega,
        quote_time=c.quote_time, source=c.source,
    )
    candidate = Leg(
        contract=new_contract,
        action=action if action is not None else target.action,
        lots=lots if lots is not None else target.lots,
        lot_size=target.lot_size,
        entry_price=target.entry_price,
        status=target.status,
        id=target.id,
    )

    spec = get_spec(strategy.underlying)
    validate_leg(candidate, spec)
    _validate_against_strategy(candidate, strategy, ignore_leg_id=leg_id)

    # If the contract identity changed, the old market snapshot is stale.
    if new_contract.key() != c.key():
        candidate.contract.ltp = None
        candidate.contract.iv = c.iv if instrument_type is None and strike is None else None

    idx = strategy.legs.index(target)
    strategy.legs[idx] = candidate
    strategy.touch()
    return candidate


def validate_strategy(strategy: Strategy) -> None:
    """
    Full re-check of a strategy — every leg, plus cross-leg rules.

    Called before execution (Phase 7) as a belt-and-braces gate in case a draft
    was assembled by bypassing add_leg (e.g. loaded from persistence).
    """
    if not strategy.legs:
        _fail(ValidationCode.BAD_QUANTITY, "A strategy needs at least one leg.")
    if len(strategy.legs) > MAX_STRATEGY_LEGS:
        _fail(ValidationCode.MAX_LEGS,
              f"A strategy can hold at most {MAX_STRATEGY_LEGS} legs.")

    spec = get_spec(strategy.underlying)
    for leg in strategy.legs:
        validate_leg(leg, spec)
        if leg.contract.underlying != strategy.underlying:
            _fail(ValidationCode.UNDERLYING_MISMATCH,
                  f"All legs must be {strategy.underlying}.")

    if strategy.is_calendar and not strategy.allow_calendar:
        _fail(ValidationCode.CALENDAR_NOT_ALLOWED,
              "Strategy spans multiple expiries but calendar spreads are not "
              "enabled on it.")
