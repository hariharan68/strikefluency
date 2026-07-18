"""
Unit tests for the option-chain adapter (Phase 6).

Uses a deterministic in-memory fake provider (the real mock drifts spot every
call, which is fine for a demo but useless for exact assertions).
"""

from datetime import date

import pytest

from app.core.constants import OrderAction
from app.core.instruments import get_spec
from app.strategy.chain import ChainPricer, StrikeNotInChainError
from app.strategy.builder import make_leg
from app.strategy.domain import Strategy

EXP = date(2026, 7, 21)
SPOT = 24000.0
ATM = 24000


class FakeProvider:
    """Deterministic 7-strike chain around ATM (24000), IV in percent."""

    def __init__(self, source="live", timestamp="2026-07-21T10:00:00"):
        self.source = source
        self.timestamp = timestamp

    def get_option_chain(self, instrument, expiry=None):
        strikes = []
        for k in range(ATM - 150, ATM + 151, 50):   # 24 strikes? no: 7 strikes
            moneyness = k - ATM
            strikes.append({
                "strike": k,
                "ce": {"ltp": max(1.0, 120 - moneyness * 0.4), "oi": 1000,
                       "volume": 100, "iv": 14.0, "bid": 1.0, "ask": 2.0},
                "pe": {"ltp": max(1.0, 120 + moneyness * 0.4), "oi": 1000,
                       "volume": 100, "iv": 14.0, "bid": 1.0, "ask": 2.0},
            })
        return {
            "instrument": instrument, "spot_price": SPOT, "atm_strike": ATM,
            "expiry": (expiry or EXP.isoformat()), "timestamp": self.timestamp,
            "pcr": 1.0, "lot_size": get_spec(instrument).lot_size,
            "source": self.source, "strikes": strikes,
        }


def _pricer(**kw):
    return ChainPricer(FakeProvider(**kw), "NIFTY")


# ── the far-OTM fix ───────────────────────────────────────────
def test_missing_strike_raises_not_silent_spot():
    p = _pricer()
    with pytest.raises(StrikeNotInChainError):
        p.build_contract(30000, "CE", EXP)   # miles outside the 7-strike window


def test_atm_contract_prices_with_decimal_iv_and_greeks():
    c = _pricer().build_contract(ATM, "CE", EXP)
    assert c.ltp == 120.0
    assert 0 < c.iv < 1          # percent -> decimal
    assert c.gamma is not None   # greeks computed from IV, not provider delta


def test_future_prices_at_spot_without_chain_lookup():
    c = _pricer().build_contract(None, "FUT", EXP)
    assert c.ltp == SPOT and c.delta == 1.0


def test_zero_ltp_reads_as_no_quote():
    class ZeroProv(FakeProvider):
        def get_option_chain(self, instrument, expiry=None):
            ch = super().get_option_chain(instrument, expiry)
            ch["strikes"][3]["ce"]["ltp"] = 0
            return ch
    p = ChainPricer(ZeroProv(), "NIFTY")
    strike = p.chain_for(EXP)["strikes"][3]["strike"]
    c = p.build_contract(strike, "CE", EXP)
    assert not c.has_tradeable_price   # zero LTP is absent, not free


# ── strategy pricing report ───────────────────────────────────
def _straddle():
    s = Strategy(underlying="NIFTY", name="Short Straddle")
    lot = get_spec("NIFTY").lot_size
    for opt in ("CE", "PE"):
        s.legs.append(make_leg("NIFTY", opt, OrderAction.SELL, 1, EXP, strike=ATM))
    return s


def test_price_strategy_sets_entry_and_reports_ok():
    p = _pricer(source="live")
    s = _straddle()
    report = p.price_strategy(s, set_entry=True)
    assert report.all_priced
    assert report.ok                      # live + fresh
    assert all(leg.entry_price is not None for leg in s.legs)


def test_mock_source_flagged_degraded():
    report = _pricer(source="mock").price_strategy(_straddle(), set_entry=True)
    assert report.all_priced            # priced fine...
    assert not report.ok                # ...but not "ok" — degraded data
    assert "degraded/mock quote" in report.problems


def test_stale_timestamp_flagged():
    report = _pricer(timestamp="2020-01-01T10:00:00").price_strategy(_straddle())
    assert not report.ok
    assert "stale quote" in report.problems


def test_missing_leg_reported_not_raised_in_price_strategy():
    p = _pricer()
    s = Strategy(underlying="NIFTY")
    s.legs.append(make_leg("NIFTY", "CE", OrderAction.SELL, 1, EXP, strike=30000))
    report = p.price_strategy(s)
    assert not report.all_priced
    assert not report.quotes[0].found     # flagged, whole call didn't blow up
