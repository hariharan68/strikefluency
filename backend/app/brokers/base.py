from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class InstrumentRef:
    instrument: str


class BrokerAdapter(ABC):
    @abstractmethod
    def get_spot(self, ref: InstrumentRef) -> dict[str, Any]:
        pass

    @abstractmethod
    def get_option_chain(self, ref: InstrumentRef, expiry_date: str | None = None) -> dict[str, Any]:
        pass

    def get_futures(self, ref: InstrumentRef) -> dict[str, Any]:
        raise NotImplementedError

    def get_history(self, ref: InstrumentRef, days: int = 60, resolution: str = "D") -> dict[str, Any]:
        raise NotImplementedError

    def get_open_interest(self, ref: InstrumentRef, expiry_date: str | None = None) -> dict[str, Any]:
        chain = self.get_option_chain(ref, expiry_date)
        return {
            "instrument": ref.instrument,
            "expiry": chain.get("expiry"),
            "pcr": chain.get("pcr"),
            "strikes": chain.get("strikes", []),
        }

    @abstractmethod
    def is_connected(self) -> bool:
        pass

    def get_positions(self) -> list[dict[str, Any]]:
        return []

    def get_orders(self) -> list[dict[str, Any]]:
        return []

    def get_holdings(self) -> list[dict[str, Any]]:
        return []

    def place_order(self, payload: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError("Live broker order placement is not enabled")
