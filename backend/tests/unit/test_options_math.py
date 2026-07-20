"""Unit tests for the pure option-chain engine (app/options/math.py)."""

import math

import pytest

from app.options import math as om
from app.options.math import ChainRow


def _row(strike, opt, oi=0, oi_chg=0, ltp=0.0, vol=0, price_chg=0.0, iv=None):
    return ChainRow(strike, opt, oi, oi_chg, ltp, vol, price_chg, iv)


# ── PCR ───────────────────────────────────────────────────────
def test_pcr_oi():
    rows = [_row(100, "CE", oi=200), _row(100, "PE", oi=300)]
    assert om.pcr_oi(rows) == 1.5
    assert om.pcr_oi([_row(100, "PE", oi=5)]) == 0.0   # no call OI


def test_pcr_volume():
    rows = [_row(100, "CE", vol=100), _row(100, "PE", vol=80)]
    assert om.pcr_volume(rows) == 0.8


# ── buildup map ───────────────────────────────────────────────
def test_buildup_map():
    assert om.classify_buildup(1.0, 100) == (1, "LONG_BUILDUP")
    assert om.classify_buildup(-1.0, 100) == (2, "SHORT_BUILDUP")
    assert om.classify_buildup(1.0, -100) == (3, "SHORT_COVERING")
    assert om.classify_buildup(-1.0, -100) == (4, "LONG_UNWINDING")
    # boundaries: 0 counts as "up"/"increase"
    assert om.classify_buildup(0.0, 0) == (1, "LONG_BUILDUP")


# ── max pain argmin ───────────────────────────────────────────
def test_max_pain_argmin():
    # Heavy CE OI at 100, heavy PE OI at 120 → pain minimised between them.
    rows = [
        _row(100, "CE", oi=1000), _row(110, "CE", oi=100), _row(120, "CE", oi=50),
        _row(100, "PE", oi=50), _row(110, "PE", oi=100), _row(120, "PE", oi=1000),
    ]
    strikes = [100, 110, 120]
    mp = om.max_pain(rows, strikes)
    assert mp == 110
    assert om.max_pain(rows, []) == 0.0


# ── OI walls ──────────────────────────────────────────────────
def test_oi_walls():
    rows = [
        _row(100, "PE", oi=500), _row(90, "PE", oi=900),   # support below spot
        _row(120, "CE", oi=800), _row(130, "CE", oi=300),  # resistance above spot
    ]
    walls = om.oi_walls(rows, spot=110, nearby_strikes=10)
    assert walls["support"] == 90       # highest PE OI below spot
    assert walls["resistance"] == 120   # highest CE OI above spot


def test_atm_strike():
    assert om.atm_strike(24072, [24000, 24050, 24100]) == 24050
    assert om.atm_strike(24072, [], step=50) == 24050   # fallback


# ── Black-76 / implied_vol round-trip ─────────────────────────
def test_black76_implied_vol_roundtrip():
    F, K, T, sigma = 24000.0, 24000.0, 7 / 365, 0.15
    for opt in ("CE", "PE"):
        price = om.black76_price(opt, F, K, T, sigma)
        assert price > 0
        recovered = om.implied_vol(opt, price, F, K, T)
        assert recovered is not None
        assert abs(recovered - sigma * 100) < 0.5   # within 0.5 vol points


def test_black76_degenerate_returns_zero():
    assert om.black76_price("CE", 24000, 24000, 0, 0.15) == 0.0
    assert om.black76_price("CE", 24000, 24000, 0.02, 0) == 0.0
    assert om.greeks("CE", 24000, 24000, 0, 0.15)["gamma"] == 0.0


def test_implied_vol_below_intrinsic_is_none():
    F, K, T = 24000.0, 23000.0, 7 / 365
    # a call worth less than its ~1000 intrinsic can't be priced
    assert om.implied_vol("CE", 10.0, F, K, T) is None
    assert om.implied_vol("CE", 0.0, F, K, T) is None


def test_put_call_iv_agree():
    """CE and PE IV recovered from the same forward should agree closely."""
    F, K, T, sigma = 24000.0, 24100.0, 5 / 365, 0.14
    ce_px = om.black76_price("CE", F, K, T, sigma)
    pe_px = om.black76_price("PE", F, K, T, sigma)
    ce_iv = om.implied_vol("CE", ce_px, F, K, T)
    pe_iv = om.implied_vol("PE", pe_px, F, K, T)
    assert abs(ce_iv - pe_iv) < 0.5


# ── ATM IV ────────────────────────────────────────────────────
def test_atm_iv_ignores_zero():
    rows = [_row(100, "CE", iv=14.0), _row(100, "PE", iv=0.0), _row(100, "PE", iv=16.0)]
    assert om.atm_iv(rows, 100) == 15.0     # (14 + 16)/2, the 0 ignored
    assert om.atm_iv([_row(100, "CE", iv=0.0)], 100) is None


def test_iv_percentile_and_label():
    assert om.iv_percentile(10.0) == 0.0
    assert om.iv_percentile(25.0) == 100.0
    assert om.iv_percentile(17.5) == 50.0
    assert om.iv_percentile_label(om.iv_percentile(10.0)) == "Very Low"
    assert om.iv_percentile_label(85.0) == "Very High"


# ── GEX ───────────────────────────────────────────────────────
def test_net_gex_per_1pct_factor():
    # One CE strike, gamma 0.0005, oi 1000, lot 50, spot 24000.
    rows = [{"strike": 24000, "option_type": "CE", "gamma": 0.0005, "oi": 1000}]
    gex = om.net_gex(rows, spot=24000, lot_size=50)
    # total = 0.0005*1000*50 = 25 ; gex = 25 * 24000^2 * 0.01 = 144,000,000 ; /1e7 = 14.4
    assert gex == pytest.approx(14.4, abs=0.01)
    # Without the 0.01 factor it would be 1440 — 100x too large. Guard that.
    assert gex < 100


def test_net_gex_calls_add_puts_subtract():
    calls = [{"strike": 24000, "option_type": "CE", "gamma": 0.0005, "oi": 1000}]
    puts = [{"strike": 24000, "option_type": "PE", "gamma": 0.0005, "oi": 1000}]
    assert om.net_gex(calls, 24000, 50) > 0
    assert om.net_gex(puts, 24000, 50) < 0


def test_gex_label():
    assert "Positive" in om.gex_label(5.0)
    assert "Negative" in om.gex_label(-5.0)
    assert om.gex_label(0.0) == "Neutral"
    assert om.gex_label(None) == "Neutral"


# ── writing posture ───────────────────────────────────────────
def test_writing_posture():
    assert om.writing_posture([
        _row(100, "CE", oi_chg=500), _row(100, "PE", oi_chg=100),
    ]) == "CALL_WRITERS_DOMINANT"
    assert om.writing_posture([
        _row(100, "CE", oi_chg=100), _row(100, "PE", oi_chg=500),
    ]) == "PUT_WRITERS_DOMINANT"
    assert om.writing_posture([]) == "BALANCED"
    # only positive oi_change counts
    assert om.writing_posture([
        _row(100, "CE", oi_chg=-500), _row(100, "PE", oi_chg=300),
    ]) == "PUT_WRITERS_DOMINANT"
