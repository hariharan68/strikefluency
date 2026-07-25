from __future__ import annotations

from typing import Any

from app.brokers.base import InstrumentRef, MarketDataAdapter
from app.market.provider_factory import get_market_provider


class KiteMarketDataAdapter(MarketDataAdapter):
    """Read-only adapter for inbound Zerodha market data."""

    def get_spot(self, ref: InstrumentRef) -> dict[str, Any]:
        provider = get_market_provider()
        return provider.get_spot_snapshot(ref.instrument)

    def get_option_chain(
        self, ref: InstrumentRef, expiry_date: str | None = None,
    ) -> dict[str, Any]:
        return get_market_provider().get_option_chain(ref.instrument, expiry_date)

    def is_connected(self) -> bool:
        return get_market_provider().is_connected()

    def get_futures(self, ref: InstrumentRef) -> dict[str, Any]:
        return get_market_provider().get_futures(ref.instrument)

    def get_history(
        self, ref: InstrumentRef, days: int = 60, resolution: str = "D",
    ) -> dict[str, Any]:
        return get_market_provider().get_history(ref.instrument, days, resolution)
