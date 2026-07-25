"""Live market data from Nuvama (API Connect) with cache and mock fallback.

Structurally a twin of app/market/fyers_provider.py: same cache TTLs, same
"try live → fall back to last-good → fall back to mock" safety net, so a dead
token or an un-whitelisted IP degrades to mock data instead of erroring.

Spot indices come from APIConnect's mini-quote stream. APIConnect 2.x does not
offer a REST option-chain method, so option legs remain explicitly marked mock
while their underlying spot is overlaid with the live Nuvama quote.
"""

import json
import logging
from datetime import datetime, timedelta
from socket import SHUT_RDWR
from threading import Event, Lock, Thread
from typing import Any

from app.core.instruments import get_spec
from app.core.paper_trading_policy import read_only_broker_client
from app.market.base import MarketDataProvider
from app.market.mock_provider import MockMarketDataProvider

logger = logging.getLogger(__name__)

# Nuvama's own web client subscribes to index ticks with the raw negative
# streaming symbols.  Appending an exchange suffix (for example ``-29_NSE``)
# is accepted by APIConnect's Python wrapper but silently produces no ticks.
NUVAMA_SYMBOLS = {
    "NIFTY": "-29",
    "BANKNIFTY": "-21",
    "SENSEX": "-101",
}

SPOT_TTL_SECONDS = 3
OPTION_CHAIN_TTL_SECONDS = 95
HISTORY_TTL_SECONDS = 3600
EXPIRY_TTL_SECONDS = 3600   # the expiry list changes at most once a week
STREAM_READY_TIMEOUT_SECONDS = 8


class NuvamaMarketDataProvider(MarketDataProvider):
    def __init__(self, api_key: str, api_secret: str, request_id: str, access_token: str = ""):
        self.api_key = api_key
        self.api_secret = api_secret
        self.request_id = request_id
        self.access_token = access_token
        self._connected = False
        self._api = None
        self._mock = MockMarketDataProvider()
        self._cache: dict[tuple[Any, ...], tuple[datetime, Any]] = {}
        self._last_good: dict[tuple[Any, ...], Any] = {}
        self._stream_quotes: dict[str, float] = {}
        self._stream_lock = Lock()
        self._stream_ready = Event()
        self._quote_streamer = None
        self._connect()

    def _connect(self):
        try:
            from app.brokers.nuvama.sdk import create_api_connect

            self._api = read_only_broker_client(
                create_api_connect(
                    self.api_key,
                    self.api_secret,
                    self.request_id,
                ),
                allowed_operations={
                    "get_option_chain",
                    "getOptionChain",
                    "option_chain",
                    "optionchain",
                },
            )
            self._start_spot_stream()
            self._connected = self._ping()
            if self._connected:
                logger.info("Nuvama session valid - live market data active")
            else:
                logger.warning("Nuvama session did not validate; using mock fallback")
        except SystemExit:
            # APIConnect calls sys.exit() for an expired request id. A broker
            # SDK must never be allowed to terminate the FastAPI process.
            self._connected = False
            self._api = None
            logger.warning("Nuvama request id/session expired; using mock data")
        except ImportError:
            self._connected = False
            logger.warning("Nuvama SDK (APIConnect) not installed; using mock data")
        except Exception as e:
            self._connected = False
            logger.error("Nuvama connection failed: %s", e)

    def _ping(self) -> bool:
        """Wait briefly for the authenticated mini-quote stream."""
        if not self._stream_ready.wait(STREAM_READY_TIMEOUT_SECONDS):
            logger.warning("Nuvama mini-quote stream produced no data")
            return False
        with self._stream_lock:
            return any(price > 0 for price in self._stream_quotes.values())

    def is_connected(self) -> bool:
        return self._connected

    def close(self) -> None:
        """Stop APIConnect's non-daemon feed resources during reset/shutdown."""
        self._connected = False
        feed = getattr(self._api, "_APIConnect__feedObj", None)
        timer = getattr(feed, "_Feed__timer", None)
        if timer is not None:
            try:
                timer.stop()
            except Exception:
                pass
        sock = getattr(feed, "_sock", None)
        if sock is not None:
            try:
                sock.shutdown(SHUT_RDWR)
            except OSError:
                pass
            try:
                sock.close()
            except OSError:
                pass

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
            logger.warning("Nuvama spot fallback for %s: %s", instrument, e)
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
            logger.warning("Nuvama option-chain fallback for %s: %s", instrument, e)
            last = self._last_good.get(key)
            if last is not None:
                fallback = dict(last)
                fallback["source"] = "nuvama_cached"
                return fallback
            data = self._mock.get_option_chain(instrument, expiry)
            # APIConnect 2.x has no REST option-chain method. Keep mock legs for
            # now, but preserve the real Nuvama underlying in WS broadcasts so
            # Terminal 1 cannot be overwritten by a synthetic spot every 3s.
            try:
                live_spot = self._get_cached(("spot", instrument), SPOT_TTL_SECONDS)
                if live_spot is None:
                    live_spot = self._fetch_spot_price(instrument)
                    self._store_good(("spot", instrument), live_spot)
            except Exception:
                live_spot = None
            if live_spot is not None and live_spot > 0:
                data["spot_price"] = live_spot
                strikes = data.get("strikes") or []
                if strikes:
                    data["atm_strike"] = min(
                        strikes,
                        key=lambda row: abs(float(row.get("strike", 0)) - live_spot),
                    ).get("strike")
                data["source"] = "nuvama_live_spot_mock_chain"
            else:
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
            logger.warning("Nuvama LTP fallback for %s %s %s %s: %s", instrument, expiry, strike, option_type, e)
            last = self._last_good.get(key)
            if last is not None:
                return float(last)
            return self._mock.get_ltp(instrument, strike, option_type, expiry)

    def get_expiries(self, instrument: str) -> list[str]:
        key = ("expiries", instrument)
        cached = self._get_cached(key, EXPIRY_TTL_SECONDS)
        if cached is not None:
            return list(cached)
        try:
            value = self._fetch_expiries(instrument)
            if not value:
                raise RuntimeError("Nuvama returned an empty expiry list")
            self._store_good(key, value)
            return value
        except Exception as e:
            logger.warning("Nuvama expiry fallback for %s: %s", instrument, e)
            last = self._last_good.get(key)
            if last is not None:
                return list(last)
            return self._mock.get_expiries(instrument)

    def get_history(self, instrument: str, days: int = 60, resolution: str = "D") -> dict:
        return {"instrument": instrument, "candles": [], "source": "not_implemented"}

    def get_futures(self, instrument: str) -> dict:
        return {"instrument": instrument, "futures": None, "source": "not_implemented"}

    def _start_spot_stream(self) -> None:
        """Subscribe to the SDK feed without blocking the FastAPI thread."""
        def subscribe():
            try:
                from app.brokers.nuvama.sdk import subscribe_index_mini_quotes

                self._quote_streamer = subscribe_index_mini_quotes(
                    self._api,
                    list(NUVAMA_SYMBOLS.values()),
                    self._handle_mini_quote,
                )
            except Exception as exc:
                logger.warning("Could not start Nuvama mini-quote stream: %s", exc)

        Thread(target=subscribe, name="nuvama-mini-quotes", daemon=True).start()

    def _handle_mini_quote(self, raw: Any) -> None:
        try:
            payload = json.loads(raw) if isinstance(raw, str) else raw
            response = payload.get("response", payload) if isinstance(payload, dict) else {}
            data = response.get("data", response) if isinstance(response, dict) else {}
            rows = data if isinstance(data, list) else [data]
            updated = False
            with self._stream_lock:
                for row in rows:
                    if not isinstance(row, dict):
                        continue
                    symbol = str(row.get("sym") or row.get("symbol") or "")
                    raw_ltp = row.get("ltp")
                    if symbol and raw_ltp not in (None, ""):
                        price = float(raw_ltp)
                        if price > 0:
                            self._stream_quotes[symbol] = price
                            updated = True
            if updated:
                self._stream_ready.set()
        except (TypeError, ValueError, json.JSONDecodeError) as exc:
            logger.debug("Ignored malformed Nuvama mini quote: %s", exc)

    # ── live fetch seams ────────────────────────────────────────────────────
    # TODO(nuvama-sdk): the method names/response shapes below are best-effort.
    # Confirm them against the installed APIConnect library on first live run;
    # every one is wrapped by the mock-fallback callers above, so an incorrect
    # guess degrades gracefully rather than breaking the desk.

    def _require_symbol(self, instrument: str) -> str:
        symbol = NUVAMA_SYMBOLS.get(instrument)
        if not symbol:
            raise ValueError(f"Unknown instrument: {instrument}")
        return symbol

    def _fetch_spot_price(self, instrument: str) -> float:
        if not self._api:
            raise ConnectionError("Nuvama not connected")
        symbol = self._require_symbol(instrument)
        if not self._stream_ready.is_set():
            self._stream_ready.wait(2)
        with self._stream_lock:
            value = self._stream_quotes.get(symbol)
        if value is None:
            raise RuntimeError(f"Nuvama mini-quote stream has no price for {instrument}")
        return float(value)

    def _fetch_option_chain(self, instrument: str, expiry: str = None) -> dict:
        if not self._api:
            raise ConnectionError("Nuvama not connected")
        symbol = self._require_symbol(instrument)
        for method in ("get_option_chain", "getOptionChain", "option_chain", "optionchain"):
            fn = getattr(self._api, method, None)
            if callable(fn):
                resp = fn(symbol, expiry) if expiry else fn(symbol)
                parsed = self._parse_option_chain(instrument, resp)
                parsed["source"] = "nuvama"
                return parsed
        raise RuntimeError("Nuvama SDK exposes no known option-chain method")

    def _fetch_ltp(self, instrument: str, strike: int, option_type: str, expiry: str) -> float:
        # Cheapest correct path until the option-symbol format is confirmed: pull
        # the strike's leg out of the full chain, which we already normalise.
        chain = self._fetch_option_chain(instrument, expiry)
        side = "ce" if option_type.upper() == "CE" else "pe"
        for row in chain.get("strikes", []):
            if int(row.get("strike", 0)) == int(strike):
                leg = row.get(side) or {}
                return float(leg.get("ltp") or 0.0)
        raise RuntimeError(f"Strike {strike} {option_type} not found in Nuvama chain")

    def _fetch_expiries(self, instrument: str) -> list[str]:
        chain = self._fetch_option_chain(instrument)
        expiries = chain.get("expiries") or ([chain["expiry"]] if chain.get("expiry") else [])
        return sorted({e for e in expiries if e and e != "unknown"})

    # ── normalisation ───────────────────────────────────────────────────────

    @staticmethod
    def _read_ltp(resp: Any) -> float:
        """Extract LTP from APIConnect.GetMarketDepth's JSON response."""
        if isinstance(resp, (int, float)):
            return float(resp)
        if isinstance(resp, str):
            try:
                resp = json.loads(resp)
            except json.JSONDecodeError as exc:
                raise RuntimeError(f"Nuvama returned invalid quote JSON: {resp[:200]!r}") from exc
        if isinstance(resp, dict):
            error = resp.get("error")
            if isinstance(error, dict):
                message = error.get("errMsg") or error.get("message") or error
                raise RuntimeError(f"Nuvama quote error: {message}")
            data = resp.get("data", resp)
            if isinstance(data, dict) and isinstance(data.get("mkd"), dict):
                data = data["mkd"]
            if isinstance(data, list) and data:
                data = data[0]
            if isinstance(data, dict):
                for k in ("ltp", "lp", "lastPrice", "last_price", "LTP"):
                    if data.get(k) is not None:
                        return float(data[k])
        raise RuntimeError(f"Could not read LTP from Nuvama response: {resp!r}")

    def _parse_option_chain(self, instrument: str, resp: Any) -> dict:
        """Coerce Nuvama's option-chain response into the app's canonical shape.

        TODO(nuvama-sdk): map the real field names once confirmed. Written
        defensively so unknown/missing fields become 0 rather than raising.
        """
        data = resp.get("data", resp) if isinstance(resp, dict) else resp
        rows = data.get("optionChain") or data.get("data") or data.get("chain") or [] if isinstance(data, dict) else []
        spot_price = 0.0
        if isinstance(data, dict):
            spot_price = float(data.get("underlyingValue") or data.get("spot") or data.get("spotPrice") or 0.0)

        strikes_map: dict[int, dict] = {}
        expiries: set[str] = set()
        for row in rows:
            if not isinstance(row, dict):
                continue
            exp = self._normalise_expiry(row.get("expiry") or row.get("expiryDate"))
            if exp:
                expiries.add(exp)
            try:
                strike = int(float(row.get("strike_price") or row.get("strikePrice") or row.get("strike") or 0))
            except (TypeError, ValueError):
                continue
            if strike <= 0:
                continue
            opt_type = str(row.get("option_type") or row.get("optionType") or row.get("type") or "").upper()
            side = "ce" if opt_type in ("CE", "CALL") else "pe" if opt_type in ("PE", "PUT") else None
            if side is None:
                continue
            leg = {
                "ltp": float(row.get("ltp") or row.get("lastPrice") or 0),
                "oi": int(float(row.get("oi") or row.get("openInterest") or 0)),
                "oi_change": int(float(row.get("oi_change") or row.get("changeinOpenInterest") or 0)),
                "volume": int(float(row.get("volume") or row.get("totalTradedVolume") or 0)),
                "iv": float(row.get("iv") or row.get("impliedVolatility") or 0),
                "bid": float(row.get("bid") or row.get("bidprice") or 0),
                "ask": float(row.get("ask") or row.get("askPrice") or 0),
                "delta": float(row.get("delta") or 0),
            }
            strikes_map.setdefault(strike, {"strike": strike, "ce": {}, "pe": {}})[side] = leg

        sorted_strikes = sorted(strikes_map.values(), key=lambda x: x["strike"])
        atm_strike = self._get_atm_strike(spot_price, sorted_strikes)
        total_ce_oi = sum(s["ce"].get("oi", 0) for s in sorted_strikes if s.get("ce"))
        total_pe_oi = sum(s["pe"].get("oi", 0) for s in sorted_strikes if s.get("pe"))
        pcr = round(total_pe_oi / total_ce_oi, 2) if total_ce_oi > 0 else 0
        ordered_expiries = sorted(expiries)

        return {
            "instrument": instrument,
            "spot_price": spot_price,
            "atm_strike": atm_strike,
            "expiry": ordered_expiries[0] if ordered_expiries else "unknown",
            "expiries": ordered_expiries,
            "timestamp": datetime.now().isoformat(),
            "pcr": pcr,
            "lot_size": get_spec(instrument).lot_size,
            "change_pct": 0.0,
            "future_price": 0.0,
            "strikes": sorted_strikes,
        }

    @staticmethod
    def _normalise_expiry(raw: Any) -> str | None:
        if not raw:
            return None
        raw = str(raw)
        for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d-%b-%Y", "%d%b%Y", "%d-%b-%y"):
            try:
                return datetime.strptime(raw, fmt).date().isoformat()
            except ValueError:
                continue
        try:
            return datetime.fromtimestamp(int(raw)).date().isoformat()
        except (ValueError, OSError, OverflowError):
            return None

    def _get_atm_strike(self, spot_price: float, strikes: list) -> int:
        if not strikes:
            return int(spot_price)
        return min(strikes, key=lambda s: abs(s["strike"] - spot_price))["strike"]

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
