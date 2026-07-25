"""Canonical read-only market-data provider backed by KiteTicker + Kite REST."""

from __future__ import annotations

import hashlib
import json
import random
import time
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import select

from app.config import settings
from app.core.paper_trading_policy import read_only_broker_client
from app.database import SessionLocal
from app.market import kite_cache
from app.market.base import MarketDataProvider
from app.models.kite_instrument import KiteInstrument
from app.services import kite_auth_service as auth
from app.services import kite_instrument_service as catalog


def _iso(value: Any) -> str:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()
    return str(value or datetime.now(timezone.utc).isoformat())


def normalize_quote(
    instrument: KiteInstrument, quote: dict[str, Any], *, received_at: float | None = None,
) -> dict[str, Any]:
    depth = quote.get("depth") or {}
    buy = depth.get("buy") or []
    sell = depth.get("sell") or []
    return {
        "instrument_token": instrument.instrument_token,
        "exchange": instrument.exchange,
        "tradingsymbol": instrument.tradingsymbol,
        "last_price": float(quote.get("last_price") or 0),
        "last_quantity": int(quote.get("last_quantity") or 0),
        "average_price": float(quote.get("average_price") or 0),
        "volume": int(quote.get("volume") or quote.get("volume_traded") or 0),
        "buy_quantity": int(quote.get("buy_quantity") or 0),
        "sell_quantity": int(quote.get("sell_quantity") or 0),
        "oi": int(quote.get("oi") or 0),
        "oi_day_high": int(quote.get("oi_day_high") or 0),
        "oi_day_low": int(quote.get("oi_day_low") or 0),
        "ohlc": quote.get("ohlc") or {},
        "depth": {"buy": buy, "sell": sell},
        "bid": float(buy[0].get("price") or 0) if buy else 0.0,
        "ask": float(sell[0].get("price") or 0) if sell else 0.0,
        "as_of": _iso(quote.get("timestamp") or quote.get("last_trade_time")),
        "received_at": received_at or time.time(),
    }


class KiteMarketDataProvider(MarketDataProvider):
    def __init__(self, api_key: str, access_token: str | None):
        self.api_key = api_key
        self.access_token = access_token or ""
        self.kite = (
            read_only_broker_client(
                auth._kite(self.access_token),
                allowed_operations={"quote", "historical_data"},
            )
            if self.access_token
            else None
        )

    def close(self) -> None:
        return None

    def is_connected(self) -> bool:
        status = kite_cache.get_status()
        return bool(self.access_token and status.get("connected"))

    def provider_status(self) -> dict[str, Any]:
        cached = kite_cache.get_status()
        status = {
            key: cached.get(key)
            for key in (
                "state", "feed_connected", "message", "updated_at",
                "age_ms", "is_stale", "subscriptions",
            )
            if key in cached
        }
        status.update({
            "provider": "KiteMarketDataProvider",
            "selected_provider": "kite",
            "connected": self.is_connected(),
        })
        return status

    def _metadata(self, ticks: list[dict[str, Any]]) -> dict[str, Any]:
        received = [float(t.get("received_at") or 0) for t in ticks if t]
        # A chain is only as fresh as its oldest constituent quote.
        age_ms = int(max(0, time.time() - min(received)) * 1000) if received else None
        stale = age_ms is None or age_ms > settings.KITE_TICK_STALE_SECONDS * 1000
        return {
            "provider": "kite",
            "source": "unavailable" if not received else ("kite_cached" if stale else "kite_live"),
            "as_of": (
                datetime.fromtimestamp(min(received), timezone.utc).isoformat()
                if received else None
            ),
            "age_ms": age_ms,
            "is_stale": stale,
        }

    def assert_orderable(self, data: dict[str, Any]) -> None:
        age_ms = data.get("age_ms")
        if (
            data.get("source") == "unavailable"
            or age_ms is None
            or age_ms > settings.KITE_ORDER_BLOCK_SECONDS * 1000
        ):
            raise RuntimeError(
                "Live Zerodha data is unavailable or too old for a new virtual order"
            )

    def _require_rest(self, bucket: str, rate: int) -> None:
        if not self.kite:
            raise RuntimeError("Zerodha login required")
        if not kite_cache.acquire_rate_slot(bucket, rate):
            raise RuntimeError("Kite REST rate limit reached; retry shortly")

    def _rest_quotes(self, instruments: list[KiteInstrument]) -> dict[int, dict[str, Any]]:
        if not instruments:
            return {}
        keys = [f"{row.exchange}:{row.tradingsymbol}" for row in instruments]
        digest = hashlib.sha256(",".join(sorted(keys)).encode()).hexdigest()[:20]
        redis = kite_cache.client()
        lock = redis.lock(f"kite:coalesce:quotes:{digest}", timeout=5, blocking_timeout=2)
        if not lock.acquire(blocking=True):
            time.sleep(0.1)
            return kite_cache.get_ticks([row.instrument_token for row in instruments])
        try:
            # Another process may have populated these while this request waited.
            existing = kite_cache.get_ticks([row.instrument_token for row in instruments])
            fresh = [
                tick for tick in existing.values()
                if time.time() - float(tick.get("received_at") or 0)
                <= settings.KITE_TICK_STALE_SECONDS
            ]
            if len(fresh) == len(instruments):
                return existing
            self._require_rest("quotes", 1)
            raw = self._call_with_backoff(self.kite.quote, keys)
        finally:
            try:
                lock.release()
            except Exception:
                pass
        result: dict[int, dict[str, Any]] = {}
        for row, key in zip(instruments, keys):
            if key not in raw:
                continue
            normalized = normalize_quote(row, raw[key])
            kite_cache.store_tick(normalized)
            result[row.instrument_token] = normalized
        return result

    @staticmethod
    def _call_with_backoff(fn, *args, **kwargs):
        for attempt in range(3):
            try:
                return fn(*args, **kwargs)
            except Exception as exc:
                code = getattr(exc, "code", None) or getattr(exc, "status_code", None)
                if code == 403:
                    auth.handle_kite_exception(exc)
                if code != 429 or attempt == 2:
                    try:
                        auth.handle_kite_exception(exc)
                    except Exception:
                        raise
                    raise
                time.sleep(min(2.0, 0.25 * (2 ** attempt)) + random.uniform(0, 0.15))
        raise RuntimeError("Kite request failed")

    def _ticks(
        self, instruments: list[KiteInstrument], *, recover: bool = True,
    ) -> dict[int, dict[str, Any]]:
        tokens = [row.instrument_token for row in instruments]
        ticks = kite_cache.get_ticks(tokens)
        now = time.time()
        recovery = [
            row for row in instruments
            if row.instrument_token not in ticks
            or now - float(ticks[row.instrument_token].get("received_at") or 0)
            > settings.KITE_TICK_STALE_SECONDS
        ]
        if recover and recovery:
            try:
                ticks.update(self._rest_quotes(recovery))
            except RuntimeError:
                # Last-good ticks remain usable and visibly stale.
                pass
        return ticks

    def get_spot_snapshot(self, instrument: str) -> dict[str, Any]:
        instrument = instrument.upper()
        db = SessionLocal()
        try:
            row = catalog.spot_instrument(db, instrument)
            if row is None:
                raise RuntimeError("Kite instrument catalog is missing the index token")
            ticks = self._ticks([row])
            tick = ticks.get(row.instrument_token)
            if not tick:
                return {
                    "instrument": instrument, "spot_price": None,
                    **self._metadata([]), "source": "unavailable",
                }
            return {
                "instrument": instrument,
                "spot_price": float(tick.get("last_price") or 0),
                **self._metadata([tick]),
            }
        finally:
            db.close()

    def get_spot_price(self, instrument: str) -> float:
        snapshot = self.get_spot_snapshot(instrument)
        if snapshot["spot_price"] is None:
            raise RuntimeError(f"No trustworthy Kite spot quote for {instrument}")
        return float(snapshot["spot_price"])

    def get_expiries(self, instrument: str) -> list[str]:
        db = SessionLocal()
        try:
            return [value.isoformat() for value in catalog.expiries(db, instrument, "OPT")]
        finally:
            db.close()

    def get_option_chain(self, instrument: str, expiry: str = None) -> dict:
        instrument = instrument.upper()
        db = SessionLocal()
        try:
            available = catalog.expiries(db, instrument, "OPT")
            if not available:
                raise RuntimeError("Kite instrument catalog has no option expiries")
            selected = date.fromisoformat(expiry) if expiry else available[0]
            contracts = catalog.option_contracts(db, instrument, selected)
            spot_row = catalog.spot_instrument(db, instrument)
            if not contracts or spot_row is None:
                raise RuntimeError("Kite instrument catalog cannot resolve this option chain")

            all_ticks = self._ticks([spot_row])
            spot_tick = all_ticks.get(spot_row.instrument_token)
            if not spot_tick:
                raise RuntimeError("Kite spot data is unavailable")
            spot = float(spot_tick.get("last_price") or 0)
            strikes = sorted({float(row.strike or 0) for row in contracts})
            atm = min(strikes, key=lambda value: abs(value - spot))
            atm_index = strikes.index(atm)
            width = settings.KITE_OPTION_STRIKES_EACH_SIDE
            selected_strikes = set(strikes[max(0, atm_index - width): atm_index + width + 1])
            window = [row for row in contracts if float(row.strike or 0) in selected_strikes]
            kite_cache.request_subscriptions(
                [spot_row.instrument_token] + [row.instrument_token for row in window],
                mode="full",
            )
            requested_tokens = [spot_row.instrument_token] + [row.instrument_token for row in window]
            try:
                option_ticks = self._ticks(window)
            finally:
                kite_cache.release_subscriptions(requested_tokens)
            all_ticks.update(option_ticks)
            by_strike: dict[float, dict[str, Any]] = {}
            total_ce_oi = total_pe_oi = 0
            for row in window:
                tick = option_ticks.get(row.instrument_token) or {}
                side = row.instrument_type.lower()
                oi = int(tick.get("oi") or 0)
                if side == "ce":
                    total_ce_oi += oi
                else:
                    total_pe_oi += oi
                by_strike.setdefault(float(row.strike or 0), {})[side] = {
                    "instrument_token": row.instrument_token,
                    "tradingsymbol": row.tradingsymbol,
                    "ltp": float(tick.get("last_price") or 0),
                    "oi": oi,
                    "oi_change": int(tick.get("oi_change") or 0),
                    "volume": int(tick.get("volume") or 0),
                    "bid": float(tick.get("bid") or 0),
                    "ask": float(tick.get("ask") or 0),
                    "depth": tick.get("depth") or {},
                    "lot_size": row.lot_size,
                }
            metadata = self._metadata(list(all_ticks.values()))
            if len(all_ticks) < len(window) + 1:
                metadata.update({
                    "source": "unavailable",
                    "is_stale": True,
                    "age_ms": None,
                })
            return {
                "instrument": instrument,
                "spot_price": spot,
                "atm_strike": int(atm),
                "expiry": selected.isoformat(),
                "timestamp": metadata["as_of"],
                "pcr": round(total_pe_oi / total_ce_oi, 3) if total_ce_oi else 0,
                "strikes": [
                    {
                        "strike": int(strike),
                        "ce": sides.get("ce") or {},
                        "pe": sides.get("pe") or {},
                    }
                    for strike, sides in sorted(by_strike.items())
                ],
                **metadata,
            }
        finally:
            db.close()

    def get_ltp(
        self, instrument: str, strike: int, option_type: str, expiry: str,
    ) -> float:
        chain = self.get_option_chain(instrument, expiry)
        for row in chain["strikes"]:
            if int(row["strike"]) == int(strike):
                return float(row[option_type.lower()].get("ltp") or 0)
        raise RuntimeError("Kite could not resolve the requested option contract")

    def get_futures(self, instrument: str, expiry: str | None = None) -> dict[str, Any]:
        db = SessionLocal()
        try:
            selected = date.fromisoformat(expiry) if expiry else None
            rows = catalog.futures_contracts(db, instrument, selected)
            ticks = self._ticks(rows)
            contracts = []
            for row in rows:
                tick = ticks.get(row.instrument_token)
                contracts.append({
                    **catalog.instrument_dict(row),
                    "quote": ({**tick, **self._metadata([tick])} if tick else None),
                })
            metadata = self._metadata(list(ticks.values()))
            return {"instrument": instrument.upper(), "futures": contracts, **metadata}
        finally:
            db.close()

    def get_history(
        self, instrument: str, days: int = 60, resolution: str = "D",
    ) -> dict[str, Any]:
        db = SessionLocal()
        try:
            row = catalog.spot_instrument(db, instrument.upper())
            if row is None:
                raise RuntimeError("Kite instrument catalog cannot resolve this index")
            interval = {
                "D": "day", "1D": "day", "1": "minute", "3": "3minute",
                "5": "5minute", "10": "10minute", "15": "15minute",
                "30": "30minute", "60": "60minute",
            }.get(str(resolution).upper(), str(resolution))
            end = datetime.now(timezone.utc)
            return self.historical(
                row.instrument_token, interval=interval,
                from_date=end - timedelta(days=days), to_date=end,
                continuous=False, oi=False,
            )
        finally:
            db.close()

    def quotes(self, instrument_tokens: list[int]) -> list[dict[str, Any]]:
        db = SessionLocal()
        try:
            rows = list(db.execute(select(KiteInstrument).where(
                KiteInstrument.instrument_token.in_(instrument_tokens)
            )).scalars())
            ticks = self._ticks(rows)
            return [
                {**tick, **self._metadata([tick])}
                for token in instrument_tokens
                if (tick := ticks.get(token))
            ]
        finally:
            db.close()

    def depth(self, instrument_tokens: list[int]) -> list[dict[str, Any]]:
        return [
            {
                "instrument_token": quote["instrument_token"],
                "depth": quote.get("depth") or {},
                "bid": quote.get("bid"),
                "ask": quote.get("ask"),
                **{key: quote.get(key) for key in ("provider", "source", "as_of", "age_ms", "is_stale")},
            }
            for quote in self.quotes(instrument_tokens)
        ]

    def historical(
        self,
        instrument_token: int,
        *,
        interval: str,
        from_date: datetime,
        to_date: datetime,
        continuous: bool = False,
        oi: bool = True,
    ) -> dict[str, Any]:
        cache_payload = f"{instrument_token}|{interval}|{from_date.isoformat()}|{to_date.isoformat()}|{continuous}|{oi}"
        digest = hashlib.sha256(cache_payload.encode()).hexdigest()
        redis = kite_cache.client()
        cache_key = f"kite:history:{digest}"
        cached = redis.get(cache_key)
        if cached:
            result = json.loads(cached)
            age_ms = int(
                (datetime.now(timezone.utc) - datetime.fromisoformat(result["as_of"])).total_seconds()
                * 1000
            )
            result.update({"source": "kite_cached", "age_ms": max(0, age_ms)})
            return result
        lock = redis.lock(f"kite:coalesce:history:{digest}", timeout=15, blocking_timeout=5)
        if not lock.acquire(blocking=True):
            cached = redis.get(cache_key)
            if cached:
                result = json.loads(cached)
                result["source"] = "kite_cached"
                return result
            raise RuntimeError("Kite history request is already in progress")
        try:
            cached = redis.get(cache_key)
            if cached:
                return json.loads(cached)
            self._require_rest("history", 3)
            rows = self._call_with_backoff(
                self.kite.historical_data,
                instrument_token, from_date, to_date, interval,
                continuous=continuous, oi=oi,
            )
        finally:
            try:
                lock.release()
            except Exception:
                pass
        result = {
            "instrument_token": instrument_token,
            "interval": interval,
            "candles": [
                {
                    "timestamp": _iso(row.get("date")),
                    "open": row.get("open"), "high": row.get("high"),
                    "low": row.get("low"), "close": row.get("close"),
                    "volume": row.get("volume"), "oi": row.get("oi"),
                }
                for row in rows
            ],
            "provider": "kite",
            "source": "kite_live",
            "as_of": datetime.now(timezone.utc).isoformat(),
            "age_ms": 0,
            "is_stale": False,
        }
        redis.setex(cache_key, 60, json.dumps(result))
        return result
