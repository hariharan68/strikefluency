import time
from collections import defaultdict, deque
from threading import Lock

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse


class AuthRateLimitMiddleware(BaseHTTPMiddleware):
    """Single-process auth guard; use a shared store when scaling horizontally."""

    LIMITS = {
        "/api/v1/auth/login": (5, 60),
        "/api/v1/auth/register": (3, 60),
        "/api/v1/auth/refresh": (20, 60),
    }

    def __init__(self, app):
        super().__init__(app)
        self._events = defaultdict(deque)
        self._lock = Lock()

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        limit, window = self.LIMITS.get(path, (None, None))
        if limit is None and path.startswith("/api/v1/oauth/") and path.endswith("/callback"):
            limit, window = 10, 60
        if limit is None and path.startswith("/api/v1/oauth/link/") and path.endswith("/confirm"):
            # Accepts account-password guesses — throttle like login.
            limit, window = 5, 60
        if limit is None:
            return await call_next(request)
        ip = request.client.host if request.client else "unknown"
        key = f"{ip}:{path}"
        now = time.monotonic()
        with self._lock:
            events = self._events[key]
            while events and now - events[0] >= window:
                events.popleft()
            if len(events) >= limit:
                retry_after = max(1, int(window - (now - events[0])))
                return JSONResponse({"detail": "Too many authentication attempts"}, status_code=429, headers={"Retry-After": str(retry_after)})
            events.append(now)
        return await call_next(request)
