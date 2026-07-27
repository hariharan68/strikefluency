from __future__ import annotations

from functools import lru_cache

from app.brokers.base import InstrumentRef, MarketDataAdapter
from app.config import settings
from app.core.paper_trading_policy import assert_read_only_market_data_adapter


@lru_cache(maxsize=4)
def _adapter_for_vendor(vendor: str) -> MarketDataAdapter:
    if vendor == "fyers":
        from app.brokers.fyers.adapter import FyersMarketDataAdapter

        adapter = FyersMarketDataAdapter()

    elif vendor == "kite":
        from app.brokers.kite_adapter import KiteMarketDataAdapter

        adapter = KiteMarketDataAdapter()

    else:
        from app.brokers.mock_adapter import MockMarketDataAdapter

        adapter = MockMarketDataAdapter()

    assert_read_only_market_data_adapter(adapter)
    return adapter


def get_market_data_adapter(ref: InstrumentRef | None = None) -> MarketDataAdapter:
    vendor = getattr(settings, "MARKET_DATA_VENDOR", "") or getattr(settings, "MARKET_DATA_PROVIDER", "mock")
    return _adapter_for_vendor(vendor.lower())


def reset_adapter_registry() -> None:
    _adapter_for_vendor.cache_clear()
