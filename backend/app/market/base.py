"""
app/market/base.py
───────────────────
Abstract base class for all market data providers.

Every provider (Fyers, Truedata, Mock) implements this interface.
The rest of the app only talks to this interface — never to a
specific provider directly. This is what makes swapping providers
a one-line .env change.

Canonical option chain data format returned by all providers:
{
    "instrument": "NIFTY",
    "spot_price": 22150.5,
    "atm_strike": 22150,
    "expiry": "2024-01-11",
    "timestamp": "2024-01-08T09:15:00+05:30",
    "pcr": 1.2,
    "strikes": [
        {
            "strike": 22000,
            "ce": {
                "ltp": 180.5,
                "oi": 123450,
                "volume": 56780,
                "iv": 14.2,
                "bid": 179.5,
                "ask": 181.0
            },
            "pe": {
                "ltp": 95.5,
                "oi": 98000,
                "volume": 45000,
                "iv": 13.8,
                "bid": 94.5,
                "ask": 96.0
            }
        }
    ]
}
"""

from abc import ABC, abstractmethod


class MarketDataProvider(ABC):

    @abstractmethod
    def get_option_chain(self, instrument: str, expiry: str = None) -> dict:
        """
        Fetch full option chain for an instrument.

        Args:
            instrument : "NIFTY" | "BANKNIFTY" | "SENSEX"
            expiry     : "YYYY-MM-DD" for specific expiry,
                         None for nearest weekly expiry

        Returns canonical dict format shown in module docstring.
        """
        pass

    @abstractmethod
    def get_ltp(self, instrument: str, strike: int, option_type: str, expiry: str) -> float:
        """
        Get Last Traded Price for a specific option.

        Args:
            instrument  : "NIFTY" | "BANKNIFTY" | "SENSEX"
            strike      : strike price as integer e.g. 22000
            option_type : "CE" | "PE"
            expiry      : "YYYY-MM-DD"

        Returns LTP as float.
        """
        pass

    @abstractmethod
    def get_spot_price(self, instrument: str) -> float:
        """
        Get current spot price of the underlying index.

        Args:
            instrument : "NIFTY" | "BANKNIFTY" | "SENSEX"

        Returns spot price as float.
        """
        pass

    @abstractmethod
    def get_expiries(self, instrument: str) -> list[str]:
        """
        List available expiry dates, soonest first, as "YYYY-MM-DD".

        A real broker's list is the source of truth: it is already adjusted for
        trading holidays, and it self-corrects when SEBI moves an expiry day —
        no code change on our side. Providers must return the broker's list
        when they have one, and only fall back to app.core.expiry_calendar
        (weekday rules, holiday-blind) when offline.

        Needed for: the UI's expiry tabs, calendar/diagonal spreads, and the
        days-to-expiry that Black-Scholes takes as T.
        """
        pass

    @abstractmethod
    def is_connected(self) -> bool:
        """Return True if the provider connection is healthy."""
        pass