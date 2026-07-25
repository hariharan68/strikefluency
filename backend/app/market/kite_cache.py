"""Redis coordination for the single shared Kite market-data connection."""

from __future__ import annotations

import hashlib
import json
import secrets
import time
from datetime import datetime, timezone
from typing import Any

from redis import Redis
from redis.exceptions import RedisError

from app.config import settings

STATUS_KEY = "kite:status"
TICK_CHANNEL = "kite:ticks"
STATUS_CHANNEL = "kite:status:events"
CONTROL_CHANNEL = "kite:control"
SUBSCRIPTIONS_KEY = "kite:subscriptions"

_redis: Redis | None = None


class KiteCacheUnavailable(RuntimeError):
    pass


def client(*, required: bool = True) -> Redis | None:
    global _redis
    if not settings.REDIS_URL:
        if required:
            raise KiteCacheUnavailable("REDIS_URL is required for Zerodha Kite")
        return None
    if _redis is None:
        _redis = Redis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=3,
            health_check_interval=30,
        )
    try:
        _redis.ping()
    except RedisError as exc:
        if required:
            raise KiteCacheUnavailable("Kite Redis coordination is unavailable") from exc
        return None
    return _redis


def close() -> None:
    global _redis
    if _redis is not None:
        _redis.close()
    _redis = None


def create_operation(admin_id: str, ttl_seconds: int = 300) -> str:
    operation_id = secrets.token_urlsafe(32)
    digest = hashlib.sha256(operation_id.encode()).hexdigest()
    payload = json.dumps({
        "admin_id": admin_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    client().setex(f"kite:operation:{digest}", ttl_seconds, payload)
    return operation_id


def consume_operation(operation_id: str) -> dict[str, Any] | None:
    if not operation_id:
        return None
    digest = hashlib.sha256(operation_id.encode()).hexdigest()
    raw = client().getdel(f"kite:operation:{digest}")
    return json.loads(raw) if raw else None


def set_status(state: str, **fields: Any) -> dict[str, Any]:
    payload = {
        "state": state,
        "provider": "kite",
        "updated_at": datetime.now(timezone.utc).isoformat(),
        **fields,
    }
    raw = json.dumps(payload, default=str)
    redis = client(required=False)
    if redis is not None:
        redis.set(STATUS_KEY, raw)
        redis.publish(STATUS_CHANNEL, raw)
    return payload


def get_status() -> dict[str, Any]:
    redis = client(required=False)
    if redis is None:
        return {
            "state": "unavailable",
            "provider": "kite",
            "connected": False,
            "message": "Redis unavailable",
        }
    raw = redis.get(STATUS_KEY)
    status = json.loads(raw) if raw else {
        "state": "unavailable",
        "provider": "kite",
        "connected": False,
        "message": "Kite feed has not started",
    }
    last_tick = redis.get("kite:last_tick")
    if last_tick:
        age_ms = int(max(0, time.time() - float(last_tick)) * 1000)
        status["age_ms"] = age_ms
        status["is_stale"] = age_ms > settings.KITE_TICK_STALE_SECONDS * 1000
        if status.get("connected") and status["is_stale"]:
            status["state"] = "stale"
            status["message"] = "Kite live data is stale"
    return status


def store_tick(tick: dict[str, Any]) -> None:
    token = int(tick["instrument_token"])
    payload = dict(tick)
    payload.setdefault("as_of", datetime.now(timezone.utc).isoformat())
    payload.setdefault("received_at", time.time())
    raw = json.dumps(payload, default=str)
    redis = client()
    pipe = redis.pipeline(transaction=False)
    pipe.set(f"kite:tick:{token}", raw)
    pipe.set("kite:last_tick", payload["received_at"])
    pipe.publish(TICK_CHANNEL, raw)
    pipe.execute()


def get_tick(instrument_token: int) -> dict[str, Any] | None:
    redis = client(required=False)
    if redis is None:
        return None
    raw = redis.get(f"kite:tick:{int(instrument_token)}")
    return json.loads(raw) if raw else None


def get_ticks(instrument_tokens: list[int]) -> dict[int, dict[str, Any]]:
    if not instrument_tokens:
        return {}
    redis = client(required=False)
    if redis is None:
        return {}
    rows = redis.mget([f"kite:tick:{int(token)}" for token in instrument_tokens])
    return {
        int(token): json.loads(raw)
        for token, raw in zip(instrument_tokens, rows)
        if raw
    }


def request_subscriptions(tokens: list[int], *, mode: str = "full") -> None:
    if not tokens:
        return
    redis = client()
    pipe = redis.pipeline(transaction=False)
    for token in tokens:
        pipe.hincrby(SUBSCRIPTIONS_KEY, str(int(token)), 1)
    pipe.publish(CONTROL_CHANNEL, json.dumps({
        "action": "subscribe", "tokens": [int(t) for t in tokens], "mode": mode,
    }))
    pipe.execute()


def release_subscriptions(tokens: list[int]) -> None:
    redis = client(required=False)
    if redis is None or not tokens:
        return
    pipe = redis.pipeline(transaction=False)
    for token in tokens:
        pipe.hincrby(SUBSCRIPTIONS_KEY, str(int(token)), -1)
    pipe.publish(CONTROL_CHANNEL, json.dumps({
        "action": "release", "tokens": [int(t) for t in tokens],
    }))
    pipe.execute()


def acquire_rate_slot(bucket: str, requests_per_second: int) -> bool:
    """Shared fixed-window limiter; deliberately returns instead of sleeping."""
    redis = client()
    key = f"kite:rate:{bucket}:{int(time.time())}"
    pipe = redis.pipeline(transaction=True)
    pipe.incr(key)
    pipe.expire(key, 2)
    count, _ = pipe.execute()
    return int(count) <= requests_per_second
