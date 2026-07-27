"""
Unit coverage for the provider-agnostic staleness contract.

The asymmetry under test is the whole point: opening a position on stale data
raises, a scheduler sweep quietly declines to trigger, and neither is confused
for the other.
"""

import time
from datetime import datetime, timedelta, timezone

import pytest

from app.config import settings
from app.market import freshness


def chain(**over):
    data = {
        "instrument": "NIFTY",
        "source": "kite_live",
        "as_of": datetime.now(timezone.utc).isoformat(),
        "age_ms": 500,
    }
    data.update(over)
    return data


@pytest.fixture
def production(monkeypatch):
    """freshness deliberately relaxes in development; test the real rules."""
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    return settings


# ── age derivation ────────────────────────────────────────────

def test_age_uses_explicit_age_ms_when_present():
    assert freshness.age_ms(chain(age_ms=1234)) == 1234


def test_age_falls_back_to_as_of():
    ts = (datetime.now(timezone.utc) - timedelta(seconds=5)).isoformat()
    age = freshness.age_ms({"as_of": ts})
    assert 4000 <= age <= 7000


def test_age_falls_back_to_plain_timestamp():
    """Fyers and mock stamp `timestamp`, never `as_of`."""
    ts = (datetime.now() - timedelta(seconds=3)).isoformat()   # naive, as they emit
    age = freshness.age_ms({"timestamp": ts})
    assert 2000 <= age <= 5000


def test_age_is_none_when_unknowable():
    assert freshness.age_ms({}) is None
    assert freshness.age_ms({"timestamp": "not-a-date"}) is None


# ── ordering ──────────────────────────────────────────────────

def test_fresh_live_chain_is_orderable(production):
    freshness.assert_orderable(chain())


def test_stale_chain_is_refused(production):
    stale = chain(age_ms=(settings.MARKET_ORDER_BLOCK_SECONDS + 5) * 1000)
    with pytest.raises(RuntimeError, match="too stale"):
        freshness.assert_orderable(stale, instrument="NIFTY")


def test_unavailable_source_is_refused(production):
    with pytest.raises(RuntimeError, match="unavailable"):
        freshness.assert_orderable(chain(source="unavailable"))


def test_missing_timestamp_is_refused_in_production(production):
    with pytest.raises(RuntimeError, match="no timestamp"):
        freshness.assert_orderable({"source": "fyers"})


@pytest.mark.parametrize("source", ["mock", "mock_fallback"])
def test_simulated_sources_are_refused_in_production(production, source):
    with pytest.raises(RuntimeError, match="simulated"):
        freshness.assert_orderable(chain(source=source), instrument="NIFTY")


def test_simulated_sources_are_allowed_in_development(monkeypatch):
    """The mock provider IS the data source locally; blocking it blocks dev."""
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    freshness.assert_orderable(chain(source="mock"))
    freshness.assert_orderable({"source": "mock"})   # no timestamp either


def test_raises_runtimeerror_so_existing_handlers_still_convert_it(production):
    """
    The order paths catch RuntimeError and re-raise QuoteUnavailableError (a
    clean 400). Narrowing this type would turn stale quotes into 500s.
    """
    with pytest.raises(RuntimeError):
        freshness.assert_orderable(chain(source="unavailable"))


# ── scheduler triggering ──────────────────────────────────────

def test_is_tradeable_is_true_for_a_fresh_chain(production):
    assert freshness.is_tradeable(chain()) is True


def test_is_tradeable_returns_false_instead_of_raising(production):
    """
    A stale sweep is not an error — it is a reason to do nothing and retry on
    the next tick. Raising here would abort the whole sweep for every user.
    """
    stale = chain(age_ms=(settings.MARKET_ORDER_BLOCK_SECONDS + 5) * 1000)
    assert freshness.is_tradeable(stale, instrument="NIFTY") is False


def test_is_tradeable_is_false_when_data_is_missing(production):
    assert freshness.is_tradeable({}) is False


# ── stamping ──────────────────────────────────────────────────

def test_stamp_adds_the_canonical_fields():
    out = freshness.stamp({}, as_of=time.time(), source="fyers")
    assert out["source"] == "fyers"
    assert out["is_stale"] is False
    assert out["age_ms"] < 1000
    assert out["as_of"].endswith("+00:00")


def test_stamp_marks_unusable_timestamps_stale():
    out = freshness.stamp({}, as_of=None, source="fyers")
    assert out["is_stale"] is True
    assert out["age_ms"] is None
