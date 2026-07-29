"""Live market data from Fyers API v3 with cache and mock fallback."""

import copy
import logging
import tempfile
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from app.core.instruments import get_spec
from app.core.paper_trading_policy import read_only_broker_client
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
STREAM_QUOTE_TTL_SECONDS = 30


class FyersMarketDataProvider(MarketDataProvider):
    def __init__(self, app_id: str, access_token: str):
        self.app_id = app_id
        self.access_token = access_token
        self._connected = False
        self._fyers = None
        self._mock = MockMarketDataProvider()
        self._cache: dict[tuple[Any, ...], tuple[datetime, Any]] = {}
        self._last_good: dict[tuple[Any, ...], Any] = {}
        self._stream_socket = None
        self._stream_ready = False
        self._stream_stop = threading.Event()
        self._stream_lock = threading.RLock()
        self._subscribe_lock = threading.Lock()
        self._stream_quotes: dict[str, tuple[float, float, str]] = {}
        self._desired_symbols: set[str] = set(FYERS_SYMBOLS.values())
        self._subscribed_symbols: set[str] = set()
        self._contract_symbols: dict[tuple[str, int, str, str], str] = {}
        self._connect()
        if self._connected:
            self._start_quote_stream()

    def _connect(self):
        try:
            from fyers_apiv3 import fyersModel

            client = fyersModel.FyersModel(
                client_id=self.app_id,
                is_async=False,
                token=self.access_token,
                log_path="",
            )
            self._fyers = read_only_broker_client(
                client,
                allowed_operations={"get_profile", "quotes", "optionchain"},
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

    def provider_status(self) -> dict:
        with self._stream_lock:
            latest = max(
                (quote[1] for quote in self._stream_quotes.values()),
                default=None,
            )
            subscribed = len(self._subscribed_symbols)
        age_ms = (
            max(0, round((time.monotonic() - latest) * 1000))
            if latest is not None else None
        )
        stream_state = "connecting"
        if age_ms is not None:
            stream_state = (
                "live"
                if age_ms <= STREAM_QUOTE_TTL_SECONDS * 1000
                else "stale"
            )
        return {
            "quote_stream": stream_state if self._stream_ready else "connecting",
            "quote_stream_age_ms": age_ms,
            "quote_stream_symbols": subscribed,
        }

    def get_spot_price(self, instrument: str) -> float:
        live = self._live_quote(FYERS_SYMBOLS.get(instrument))
        if live is not None:
            return live[0]

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
            return self._overlay_live_quotes(cached)

        try:
            value = self._fetch_option_chain(instrument, expiry)
            self._store_good(key, value)
            return self._overlay_live_quotes(value)
        except Exception as e:
            logger.warning("Fyers option-chain fallback for %s: %s", instrument, e)
            last = self._last_good.get(key)
            if last is not None:
                fallback = copy.deepcopy(last)
                fallback["source"] = "fyers_cached"
                return self._overlay_live_quotes(fallback)
            data = self._mock.get_option_chain(instrument, expiry)
            data["source"] = "mock_fallback"
            return data

    def get_ltp(self, instrument: str, strike: int, option_type: str, expiry: str) -> float:
        symbol = self._contract_symbols.get(
            (instrument, int(strike), option_type.upper(), expiry)
        )
        live = self._live_quote(symbol)
        if live is None:
            # Useful before the first structural chain has registered Fyers'
            # exact symbol for this contract.
            live = self._live_quote(
                self._build_option_symbol(instrument, strike, option_type, expiry)
            )
        if live is not None:
            return live[0]

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
            "strikecount": 20,   # 20 each side → 41 rows, covers the ±20 UI window
            "timestamp": "",
        }
        response = self._fyers.optionchain(data=payload)
        if response.get("s") != "ok":
            raise RuntimeError(f"Fyers option chain error: {response}")

        parsed = self._parse_option_chain(instrument, response["data"])
        parsed["source"] = "fyers"
        self._register_chain_symbols(parsed)
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

        # Fyers v3 optionchain uses snake_case keys (`strike_price`, `oi`, `oich`,
        # `volume`), NOT the camelCase this once assumed. With the wrong keys every
        # strike defaulted to 0, collapsing the whole chain into a single strike-0
        # row and a spot of 0 (the visible "only ATM" bug). Read documented names.
        strikes_map = {}
        spot_price = float(data.get("underlyingValue") or 0.0)
        change_pct = 0.0
        future_price = 0.0

        for contract in options_chain:
            opt_type = contract.get("option_type", "")
            strike = int(float(contract.get("strike_price",
                                            contract.get("strikePrice", 0)) or 0))

            # The underlying/index leg carries strike_price == -1 and an empty
            # option_type; Fyers hangs spot, %-change and future price off it.
            if opt_type not in ("CE", "PE") or strike < 0:
                if spot_price <= 0:
                    spot_price = float(contract.get("ltp") or 0.0)
                change_pct = float(contract.get("ltpchp") or change_pct)
                future_price = float(contract.get("fp") or future_price)
                continue

            if strike not in strikes_map:
                strikes_map[strike] = {"strike": strike, "ce": {}, "pe": {}}

            side = "ce" if opt_type == "CE" else "pe"
            strikes_map[strike][side] = {
                "ltp": float(contract.get("ltp") or 0),
                "oi": int(contract.get("oi") or 0),
                "oi_change": int(contract.get("oich") or 0),   # Fyers OI change since prev
                "volume": int(contract.get("volume") or 0),
                "iv": float(contract.get("iv") or 0),
                "bid": float(contract.get("bid") or 0),
                "ask": float(contract.get("ask") or 0),
                "delta": float(contract.get("delta") or 0),
            }
            symbol = contract.get("symbol")
            if symbol:
                strikes_map[strike][side]["symbol"] = str(symbol)

        sorted_strikes = sorted(strikes_map.values(), key=lambda x: x["strike"])
        atm_strike = self._get_atm_strike(spot_price, sorted_strikes)
        total_ce_oi = sum(s["ce"].get("oi", 0) for s in sorted_strikes if s.get("ce"))
        total_pe_oi = sum(s["pe"].get("oi", 0) for s in sorted_strikes if s.get("pe"))
        pcr = round(total_pe_oi / total_ce_oi, 2) if total_ce_oi > 0 else 0
        # Underlying % change drives OI-buildup direction — taken from the index leg
        # above, with top-level keys as a fallback across SDK builds.
        if not change_pct:
            change_pct = float(data.get("indexChangePercent")
                               or data.get("underlyingChangePercent") or 0.0)
        if not future_price:
            future_price = float(data.get("fut_price") or data.get("fp") or 0.0)

        return {
            "instrument": instrument,
            "spot_price": spot_price,
            "atm_strike": atm_strike,
            "expiry": nearest_expiry,
            "expiries": expiries,
            "timestamp": datetime.now().isoformat(),
            "pcr": pcr,
            "lot_size": get_spec(instrument).lot_size,
            "change_pct": change_pct,
            "future_price": future_price,
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

    def _start_quote_stream(self) -> None:
        """Connect the market-data-only socket without blocking application boot."""
        thread = threading.Thread(
            target=self._connect_quote_stream,
            name="fyers-quote-stream",
            daemon=True,
        )
        thread.start()

    def _connect_quote_stream(self) -> None:
        try:
            from fyers_apiv3.FyersWebsocket import data_ws

            log_dir = Path(tempfile.gettempdir()) / "strikefluency-fyers"
            log_dir.mkdir(parents=True, exist_ok=True)
            socket = data_ws.FyersDataSocket(
                access_token=self.access_token,
                log_path=str(log_dir),
                litemode=True,
                write_to_file=True,
                reconnect=True,
                on_message=self._on_stream_message,
                on_connect=self._on_stream_connect,
                on_error=self._on_stream_error,
                on_close=self._on_stream_close,
            )
            with self._stream_lock:
                self._stream_socket = socket
            if self._stream_stop.is_set():
                socket.close_connection()
                return
            socket.connect()
        except Exception as exc:
            self._stream_ready = False
            logger.warning(
                "Fyers quote stream unavailable; REST prices remain active: %s",
                exc,
            )

    def _on_stream_connect(self) -> None:
        if self._stream_stop.is_set():
            return
        with self._stream_lock:
            self._stream_ready = True
            # The SDK clears its own subscription state on reconnect.
            self._subscribed_symbols.clear()
        self._subscribe_pending()
        logger.info("Fyers live quote stream connected")

    def _on_stream_message(self, message: dict) -> None:
        if self._stream_stop.is_set() or not isinstance(message, dict):
            return
        symbol = str(message.get("symbol") or "")
        try:
            ltp = float(message.get("ltp"))
        except (TypeError, ValueError):
            return
        if not symbol or ltp <= 0:
            return

        received = datetime.now().astimezone().isoformat()
        with self._stream_lock:
            self._stream_ready = True
            self._stream_quotes[symbol] = (ltp, time.monotonic(), received)

    def _on_stream_error(self, error) -> None:
        logger.warning("Fyers quote stream error: %s", error)

    def _on_stream_close(self, message) -> None:
        self._stream_ready = False
        if not self._stream_stop.is_set():
            logger.warning("Fyers quote stream closed: %s", message)

    def _register_chain_symbols(self, chain: dict) -> None:
        instrument = str(chain.get("instrument") or "")
        expiry = str(chain.get("expiry") or "")
        symbols = {FYERS_SYMBOLS[instrument]} if instrument in FYERS_SYMBOLS else set()

        with self._stream_lock:
            for row in chain.get("strikes", []):
                strike = int(float(row.get("strike") or 0))
                for option_type, side_key in (("CE", "ce"), ("PE", "pe")):
                    symbol = str((row.get(side_key) or {}).get("symbol") or "")
                    if not symbol:
                        continue
                    symbols.add(symbol)
                    self._contract_symbols[
                        (instrument, strike, option_type, expiry)
                    ] = symbol
            self._desired_symbols.update(symbols)
            ready = self._stream_ready

        if ready:
            # SDK symbol conversion can take ~0.5s. Keep it away from the
            # scheduler/event-loop thread that broadcasts UI frames.
            threading.Thread(
                target=self._subscribe_pending,
                name="fyers-quote-subscribe",
                daemon=True,
            ).start()

    def _subscribe_pending(self) -> None:
        with self._subscribe_lock:
            with self._stream_lock:
                socket = self._stream_socket
                pending = sorted(self._desired_symbols - self._subscribed_symbols)
            if not socket or not pending or self._stream_stop.is_set():
                return
            try:
                socket.subscribe(symbols=pending, data_type="SymbolUpdate")
                with self._stream_lock:
                    self._subscribed_symbols.update(pending)
                logger.info(
                    "Fyers quote stream subscribed to %d new symbols",
                    len(pending),
                )
            except Exception as exc:
                logger.warning("Fyers quote subscription failed: %s", exc)

    def _live_quote(self, symbol: str | None) -> tuple[float, str, int] | None:
        if not symbol:
            return None
        with self._stream_lock:
            quote = self._stream_quotes.get(symbol)
        if quote is None:
            return None
        ltp, received_at, received_iso = quote
        age_ms = max(0, round((time.monotonic() - received_at) * 1000))
        if age_ms > STREAM_QUOTE_TTL_SECONDS * 1000:
            return None
        return ltp, received_iso, age_ms

    def _overlay_live_quotes(self, structural: dict) -> dict:
        """
        Copy the REST structure and apply streamed LTPs.

        The original `timestamp` remains the REST snapshot time. Live display
        freshness is separate so one premium tick can never make the whole
        structural snapshot appear fresh to execution safeguards.
        """
        chain = copy.deepcopy(structural)
        newest: tuple[str, int] | None = None
        live_count = 0

        instrument = str(chain.get("instrument") or "")
        spot = self._live_quote(FYERS_SYMBOLS.get(instrument))
        if spot is not None:
            chain["spot_price"] = spot[0]
            newest = (spot[1], spot[2])
            live_count += 1

        for row in chain.get("strikes", []):
            for side_key in ("ce", "pe"):
                side = row.get(side_key) or {}
                quote = self._live_quote(side.get("symbol"))
                if quote is None:
                    continue
                side["ltp"] = quote[0]
                side["quote_at"] = quote[1]
                side["quote_age_ms"] = quote[2]
                side["quote_source"] = "fyers_stream"
                live_count += 1
                if newest is None or quote[2] < newest[1]:
                    newest = (quote[1], quote[2])

        if spot is not None:
            chain["atm_strike"] = self._get_atm_strike(
                chain["spot_price"], chain.get("strikes", [])
            )
        chain["live_quote_at"] = newest[0] if newest else None
        chain["live_quote_age_ms"] = newest[1] if newest else None
        chain["live_quote_count"] = live_count
        chain["live_quote_source"] = "fyers_stream" if live_count else None
        return chain

    def close(self) -> None:
        """Stop the quote socket when provider_factory rotates the provider."""
        self._stream_stop.set()
        self._stream_ready = False
        with self._stream_lock:
            socket = self._stream_socket
            self._stream_socket = None
        if socket is not None:
            try:
                socket.close_connection()
            except Exception as exc:
                logger.debug("Fyers quote stream close failed: %s", exc)

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
