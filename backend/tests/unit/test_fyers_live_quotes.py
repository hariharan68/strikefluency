import time
from unittest.mock import patch

from app.market.fyers_provider import (
    FYERS_SYMBOLS,
    FyersMarketDataProvider,
    STREAM_QUOTE_TTL_SECONDS,
)


def _provider() -> FyersMarketDataProvider:
    with patch.object(FyersMarketDataProvider, "_connect"):
        return FyersMarketDataProvider("client-id", "access-token")


def _chain() -> dict:
    return {
        "instrument": "NIFTY",
        "expiry": "2026-08-04",
        "timestamp": "2026-07-29T09:15:00",
        "spot_price": 24100.0,
        "atm_strike": 24100,
        "strikes": [{
            "strike": 24150,
            "ce": {"ltp": 100.0, "symbol": "NSE:NIFTY2680424150CE", "oi": 10},
            "pe": {"ltp": 90.0, "symbol": "NSE:NIFTY2680424150PE", "oi": 20},
        }],
    }


def test_live_stream_overlays_prices_without_mutating_rest_snapshot():
    provider = _provider()
    structural = _chain()
    provider._register_chain_symbols(structural)

    provider._on_stream_message({
        "symbol": FYERS_SYMBOLS["NIFTY"],
        "ltp": 24162.4,
        "type": "if",
    })
    provider._on_stream_message({
        "symbol": "NSE:NIFTY2680424150CE",
        "ltp": 103.25,
        "type": "sf",
    })

    result = provider._overlay_live_quotes(structural)

    assert result["spot_price"] == 24162.4
    assert result["atm_strike"] == 24150
    assert result["strikes"][0]["ce"]["ltp"] == 103.25
    assert result["strikes"][0]["ce"]["quote_source"] == "fyers_stream"
    assert result["live_quote_count"] == 2
    assert result["timestamp"] == structural["timestamp"]
    assert structural["spot_price"] == 24100.0
    assert structural["strikes"][0]["ce"]["ltp"] == 100.0

    assert provider.get_ltp("NIFTY", 24150, "CE", "2026-08-04") == 103.25


def test_stale_stream_quote_does_not_replace_structural_price():
    provider = _provider()
    structural = _chain()
    symbol = structural["strikes"][0]["ce"]["symbol"]
    provider._stream_quotes[symbol] = (
        105.0,
        time.monotonic() - STREAM_QUOTE_TTL_SECONDS - 1,
        "2026-07-29T09:15:00+05:30",
    )

    result = provider._overlay_live_quotes(structural)

    assert result["strikes"][0]["ce"]["ltp"] == 100.0
    assert result["live_quote_count"] == 0


def test_stream_message_rejects_invalid_prices():
    provider = _provider()

    provider._on_stream_message({"symbol": "NSE:TEST", "ltp": 0})
    provider._on_stream_message({"symbol": "NSE:TEST", "ltp": "bad"})
    provider._on_stream_message({"ltp": 100})

    assert provider._stream_quotes == {}
