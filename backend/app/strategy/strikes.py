"""
app/strategy/strikes.py
───────────────────────
Pure strike-selection rules, kept separate from template assembly (templates.py)
so each rule is unit-testable on its own — exactly as the module spec asked.

Everything is expressed in *strike steps* from ATM, where one step is the
instrument's strike_interval. "2 steps OTM call" on NIFTY (interval 50) means
ATM + 100. This keeps templates instrument-agnostic: the same "short strangle,
2 steps out" works on NIFTY, BANKNIFTY and SENSEX without per-symbol numbers.

No pricing here — these functions answer "which strike?", never "at what price?".
"""

from __future__ import annotations

from app.core.instruments import InstrumentSpec


def atm_strike(spec: InstrumentSpec, spot: float) -> int:
    """The strike nearest to spot, snapped to the grid."""
    return spec.nearest_strike(spot)


def step(spec: InstrumentSpec, atm: int, n_steps: int) -> int:
    """
    A strike `n_steps` grid-intervals from `atm`.

    Positive = higher strikes (OTM calls / ITM puts),
    negative = lower strikes (OTM puts / ITM calls).
    """
    return atm + n_steps * spec.strike_interval


def otm_call(spec: InstrumentSpec, spot: float, n_steps: int) -> int:
    """A call strike `n_steps` above ATM (n_steps >= 0)."""
    return step(spec, atm_strike(spec, spot), abs(n_steps))


def otm_put(spec: InstrumentSpec, spot: float, n_steps: int) -> int:
    """A put strike `n_steps` below ATM (n_steps >= 0)."""
    return step(spec, atm_strike(spec, spot), -abs(n_steps))


def itm_call(spec: InstrumentSpec, spot: float, n_steps: int) -> int:
    """A call strike `n_steps` below ATM (in the money)."""
    return step(spec, atm_strike(spec, spot), -abs(n_steps))


def itm_put(spec: InstrumentSpec, spot: float, n_steps: int) -> int:
    """A put strike `n_steps` above ATM (in the money)."""
    return step(spec, atm_strike(spec, spot), abs(n_steps))


def wing_strikes(spec: InstrumentSpec, spot: float,
                 short_steps: int, wing_steps: int) -> dict[str, int]:
    """
    The four strikes of a condor-like structure, symmetric around ATM.

    short_steps : how far OTM the short strikes sit (both sides)
    wing_steps  : how far beyond the shorts the protective longs sit

    Returns {short_call, long_call, short_put, long_put}.
    """
    atm = atm_strike(spec, spot)
    return {
        "short_call": step(spec, atm, short_steps),
        "long_call": step(spec, atm, short_steps + wing_steps),
        "short_put": step(spec, atm, -short_steps),
        "long_put": step(spec, atm, -(short_steps + wing_steps)),
    }
