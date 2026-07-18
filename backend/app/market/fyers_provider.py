"""Live market data from Fyers API v3 with cache and mock fallback."""

import logging
from datetime import datetime, timedelta
from typing import Any

from app.core.instruments import get_spec
from app.market.base import MarketDataProvider
from app.market.mock_provider import MockMarketDataProvider

logger = logging.getLogger(__name__)

FYERS_SYMBOLS = {
    "NIFTY": "NSE:NIFTY50-INDEX",
    "BANKNIFTY": "NSE:NIFTYBANK-INDEX",
    "SENSEX": "BSE:SENSEX-INDEX",
}

SPOT_TTL_SECONDS = 35
OPTION_CHAIN_TTL_SECONDS = 95
HISTORY_TTL_SECONDS = 3600
EXPIRY_TTL_SECONDS = 3600   # the expiry list changes at most once a week


class FyersMarketDataProvider(MarketDataProvider):
    def __init__(self, app_id: str, access_token: str):
        self.app_id = app_id
        self.access_token = access_token
        self._connected = False
        self._fyers = None
        self._mock = MockMarketDataProvider()
        self._cache: dict[tuple[Any, ...], tuple[datetime, Any]] = {}
        self._last_good: dict[tuple[Any, ...], Any] = {}
        self._connect()

    def _connect(self):
        try:
            from fyers_apiv3 import fyersModel

            self._fyers = fyersModel.FyersModel(
                client_id=self.app_id,
                is_async=False,
                token=self.access_token,
                log_path="",
            )

            test = self._fyers.get_profile()
            if test.get("code") == 200 or test.get("s") == "ok":
                self._connected = True
                logger.info("Fyers token valid - live market data active")
            else:
                self._connected = False
                logger.warning("Fyers token invalid: %s", test)
        except Exception as e:
            self._connected = False
            logger.error("Fyers connection failed: %s", e)

    def is_connected(self) -> bool:
        return self._connected

    def get_spot_price(self, instrument: str) -> float:
        key = ("spot", instrument)
        cached = self._get_cached(key, SPOT_TTL_SECONDS)
        if cached is not None:
            return float(cached)

        try:
            value = self._fetch_spot_price(instrument)
            self._store_good(key, value)
            return value
        except Exception as e:
            logger.warning("Fyers spot fallback for %s: %s", instrument, e)
            last = self._last_good.get(key)
            if last is not None:
                return float(last)
            return self._mock.get_spot_price(instrument)

    def get_option_chain(self, instrument: str, expiry: str = None) -> dict:
        key = ("chain", instrument, expiry or "")
        cached = self._get_cached(key, OPTION_CHAIN_TTL_SECONDS)
        if cached is not None:
            return cached

        try:
            value = self._fetch_option_chain(instrument, expiry)
            self._store_good(key, value)
            return value
        except Exception as e:
            logger.warning("Fyers option-chain fallback for %s: %s", instrument, e)
            last = self._last_good.get(key)
            if last is not None:
                fallback = dict(last)
                fallback["source"] = "fyers_cached"
                return fallback
            data = self._mock.get_option_chain(instrument, expiry)
            data["source"] = "mock_fallback"
            return data

    def get_ltp(self, instrument: str, strike: int, option_type: str, expiry: str) -> float:
        key = ("ltp", instrument, strike, option_type, expiry)
        cached = self._get_cached(key, SPOT_TTL_SECONDS)
        if cached is not None:
            return float(cached)

        try:
            value = self._fetch_ltp(instrument, strike, option_type, expiry)
            self._store_good(key, value)
            return value
        except Exception as e:
            logger.warning("Fyers LTP fallback for %s %s %s %s: %s", instrument, expiry, strike, option_type, e)
            last = self._last_good.get(key)
            if last is not None:
                return float(last)
            return self._mock.get_ltp(instrument, strike, option_type, expiry)

    def get_history(self, instrument: str, days: int = 60, resolution: str = "D") -> dict:
        key = ("history", instrument, days, resolution)
        cached = self._get_cached(key, HISTORY_TTL_SECONDS)
        if cached is not None:
            return cached
        return {"instrument": instrument, "candles": [], "source": "not_implemented"}

    def get_futures(self, instrument: str) -> dict:
        return {"instrument": instrument, "futures": None, "source": "not_implemented"}

    def _fetch_spot_price(self, instrument: str) -> float:
        if not self._fyers:
            raise ConnectionError("Fyers not connected")

        fyers_symbol = FYERS_SYMBOLS.get(instrument)
        if not fyers_symbol:
            raise ValueError(f"Unknown instrument: {instrument}")

        response = self._fyers.quotes(data={"symbols": fyers_symbol})
        if response.get("s") == "ok":
            return float(response["d"][0]["v"]["lp"])
        raise RuntimeError(f"Fyers quotes error: {response}")

    def _fetch_option_chain(self, instrument: str, expiry: str = None) -> dict:
        if not self._fyers:
            raise ConnectionError("Fyers not connected")

        fyers_symbol = FYERS_SYMBOLS.get(instrument)
        if not fyers_symbol:
            raise ValueError(f"Unknown instrument: {instrument}")

        payload = {
            "symbol": fyers_symbol,
            "strikecount": 10,
            "timestamp": "",
        }
        response = self._fyers.optionchain(data=payload)
        if response.get("s") != "ok":
            raise RuntimeError(f"Fyers option chain error: {response}")

        parsed = self._parse_option_chain(instrument, response["data"])
        parsed["source"] = "fyers"
        return parsed

    def _fetch_ltp(self, instrument: str, strike: int, option_type: str, expiry: str) -> float:
        if not self._fyers:
            raise ConnectionError("Fyers not connected")

        fyers_option_symbol = self._build_option_symbol(instrument, strike, option_type, expiry)
        response = self._fyers.quotes(data={"symbols": fyers_option_symbol})
        if response.get("s") == "ok":
            return float(response["d"][0]["v"]["lp"])
        raise RuntimeError(f"Fyers LTP error: {response}")

    @staticmethod
    def _normalise_expiry(entry: dict) -> str | None:
        """
        Coerce one Fyers expiryData entry to "YYYY-MM-DD".

        Fyers is inconsistent here: entries carry a `date` (seen as DD-MM-YYYY)
        and an `expiry` (epoch seconds, as a string). Try both, and return None
        rather than guessing if neither parses — a wrong expiry silently prices
        the wrong contract.
        """
        raw_date = entry.get("date")
        if raw_date:
            for fmt in ("%d-%m-%Y", "%Y-%m-%d", "%d-%b-%Y"):
                try:
                    return datetime.strptime(str(raw_date), fmt).date().isoformat()
                except ValueError:
                    continue

        raw_expiry = entry.get("expiry")
        if raw_expiry is not None:
            try:
                return datetime.fromtimestamp(int(raw_expiry)).date().isoformat()
            except (ValueError, OSError, OverflowError):
                pass

        logger.warning("Unparseable Fyers expiry entry: %s", entry)
        return None

    def get_expiries(self, instrument: str) -> list[str]:
        """
        Fyers' own expiry list — holiday-adjusted, and correct across SEBI
        expiry-day changes without any code change here.
        """
        key = ("expiries", instrument)
        cached = self._get_cached(key, EXPIRY_TTL_SECONDS)
        if cached is not None:
            return list(cached)

        try:
            value = self._fetch_expiries(instrument)
            if not value:
                raise RuntimeError("Fyers returned an empty expiry list")
            self._store_good(key, value)
            return value
        except Exception as e:
            logger.warning("Fyers expiry fallback for %s: %s", instrument, e)
            last = self._last_good.get(key)
            if last is not None:
                return list(last)
            return self._mock.get_expiries(instrument)

    def _fetch_expiries(self, instrument: str) -> list[str]:
        if not self._fyers:
            raise ConnectionError("Fyers not connected")

        symbol = FYERS_SYMBOLS.get(instrument)
        if symbol is None:
            raise ValueError(f"No Fyers symbol mapped for {instrument!r}")

        response = self._fyers.optionchain(
            data={"symbol": symbol, "strikecount": 1, "timestamp": ""}
        )
        if response.get("s") != "ok":
            raise RuntimeError(f"Fyers option-chain error: {response}")

        entries = response.get("data", {}).get("expiryData", []) or []
        parsed = [self._normalise_expiry(e) for e in entries]
        return sorted({p for p in parsed if p})

    def _parse_option_chain(self, instrument: str, data: dict) -> dict:
        options_chain = data.get("optionsChain", [])
        expiry_data = data.get("expiryData", [])

        # Keep the whole list. This previously kept expiry_data[0]["expiry"] and
        # dropped the rest — which both starved calendar spreads of the other
        # expiries and put a raw epoch string into a field documented as
        # "YYYY-MM-DD".
        expiries = sorted({
            e for e in (self._normalise_expiry(x) for x in expiry_data) if e
        })
        nearest_expiry = expiries[0] if expiries else "unknown"

        strikes_map = {}
        for contract in options_chain:
            strike = int(contract.get("strikePrice", 0))
            opt_type = contract.get("option_type", "CE")
            if strike not in strikes_map:
                strikes_map[strike] = {"strike": strike, "ce": {}, "pe": {}}

            side = "ce" if opt_type == "CE" else "pe"
            strikes_map[strike][side] = {
                "ltp": float(contract.get("ltp", 0)),
                "oi": int(contract.get("openInterest", 0)),
                "volume": int(contract.get("vol", 0)),
                "iv": float(contract.get("iv", 0)),
                "bid": float(contract.get("bid", 0)),
                "ask": float(contract.get("ask", 0)),
                "delta": float(contract.get("delta", 0)),
            }

        sorted_strikes = sorted(strikes_map.values(), key=lambda x: x["strike"])
        spot_price = float(data.get("underlyingValue", 0))
        atm_strike = self._get_atm_strike(spot_price, sorted_strikes)
        total_ce_oi = sum(s["ce"].get("oi", 0) for s in sorted_strikes if s.get("ce"))
        total_pe_oi = sum(s["pe"].get("oi", 0) for s in sorted_strikes if s.get("pe"))
        pcr = round(total_pe_oi / total_ce_oi, 2) if total_ce_oi > 0 else 0

        return {
            "instrument": instrument,
            "spot_price": spot_price,
            "atm_strike": atm_strike,
            "expiry": nearest_expiry,
            "expiries": expiries,
            "timestamp": datetime.now().isoformat(),
            "pcr": pcr,
            "lot_size": get_spec(instrument).lot_size,
            "strikes": sorted_strikes,
        }

    def _get_atm_strike(self, spot_price: float, strikes: list) -> int:
        if not strikes:
            return int(spot_price)
        return min(strikes, key=lambda s: abs(s["strike"] - spot_price))["strike"]

    def _build_option_symbol(self, instrument: str, strike: int, option_type: str, expiry: str) -> str:
        dt = datetime.strptime(expiry, "%Y-%m-%d")
        expiry_str = dt.strftime("%y%m%d")
        exchange = "BSE" if instrument == "SENSEX" else "NSE"
        return f"{exchange}:{instrument}{expiry_str}{strike}{option_type}"

    def _get_cached(self, key: tuple[Any, ...], ttl_seconds: int):
        entry = self._cache.get(key)
        if not entry:
            return None
        stored_at, value = entry
        if datetime.now() - stored_at <= timedelta(seconds=ttl_seconds):
            return value
        return None

    def _store_good(self, key: tuple[Any, ...], value):
        self._cache[key] = (datetime.now(), value)
        self._last_good[key] = value
