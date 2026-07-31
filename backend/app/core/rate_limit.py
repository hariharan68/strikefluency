import time
from collections import defaultdict, deque
from threading import Lock

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

# Exact-path limits.
LIMITS = {
    "/api/v1/auth/login": (5, 60),
    "/api/v1/auth/register": (3, 60),
    "/api/v1/auth/refresh": (20, 60),
}

# Templated OAuth paths can never be exact keys, so they match on prefix+suffix:
# (prefix, suffix, limit, window).
PREFIX_LIMITS = (
    # Writes an oauth_transactions row per hit, unauthenticated — cap the
    # amplification.
    ("/api/v1/oauth/", "/start", 10, 60),
    ("/api/v1/oauth/", "/callback", 10, 60),
    # Accepts account-password guesses — throttle like login.
    ("/api/v1/oauth/link/", "/confirm", 5, 60),
)

# Module-level so tests can clear it. TestClient reports every request as coming
# from the host "testclient", so without a reset the per-IP deques bleed across
# tests in one process and a later test gets a spurious 429.
_events: dict[str, deque] = defaultdict(deque)
_lock = Lock()


def reset_rate_limits() -> None:
    with _lock:
        _events.clear()


def _limit_for(path: str) -> tuple[int | None, int | None]:
    limit, window = LIMITS.get(path, (None, None))
    if limit is not None:
        return limit, window
    for prefix, suffix, prefix_limit, prefix_window in PREFIX_LIMITS:
        if path.startswith(prefix) and path.endswith(suffix):
            return prefix_limit, prefix_window
    return None, None


class AuthRateLimitMiddleware(BaseHTTPMiddleware):
    """Single-process auth guard; use a shared store when scaling horizontally."""

    LIMITS = LIMITS

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        limit, window = _limit_for(path)
        if limit is None:
            return await call_next(request)
        ip = request.client.host if request.client else "unknown"
        key = f"{ip}:{path}"
        now = time.monotonic()
        with _lock:
            events = _events[key]
            while events and now - events[0] >= window:
                events.popleft()
            if len(events) >= limit:
                retry_after = max(1, int(window - (now - events[0])))
                return JSONResponse({"detail": "Too many authentication attempts"}, status_code=429, headers={"Retry-After": str(retry_after)})
            events.append(now)
        return await call_next(request)
