"""
app/market/fyers_provider.py
─────────────────────────────
Live market data from Fyers API v3.
Used for development and testing.

TOKEN ROTATION:
  Fyers access tokens expire daily at 06:00 AM.
  For now: manually update FYERS_ACCESS_TOKEN in .env each morning
           and restart the server.
  Later:   we'll build an automated refresh flow.

IMPORTANT: This provider is for internal testing only.
           In production, switch to Truedata or GlobalDataFeeds
           which have redistribution rights for SaaS products.
"""

import logging
from datetime import datetime
from typing import Optional

from app.market.base import MarketDataProvider

logger = logging.getLogger(__name__)

# Fyers symbol mapping
FYERS_SYMBOLS = {
    "NIFTY":     "NSE:NIFTY50-INDEX",
    "BANKNIFTY": "NSE:NIFTYBANK-INDEX",
    "SENSEX":    "BSE:SENSEX-INDEX",
}

# Lot sizes
LOT_SIZES = {
    "NIFTY":     65,
    "BANKNIFTY": 30,
    "SENSEX":    20,
}


class FyersMarketDataProvider(MarketDataProvider):

    def __init__(self, app_id: str, access_token: str):
        """
        Args:
            app_id       : FYERS_APP_ID from .env (e.g. "9Z5ECCCREG-100")
            access_token : FYERS_ACCESS_TOKEN from .env (daily JWT)
        """
        self.app_id = app_id
        self.access_token = access_token
        self._connected = False
        self._fyers = None
        self._connect()

    def _connect(self):
        """Initialize the Fyers model and verify the token is valid."""
        try:
            from fyers_apiv3 import fyersModel

            self._fyers = fyersModel.FyersModel(
                client_id=self.app_id,
                is_async=False,
                token=self.access_token,
                log_path="",
            )

            # Actually test the token — don't just assume it's valid
            test = self._fyers.get_profile()
            if test.get("code") == 200 or test.get("s") == "ok":
                self._connected = True
                logger.info("Fyers token valid — live market data active")
            else:
                self._connected = False
                logger.warning(
                    f"Fyers token invalid (code {test.get('code')}). "
                    "Update FYERS_ACCESS_TOKEN in .env"
                )

        except Exception as e:
            self._connected = False
            logger.error(f"Fyers connection failed: {e}")

    def is_connected(self) -> bool:
        return self._connected

    def get_spot_price(self, instrument: str) -> float:
        """Get current spot price for NIFTY / BANKNIFTY / SENSEX."""
        if not self._fyers:
            raise ConnectionError("Fyers not connected")

        fyers_symbol = FYERS_SYMBOLS.get(instrument)
        if not fyers_symbol:
            raise ValueError(f"Unknown instrument: {instrument}")

        try:
            response = self._fyers.quotes(data={"symbols": fyers_symbol})
            if response.get("s") == "ok":
                return float(response["d"][0]["v"]["lp"])
            else:
                raise RuntimeError(f"Fyers quotes error: {response}")
        except Exception as e:
            logger.error(f"get_spot_price failed for {instrument}: {e}")
            raise

    def get_option_chain(self, instrument: str, expiry: str = None) -> dict:
        """
        Fetch full option chain from Fyers and convert to canonical format.

        Args:
            instrument : "NIFTY" | "BANKNIFTY" | "SENSEX"
            expiry     : "YYYY-MM-DD" or None for nearest expiry
        """
        if not self._fyers:
            raise ConnectionError("Fyers not connected")

        fyers_symbol = FYERS_SYMBOLS.get(instrument)
        if not fyers_symbol:
            raise ValueError(f"Unknown instrument: {instrument}")

        try:
            payload = {
                "symbol": fyers_symbol,
                "strikecount": 10,
                "timestamp": ""
            }

            response = self._fyers.optionchain(data=payload)

            if response.get("s") != "ok":
                raise RuntimeError(f"Fyers option chain error: {response}")

            return self._parse_option_chain(instrument, response["data"])

        except Exception as e:
            logger.error(f"get_option_chain failed for {instrument}: {e}")
            raise

    def get_ltp(self, instrument: str, strike: int, option_type: str, expiry: str) -> float:
        """Get LTP for a specific option contract."""
        if not self._fyers:
            raise ConnectionError("Fyers not connected")

        try:
            fyers_option_symbol = self._build_option_symbol(
                instrument, strike, option_type, expiry
            )
            response = self._fyers.quotes(data={"symbols": fyers_option_symbol})

            if response.get("s") == "ok":
                return float(response["d"][0]["v"]["lp"])
            else:
                raise RuntimeError(f"Fyers LTP error: {response}")

        except Exception as e:
            logger.error(f"get_ltp failed: {e}")
            raise

    # ── Private helpers ───────────────────────────────────────

    def _parse_option_chain(self, instrument: str, data: dict) -> dict:
        """Convert Fyers option chain response → canonical format."""
        options_chain = data.get("optionsChain", [])
        expiry_data   = data.get("expiryData", [])

        nearest_expiry = expiry_data[0]["expiry"] if expiry_data else "unknown"

        strikes_map = {}
        for contract in options_chain:
            strike = int(contract.get("strikePrice", 0))
            opt_type = contract.get("option_type", "CE")

            if strike not in strikes_map:
                strikes_map[strike] = {"strike": strike, "ce": {}, "pe": {}}

            side = "ce" if opt_type == "CE" else "pe"
            strikes_map[strike][side] = {
                "ltp":    float(contract.get("ltp", 0)),
                "oi":     int(contract.get("openInterest", 0)),
                "volume": int(contract.get("vol", 0)),
                "iv":     float(contract.get("iv", 0)),
                "bid":    float(contract.get("bid", 0)),
                "ask":    float(contract.get("ask", 0)),
                "delta":  float(contract.get("delta", 0)),
            }

        sorted_strikes = sorted(strikes_map.values(), key=lambda x: x["strike"])

        spot_price = float(data.get("underlyingValue", 0))
        atm_strike = self._get_atm_strike(spot_price, sorted_strikes)

        total_ce_oi = sum(
            s["ce"].get("oi", 0) for s in sorted_strikes if s.get("ce")
        )
        total_pe_oi = sum(
            s["pe"].get("oi", 0) for s in sorted_strikes if s.get("pe")
        )
        pcr = round(total_pe_oi / total_ce_oi, 2) if total_ce_oi > 0 else 0

        return {
            "instrument":  instrument,
            "spot_price":  spot_price,
            "atm_strike":  atm_strike,
            "expiry":      nearest_expiry,
            "timestamp":   datetime.now().isoformat(),
            "pcr":         pcr,
            "lot_size":    LOT_SIZES.get(instrument, 50),
            "strikes":     sorted_strikes,
        }

    def _get_atm_strike(self, spot_price: float, strikes: list) -> int:
        """Find the strike closest to spot price."""
        if not strikes:
            return int(spot_price)
        return min(strikes, key=lambda s: abs(s["strike"] - spot_price))["strike"]

    def _build_option_symbol(
        self, instrument: str, strike: int, option_type: str, expiry: str
    ) -> str:
        """
        Build Fyers option symbol string.
        Format: NSE:NIFTY25011622000CE
        """
        dt = datetime.strptime(expiry, "%Y-%m-%d")
        expiry_str = dt.strftime("%y%m%d")

        exchange = "BSE" if instrument == "SENSEX" else "NSE"
        return f"{exchange}:{instrument}{expiry_str}{strike}{option_type}"
