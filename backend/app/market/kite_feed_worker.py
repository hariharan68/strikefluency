"""Dedicated KiteTicker worker.

Run separately from FastAPI:
    python -m app.market.kite_feed_worker
"""

from __future__ import annotations

import json
import logging
import threading
import time
from typing import Any

from app.config import settings
from app.database import SessionLocal
from app.market import kite_cache
from app.services import kite_auth_service as auth
from app.services import kite_instrument_service as catalog

logger = logging.getLogger(__name__)


class KiteFeedWorker:
    def __init__(self):
        self._ticker = None
        self._stopping = threading.Event()
        self._subscribed: set[int] = set()
        self._release_at: dict[int, float] = {}
        self._leader_lock = None

    def _renew_leadership(self) -> None:
        while not self._stopping.wait(20):
            try:
                self._leader_lock.extend(60, replace_ttl=True)
            except Exception:
                logger.error("Lost KiteTicker leadership; stopping duplicate-risk feed")
                self.stop()
                return

    def _permanent_tokens(self) -> list[int]:
        db = SessionLocal()
        try:
            return [
                row.instrument_token
                for name in ("NIFTY", "BANKNIFTY", "SENSEX")
                if (row := catalog.spot_instrument(db, name))
            ]
        finally:
            db.close()

    @staticmethod
    def _normalize_tick(tick: dict[str, Any]) -> dict[str, Any]:
        depth = tick.get("depth") or {}
        buy = depth.get("buy") or []
        sell = depth.get("sell") or []
        return {
            **tick,
            "last_price": float(tick.get("last_price") or 0),
            "volume": int(tick.get("volume_traded") or tick.get("volume") or 0),
            "bid": float(buy[0].get("price") or 0) if buy else 0.0,
            "ask": float(sell[0].get("price") or 0) if sell else 0.0,
            "received_at": time.time(),
        }

    def _listen_control(self) -> None:
        pubsub = kite_cache.client().pubsub(ignore_subscribe_messages=True)
        pubsub.subscribe(kite_cache.CONTROL_CHANNEL)
        try:
            for event in pubsub.listen():
                if self._stopping.is_set():
                    return
                try:
                    command = json.loads(event["data"])
                    action = command.get("action")
                    tokens = {int(token) for token in command.get("tokens", [])}
                    if action == "stop":
                        self.stop()
                        return
                    if not self._ticker:
                        continue
                    if action == "subscribe":
                        new = list(tokens - self._subscribed)
                        if new:
                            self._ticker.subscribe(new)
                            mode = command.get("mode", "full")
                            self._ticker.set_mode(
                                self._ticker.MODE_FULL if mode == "full" else self._ticker.MODE_QUOTE,
                                new,
                            )
                            self._subscribed.update(new)
                            for token in new:
                                self._release_at.pop(token, None)
                    elif action == "release":
                        for token in tokens:
                            self._release_at[token] = time.time() + 30
                except Exception:
                    logger.exception("Invalid Kite feed control message")
        finally:
            pubsub.close()

    def _idle_reaper(self) -> None:
        permanent = set(self._permanent_tokens())
        while not self._stopping.wait(5):
            now = time.time()
            due = [
                token for token, release_at in self._release_at.items()
                if release_at <= now and token not in permanent
            ]
            if due and self._ticker:
                counts = kite_cache.client().hmget(
                    kite_cache.SUBSCRIPTIONS_KEY, [str(token) for token in due]
                )
                idle = [token for token, count in zip(due, counts) if int(count or 0) <= 0]
                if idle:
                    self._ticker.unsubscribe(idle)
                    self._subscribed.difference_update(idle)
                for token in due:
                    self._release_at.pop(token, None)

    def run(self) -> None:
        from kiteconnect import KiteTicker
        from app.config import Settings

        # The worker may be started before the administrator completes the
        # setup wizard. Credentials are written to .env by the API process, so
        # reload Settings on each pass instead of crashing (or holding a stale
        # empty API key forever).
        token = ""
        api_key = ""
        announced_wait = False
        while not self._stopping.is_set():
            runtime_settings = Settings()
            api_key = runtime_settings.KITE_API_KEY
            try:
                token = auth.get_saved_access_token()
            except Exception as exc:
                logger.warning("Waiting for Kite token storage: %s", type(exc).__name__)
                token = ""

            if api_key and token:
                permanent = self._permanent_tokens()
                if len(permanent) == 3:
                    break
                kite_cache.set_status(
                    "connecting",
                    connected=True,
                    feed_connected=False,
                    message="Kite authenticated; waiting for instrument catalog sync",
                )
            else:
                kite_cache.set_status(
                    "reconnect_required",
                    connected=False,
                    feed_connected=False,
                    message="Complete Zerodha login in Settings",
                )
            if not announced_wait:
                logger.info("Waiting for administrator Zerodha authentication")
                announced_wait = True
            self._stopping.wait(5)

        if self._stopping.is_set():
            return

        self._leader_lock = kite_cache.client().lock(
            "kite:feed:leader", timeout=60, blocking_timeout=0, thread_local=False,
        )
        if not self._leader_lock.acquire(blocking=False):
            logger.info("Another KiteFeedWorker already owns the feed; exiting")
            return
        threading.Thread(target=self._renew_leadership, daemon=True).start()

        self._ticker = KiteTicker(api_key, token, reconnect=True, reconnect_max_tries=20)

        def on_connect(ws, _response):
            permanent = self._permanent_tokens()
            if permanent:
                ws.subscribe(permanent)
                ws.set_mode(ws.MODE_FULL, permanent)
                self._subscribed.update(permanent)
            kite_cache.set_status(
                "live", connected=True, feed_connected=True,
                subscriptions=len(self._subscribed), message="KiteTicker live",
            )

        def on_ticks(_ws, ticks):
            for tick in ticks:
                kite_cache.store_tick(self._normalize_tick(tick))

        def on_close(_ws, code, reason):
            if not self._stopping.is_set():
                kite_cache.set_status(
                    "feed_reconnecting", connected=True, feed_connected=False,
                    message=f"KiteTicker disconnected ({code})",
                )

        def on_error(ws, code, reason):
            if int(code or 0) == 403:
                self._stopping.set()
                auth.mark_expired("Zerodha rejected the access token")
                ws.stop()

        self._ticker.on_connect = on_connect
        self._ticker.on_ticks = on_ticks
        self._ticker.on_close = on_close
        self._ticker.on_error = on_error
        threading.Thread(target=self._listen_control, daemon=True).start()
        threading.Thread(target=self._idle_reaper, daemon=True).start()
        kite_cache.set_status(
            "feed_reconnecting", connected=True, feed_connected=False,
            message="Starting KiteTicker",
        )
        self._ticker.connect(threaded=False)

    def stop(self) -> None:
        self._stopping.set()
        if self._ticker:
            self._ticker.stop()
        if self._leader_lock:
            try:
                self._leader_lock.release()
            except Exception:
                pass


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    KiteFeedWorker().run()
