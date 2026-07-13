import logging
from datetime import datetime, timezone

from app.config import settings

logger = logging.getLogger(__name__)
_local_denied: dict[str, datetime] = {}


def _redis_client():
    if not settings.JTI_DENYLIST_ENABLED or not settings.REDIS_URL:
        return None
    try:
        import redis
        return redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)
    except ImportError:
        logger.warning("JTI denylist enabled but redis package is unavailable")
        return None


def deny_jti(jti: str, expires_at: int) -> None:
    if not settings.JTI_DENYLIST_ENABLED:
        return
    ttl = max(1, expires_at - int(datetime.now(timezone.utc).timestamp()))
    client = _redis_client()
    if client:
        client.setex(f"sf:denied-jti:{jti}", ttl, "1")
    else:
        _local_denied[jti] = datetime.fromtimestamp(expires_at, timezone.utc)


def is_denied(jti: str | None) -> bool:
    if not settings.JTI_DENYLIST_ENABLED or not jti:
        return False
    client = _redis_client()
    if client:
        return bool(client.exists(f"sf:denied-jti:{jti}"))
    expiry = _local_denied.get(jti)
    if not expiry:
        return False
    if expiry <= datetime.now(timezone.utc):
        _local_denied.pop(jti, None)
        return False
    return True
