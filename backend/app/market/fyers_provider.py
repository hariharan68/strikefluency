"""Live market data from Fyers API v3 with cache and mock fallback."""

import logging
from datetime import datetime, timedelta
from typing import Any

from app.market.base import MarketDataProvider
from app.market.mock_provider import MockMarketDataProvider

logger = logging.getLogger(__name__)

FYERS_SYMBOLS = {
    "NIFTY": "NSE:NIFTY50-INDEX",
    "BANKNIFTY": "NSE:NIFTYBANK-INDEX",
    "SENSEX": "BSE:SENSEX-INDEX",
}

LOT_SIZES = {
    "NIFTY": 65,
    "BANKNIFTY": 30,
    "SENSEX": 20,
}

SPOT_TTL_SECONDS = 35
OPTION_CHAIN_TTL_SECONDS = 95
HISTORY_TTL_SECONDS = 3600


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

    def _parse_option_chain(self, instrument: str, data: dict) -> dict:
        options_chain = data.get("optionsChain", [])
        expiry_data = data.get("expiryData", [])
        nearest_expiry = expiry_data[0]["expiry"] if expiry_data else "unknown"

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
            "timestamp": datetime.now().isoformat(),
            "pcr": pcr,
            "lot_size": LOT_SIZES.get(instrument, 50),
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
