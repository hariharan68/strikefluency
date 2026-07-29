"""
app/market/freshness.py
───────────────────────
One staleness contract for every market-data provider.

Before this module, only Kite carried `as_of` / `age_ms` / `is_stale`, and only
Kite had `assert_orderable`. Fyers and the mock had no staleness
concept at all — a frozen chain looked exactly like a live one — and even on
Kite the check ran at just two of the five places a fill can happen.

The three questions callers ask, and the deliberately different answers:

    assert_orderable(chain)   Opening a NEW position on stale data is never
                              acceptable. Raises. (Doc section 18: "reject new
                              market orders".)

    is_tradeable(chain)       Should a scheduler TRIGGER on this price? A stale
                              tick can fire a stop-loss that never actually hit,
                              or fill a limit the market never reached. Returns
                              False so the sweep skips and retries. (Doc section
                              18: "pause pending-order execution".)

    Exit freshness is not    During market hours, close_position may use its
    gated.                    bounded current_ltp fallback rather than trap a
                              user because one quote is stale. The independent
                              market-hours execution guard still blocks every
                              off-hours exit.

Staleness thresholds are two-tier, mirroring what Kite already did: a quote can
be too old to *open* on well before it is too old to display.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Any, Optional

from app.config import settings

logger = logging.getLogger(__name__)

# Sources that are not live market data at all. Ordering against these is
# always refused, however recent the timestamp claims to be.
NON_LIVE_SOURCES = {
    "unavailable",
    "mock",
    "mock_fallback",
}


def _to_epoch(value: Any) -> Optional[float]:
    """Accept epoch seconds, a datetime, or an ISO string; None if unusable."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, datetime):
        dt = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        return dt.timestamp()
    if isinstance(value, str):
        try:
            dt = datetime.fromisoformat(value)
        except ValueError:
            return None
        if dt.tzinfo is None:
            # Providers stamp naive datetime.now(), i.e. local wall clock.
            dt = dt.astimezone()
        return dt.timestamp()
    return None


def stamp(data: dict, *, as_of: Any, source: str) -> dict:
    """
    Add the canonical freshness fields to a provider payload, in place.

    Providers that already stamp themselves (Kite) do not need this; it exists
    so the ones that never did produce the same shape.
    """
    epoch = _to_epoch(as_of)
    if epoch is None:
        data.setdefault("source", source)
        data["as_of"] = None
        data["age_ms"] = None
        data["is_stale"] = True
        return data

    age = int(max(0.0, time.time() - epoch) * 1000)
    data.setdefault("source", source)
    data["as_of"] = datetime.fromtimestamp(epoch, timezone.utc).isoformat()
    data["age_ms"] = age
    data["is_stale"] = age > settings.MARKET_TICK_STALE_SECONDS * 1000
    return data


def age_ms(chain: dict) -> Optional[int]:
    """
    How old the chain is, in milliseconds. None when unknowable — which callers
    must treat as stale, never as fresh.
    """
    if not isinstance(chain, dict):
        return None
    if chain.get("age_ms") is not None:
        return int(chain["age_ms"])
    epoch = _to_epoch(chain.get("as_of") or chain.get("timestamp"))
    if epoch is None:
        return None
    return int(max(0.0, time.time() - epoch) * 1000)


def is_live_source(chain: dict) -> bool:
    source = (chain or {}).get("source")
    if source is None:
        return True   # provider does not report one; judge on age alone
    return source not in NON_LIVE_SOURCES


def assert_orderable(chain: dict, *, instrument: str = "") -> None:
    """
    Refuse to open a new position against data that is stale, absent, or not
    live at all.

    Raises RuntimeError, which the order paths already convert into
    QuoteUnavailableError (a clean 400). Kept as RuntimeError deliberately so
    the existing catch sites keep working.

    Outside production the mock provider IS the data source, so simulated
    sources are tolerated — otherwise nothing could be traded locally or in CI.

    The gate is `is_production`, deliberately NOT `not is_development`.
    ENVIRONMENT is a free string and `testing` is neither "development" nor
    "production", so gating on is_development refused the mock chain in CI and
    broke every order-placing test. Only production should be strict; everything
    else is a place where simulated data is the point.
    """
    # A provider may still implement its own stricter check (Kite does).
    if (chain or {}).get("source") == "unavailable":
        raise RuntimeError(
            f"Live market data is unavailable{f' for {instrument}' if instrument else ''}"
        )

    if not is_live_source(chain) and settings.is_production:
        raise RuntimeError(
            f"Market data for {instrument or 'this instrument'} is simulated, "
            "not live — refusing to open a position against it"
        )

    age = age_ms(chain)
    if age is None:
        if not settings.is_production:
            return
        raise RuntimeError(
            f"Market data for {instrument or 'this instrument'} has no timestamp; "
            "cannot confirm it is current"
        )

    if age > settings.MARKET_ORDER_BLOCK_SECONDS * 1000:
        raise RuntimeError(
            f"Market data for {instrument or 'this instrument'} is "
            f"{age / 1000:.1f}s old — too stale to open a new position"
        )


def is_tradeable(chain: dict, *, instrument: str = "") -> bool:
    """
    Whether a scheduler sweep may TRIGGER on this chain.

    Returns False rather than raising: a stale sweep is not an error, it is a
    reason to do nothing and try again on the next tick. Triggering on a stale
    price is the failure mode that matters — it fires a stop-loss the market
    never actually hit.
    """
    try:
        assert_orderable(chain, instrument=instrument)
        return True
    except RuntimeError as exc:
        logger.warning(
            "Skipping scheduled trigger for %s: %s", instrument or "?", exc
        )
        return False
