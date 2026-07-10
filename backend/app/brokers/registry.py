from __future__ import annotations

from functools import lru_cache

from app.brokers.base import BrokerAdapter, InstrumentRef
from app.config import settings


@lru_cache(maxsize=4)
def _adapter_for_vendor(vendor: str) -> BrokerAdapter:
    if vendor == "fyers":
        from app.brokers.fyers.adapter import FyersAdapter

        return FyersAdapter()

    from app.brokers.mock_adapter import MockAdapter

    return MockAdapter()


def get_market_data_adapter(ref: InstrumentRef | None = None) -> BrokerAdapter:
    vendor = getattr(settings, "MARKET_DATA_VENDOR", "") or getattr(settings, "MARKET_DATA_PROVIDER", "mock")
    return _adapter_for_vendor(vendor.lower())


def reset_adapter_registry() -> None:
    _adapter_for_vendor.cache_clear()
