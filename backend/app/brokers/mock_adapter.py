from __future__ import annotations

from typing import Any

from app.brokers.base import BrokerAdapter, InstrumentRef
from app.market.mock_provider import MockMarketDataProvider


class MockAdapter(BrokerAdapter):
    def __init__(self) -> None:
        self.provider = MockMarketDataProvider()

    def get_spot(self, ref: InstrumentRef) -> dict[str, Any]:
        return {
            "instrument": ref.instrument,
            "spot_price": self.provider.get_spot_price(ref.instrument),
        }

    def get_option_chain(self, ref: InstrumentRef, expiry_date: str | None = None) -> dict[str, Any]:
        return self.provider.get_option_chain(ref.instrument, expiry_date)

    def is_connected(self) -> bool:
        return self.provider.is_connected()
