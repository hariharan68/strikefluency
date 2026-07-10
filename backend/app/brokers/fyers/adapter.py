from __future__ import annotations

from typing import Any

from app.brokers.base import BrokerAdapter, InstrumentRef
from app.market.provider_factory import get_market_provider


class FyersAdapter(BrokerAdapter):
    def _provider(self):
        return get_market_provider()

    def get_spot(self, ref: InstrumentRef) -> dict[str, Any]:
        return {
            "instrument": ref.instrument,
            "spot_price": self._provider().get_spot_price(ref.instrument),
        }

    def get_option_chain(self, ref: InstrumentRef, expiry_date: str | None = None) -> dict[str, Any]:
        return self._provider().get_option_chain(ref.instrument, expiry_date)

    def get_futures(self, ref: InstrumentRef) -> dict[str, Any]:
        provider = self._provider()
        if hasattr(provider, "get_futures"):
            return provider.get_futures(ref.instrument)
        return {"instrument": ref.instrument, "futures": None}

    def get_history(self, ref: InstrumentRef, days: int = 60, resolution: str = "D") -> dict[str, Any]:
        provider = self._provider()
        if hasattr(provider, "get_history"):
            return provider.get_history(ref.instrument, days=days, resolution=resolution)
        return {"instrument": ref.instrument, "candles": []}

    def is_connected(self) -> bool:
        return self._provider().is_connected()
