"""
Unit tests for the 32 template generators (Phase 4).

Every template is built across all three underlyings and priced with a
Black-Scholes model so the payoff engine can run on it. Assertions check
structure (leg counts, categories) and economic direction (bullish templates
make money when price rises, defined-risk templates have a bounded max loss).
"""

from datetime import date

import pytest

from app.core.constants import StrategyCategory
from app.core.instruments import get_spec
from app.strategy.greeks import black_scholes, years_to_expiry
from app.strategy.payoff import payoff_curve, strategy_pnl_at
from app.strategy.templates import (
    all_template_ids,
    build_template,
    get_template,
    list_templates,
)

NEAR = date(2026, 7, 21)
FAR = date(2026, 7, 28)
ASOF = date(2026, 7, 16)
SPOTS = {"NIFTY": 24000.0, "BANKNIFTY": 51000.0, "SENSEX": 80000.0}


def _pricer(spot, iv=0.14):
    """A Black-Scholes price_fn so templates come back costed."""
    def price(contract):
        if contract.is_future:
            return spot
        t = max(years_to_expiry(contract.expiry, ASOF), 1 / 365)
        return round(black_scholes(spot, contract.strike, t, iv,
                                   contract.instrument_type).price, 2)
    return price


# ── registry shape matches the reference UI ───────────────────
def test_thirty_two_templates():
    assert len(all_template_ids()) == 32


def test_category_counts_match_screenshots():
    counts = {c: len(list_templates(c)) for c in StrategyCategory.ALL}
    assert counts == {
        StrategyCategory.BULLISH: 9,
        StrategyCategory.BEARISH: 9,
        StrategyCategory.NEUTRAL: 8,
        StrategyCategory.OTHER: 6,
    }


# ── every template builds & prices on every underlying ────────
@pytest.mark.parametrize("template_id", all_template_ids())
@pytest.mark.parametrize("underlying", ["NIFTY", "BANKNIFTY", "SENSEX"])
def test_template_builds_and_prices(template_id, underlying):
    spot = SPOTS[underlying]
    s = build_template(template_id, underlying, spot, [NEAR, FAR],
                       lots=1, price_fn=_pricer(spot))

    assert s.template_id == template_id
    assert s.legs, "template produced no legs"
    assert len(s.legs) <= 10

    # every leg priced, on the right underlying, strike on grid
    spec = get_spec(underlying)
    for leg in s.legs:
        assert leg.contract.underlying == underlying
        assert leg.entry_price is not None
        if leg.contract.is_option:
            assert spec.is_valid_strike(leg.contract.strike)

    # payoff must be computable (net_premium not None → all legs filled)
    r = payoff_curve(s, spot)
    assert s.net_premium is not None
    assert len(r.prices) == len(r.pnls)


# ── economic direction sanity ─────────────────────────────────
def _pnl_move(template_id, underlying, pct):
    spot = SPOTS[underlying]
    s = build_template(template_id, underlying, spot, [NEAR, FAR],
                       price_fn=_pricer(spot))
    return strategy_pnl_at(s, spot * (1 + pct))


@pytest.mark.parametrize("template_id", [
    "buy_call", "bull_call_spread", "bull_put_spread", "long_synthetic_future",
])
def test_bullish_templates_profit_on_rise(template_id):
    up = _pnl_move(template_id, "NIFTY", +0.03)
    down = _pnl_move(template_id, "NIFTY", -0.03)
    assert up > down, f"{template_id} should do better on a rise"


@pytest.mark.parametrize("template_id", [
    "buy_put", "bear_put_spread", "bear_call_spread", "short_synthetic_future",
])
def test_bearish_templates_profit_on_fall(template_id):
    up = _pnl_move(template_id, "NIFTY", +0.03)
    down = _pnl_move(template_id, "NIFTY", -0.03)
    assert down > up, f"{template_id} should do better on a fall"


def test_long_straddle_profits_on_big_move_either_way():
    flat = _pnl_move("long_straddle", "NIFTY", 0.0)
    up = _pnl_move("long_straddle", "NIFTY", +0.06)
    down = _pnl_move("long_straddle", "NIFTY", -0.06)
    assert up > flat and down > flat


def test_short_straddle_profits_when_flat():
    flat = _pnl_move("short_straddle", "NIFTY", 0.0)
    up = _pnl_move("short_straddle", "NIFTY", +0.06)
    assert flat > up


# ── defined-risk templates have a bounded max loss ────────────
@pytest.mark.parametrize("template_id", [
    "short_iron_condor", "short_iron_butterfly", "long_iron_condor",
    "bull_call_spread", "bear_put_spread", "jade_lizard", "batman",
    "double_plateau", "long_straddle",
])
def test_defined_risk_has_bounded_loss(template_id):
    spot = SPOTS["NIFTY"]
    s = build_template(template_id, "NIFTY", spot, [NEAR, FAR], price_fn=_pricer(spot))
    r = payoff_curve(s, spot)
    assert r.max_loss is not None, f"{template_id} loss should be bounded"


@pytest.mark.parametrize("template_id", ["short_straddle", "short_strangle", "sell_call"])
def test_naked_shorts_have_unlimited_loss(template_id):
    spot = SPOTS["NIFTY"]
    s = build_template(template_id, "NIFTY", spot, [NEAR], price_fn=_pricer(spot))
    r = payoff_curve(s, spot)
    assert r.max_loss is None


# ── calendars require two expiries ────────────────────────────
def test_calendar_needs_two_expiries():
    with pytest.raises(ValueError):
        build_template("long_calendar_calls", "NIFTY", 24000.0, [NEAR])


def test_calendar_spans_two_expiries():
    s = build_template("long_calendar_calls", "NIFTY", 24000.0, [NEAR, FAR],
                       price_fn=_pricer(24000.0))
    assert s.is_calendar and s.allow_calendar


def test_ratio_spread_has_2x_short():
    s = build_template("call_ratio_spread", "NIFTY", 24000.0, [NEAR], lots=1)
    shorts = [l for l in s.legs if l.sign < 0]
    longs = [l for l in s.legs if l.sign > 0]
    assert sum(l.lots for l in shorts) == 2 * sum(l.lots for l in longs)


def test_lots_multiplier_scales_all_legs():
    s1 = build_template("short_iron_condor", "NIFTY", 24000.0, [NEAR], lots=1)
    s3 = build_template("short_iron_condor", "NIFTY", 24000.0, [NEAR], lots=3)
    assert [l.lots for l in s3.legs] == [l.lots * 3 for l in s1.legs]
