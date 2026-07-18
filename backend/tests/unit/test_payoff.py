"""
Unit tests for the Strategy Builder maths core: payoff, breakevens, margin.

Pure — no database, no network. These are the tests the module was specced to
have (straddle + iron condor across NIFTY, BANKNIFTY and SENSEX lot sizes).

Prices are round synthetic numbers chosen so every expected value is hand-
computable and written in the assertion, so a failure points at the maths, not
at a mystery fixture.
"""

from datetime import date

import pytest

from app.core.constants import OrderAction
from app.core.instruments import get_spec
from app.strategy.domain import Leg, OptionContract, Strategy
from app.strategy.margin import estimate_margin
from app.strategy.payoff import payoff_curve, strategy_pnl_at, value_at_expiry

EXPIRY = date(2026, 7, 21)
ALL_UNDERLYINGS = ["NIFTY", "BANKNIFTY", "SENSEX"]


# ── helpers ───────────────────────────────────────────────────
def _contract(underlying, opt_type, strike, ltp):
    return OptionContract(underlying, EXPIRY, opt_type, strike, ltp=ltp, iv=0.14)


def _leg(underlying, opt_type, strike, ltp, action):
    return Leg(
        _contract(underlying, opt_type, strike, ltp),
        action,
        lots=1,
        lot_size=get_spec(underlying).lot_size,
        entry_price=ltp,
    )


def _straddle(underlying, strike=24000, call=150.0, put=150.0):
    s = Strategy(underlying=underlying, name="Short Straddle")
    s.legs = [
        _leg(underlying, "CE", strike, call, OrderAction.SELL),
        _leg(underlying, "PE", strike, put, OrderAction.SELL),
    ]
    return s


def _iron_condor(underlying, short_ce, long_ce, short_pe, long_pe,
                 p_short_ce, p_long_ce, p_short_pe, p_long_pe):
    s = Strategy(underlying=underlying, name="Short Iron Condor")
    s.legs = [
        _leg(underlying, "CE", short_ce, p_short_ce, OrderAction.SELL),
        _leg(underlying, "CE", long_ce, p_long_ce, OrderAction.BUY),
        _leg(underlying, "PE", short_pe, p_short_pe, OrderAction.SELL),
        _leg(underlying, "PE", long_pe, p_long_pe, OrderAction.BUY),
    ]
    return s


# ── value_at_expiry ───────────────────────────────────────────
def test_call_intrinsic_value():
    c = _contract("NIFTY", "CE", 24000, 150.0)
    assert value_at_expiry(c, 24250) == 250.0
    assert value_at_expiry(c, 23800) == 0.0      # OTM never negative


def test_put_intrinsic_value():
    p = _contract("NIFTY", "PE", 24000, 150.0)
    assert value_at_expiry(p, 23800) == 200.0
    assert value_at_expiry(p, 24250) == 0.0


def test_future_tracks_spot():
    f = OptionContract("NIFTY", EXPIRY, "FUT", ltp=24000.0)
    assert value_at_expiry(f, 24333) == 24333.0


def test_unknown_type_raises_not_zero():
    bad = OptionContract("NIFTY", EXPIRY, "CE", 24000)
    bad.instrument_type = "XYZ"
    with pytest.raises(ValueError):
        value_at_expiry(bad, 24000)


# ── straddle payoff, all three lot sizes ──────────────────────
@pytest.mark.parametrize("underlying", ALL_UNDERLYINGS)
def test_short_straddle_payoff(underlying):
    lot = get_spec(underlying).lot_size
    s = _straddle(underlying, strike=24000, call=150.0, put=150.0)

    r = payoff_curve(s, spot=24000)

    # Max profit at the strike = full premium collected = (150 + 150) x lot.
    assert r.max_profit == pytest.approx(300.0 * lot)
    assert r.net_premium == pytest.approx(300.0 * lot)

    # Short straddle loss is unbounded to the upside.
    assert r.max_loss is None
    assert r.is_loss_unlimited

    # Breakevens = strike +/- total premium. PER-UNIT — must NOT scale with lot.
    assert sorted(r.breakevens) == pytest.approx([23700.0, 24300.0])


@pytest.mark.parametrize("underlying", ALL_UNDERLYINGS)
def test_breakevens_are_lot_independent(underlying):
    """The invariant that catches lot size leaking into per-unit maths."""
    narrow = _straddle(underlying, strike=24000, call=150.0, put=150.0)
    assert sorted(payoff_curve(narrow, 24000).breakevens) == pytest.approx([23700.0, 24300.0])


def test_max_profit_at_exact_strike_not_grid_point():
    """Peak sits on a strike; the analysis grid must include strikes exactly."""
    s = _straddle("NIFTY", strike=24123, call=100.0, put=100.0)   # off the 50-grid
    r = payoff_curve(s, spot=24123)
    lot = get_spec("NIFTY").lot_size
    assert r.max_profit == pytest.approx(200.0 * lot)
    assert strategy_pnl_at(s, 24123) == pytest.approx(200.0 * lot)


# ── iron condor payoff + defined risk, all three lot sizes ────
@pytest.mark.parametrize("underlying", ALL_UNDERLYINGS)
def test_iron_condor_defined_risk(underlying):
    lot = get_spec(underlying).lot_size
    # Symmetric condor, 200-wide wings, round premiums.
    # Net credit per unit = (40-10) + (40-10) = 60. Wing width = 200.
    s = _iron_condor(
        underlying,
        short_ce=24200, long_ce=24400, short_pe=23800, long_pe=23600,
        p_short_ce=40.0, p_long_ce=10.0, p_short_pe=40.0, p_long_pe=10.0,
    )
    r = payoff_curve(s, spot=24000)

    net_credit = 60.0 * lot
    wing = 200.0

    # Max profit = net credit, in the body between the shorts.
    assert r.max_profit == pytest.approx(net_credit)

    # Max loss is DEFINED (not None) and equals (wing - credit) x lot.
    assert r.max_loss is not None
    assert r.max_loss == pytest.approx(-(wing - 60.0) * lot)

    # Breakevens = short strike +/- net credit per unit. Lot-independent.
    assert sorted(r.breakevens) == pytest.approx([23740.0, 24260.0])


@pytest.mark.parametrize("underlying", ALL_UNDERLYINGS)
def test_iron_condor_margin_tracks_max_loss(underlying):
    """
    The property margin.py exists for: a hedged condor blocks ~ its max loss,
    not naked margin on every short leg.
    """
    s = _iron_condor(
        underlying,
        short_ce=24200, long_ce=24400, short_pe=23800, long_pe=23600,
        p_short_ce=40.0, p_long_ce=10.0, p_short_pe=40.0, p_long_pe=10.0,
    )
    r = payoff_curve(s, spot=24000)
    m = estimate_margin(s, spot=24000)

    from app.strategy.margin import DEFINED_RISK_BUFFER_PCT

    assert m.is_defined_risk
    assert m.naked_margin == 0.0
    assert m.total == pytest.approx(abs(r.max_loss) * (1 + DEFINED_RISK_BUFFER_PCT))


def test_short_straddle_margin_is_naked_and_large():
    s = _straddle("NIFTY", strike=24000, call=150.0, put=150.0)
    condor = _iron_condor(
        "NIFTY", 24200, 24400, 23800, 23600, 40.0, 10.0, 40.0, 10.0,
    )
    m_straddle = estimate_margin(s, spot=24000)
    m_condor = estimate_margin(condor, spot=24000)

    assert not m_straddle.is_defined_risk
    assert m_straddle.naked_margin > 0
    # Naked strangle margin dwarfs a defined-risk condor.
    assert m_straddle.total > m_condor.total * 5


def test_long_debit_spread_blocks_no_margin():
    """A bull call spread's risk is the debit paid, not blocked margin."""
    lot = get_spec("NIFTY").lot_size
    s = Strategy(underlying="NIFTY", name="Bull Call Spread")
    s.legs = [
        _leg("NIFTY", "CE", 24000, 180.0, OrderAction.BUY),
        _leg("NIFTY", "CE", 24300, 60.0, OrderAction.SELL),
    ]
    assert estimate_margin(s, spot=24000).total == 0.0
    # And it is defined-risk with max loss = net debit paid.
    r = payoff_curve(s, spot=24000)
    assert r.max_loss == pytest.approx(-120.0 * lot)


# ── guards ────────────────────────────────────────────────────
def test_payoff_needs_filled_legs():
    s = Strategy(underlying="NIFTY")
    s.legs = [Leg(_contract("NIFTY", "CE", 24000, 100.0), OrderAction.BUY,
                  1, get_spec("NIFTY").lot_size)]   # entry_price=None
    with pytest.raises(ValueError):
        payoff_curve(s, spot=24000)


def test_empty_strategy_rejected():
    with pytest.raises(ValueError):
        payoff_curve(Strategy(underlying="NIFTY"), spot=24000)
    with pytest.raises(ValueError):
        estimate_margin(Strategy(underlying="NIFTY"), spot=24000)
