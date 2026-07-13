"""
app/core/security_kernel.py
────────────────────────────
The Security Kernel: every route in this application is forced through
the security system — not by convention, but by construction.

THE CONTRACT (read this before adding any endpoint):

  Every HTTP route and every WebSocket route must be ONE of:

    1. AUTHENTICATED — its dependency tree contains one of the kernel's
       recognized auth dependencies (CurrentUser, CurrentAdmin,
       get_current_auth, get_ws_user). This is the default for
       everything you build.

    2. DECLARED PUBLIC — listed in PUBLIC_ROUTES below with a written
       reason. Public is an explicit, reviewable decision, never an
       accident.

  If a route is neither, `audit_route_security(app)` raises RuntimeError
  at import time and THE APPLICATION REFUSES TO BOOT. You cannot ship
  an unprotected endpoint by forgetting — the process will not start.

  This means any new feature (router, endpoint, websocket) is
  automatically connected to the security system the moment it is
  registered on the app. There is no opt-in step to forget.

HOW TO ADD A NEW FEATURE (for humans and AI agents):

    from app.dependencies import CurrentUser

    @router.get("/my-new-endpoint")
    def my_endpoint(current_user: CurrentUser):   # ← this is the connection
        ...

  That's it. If you genuinely need a public endpoint (an OAuth callback,
  a health check), add it to PUBLIC_ROUTES with a reason and expect the
  reviewer to challenge it.
"""

import logging
import uuid as _uuid

from fastapi import Depends, HTTPException, Query, WebSocket, WebSocketException, status
from fastapi.routing import APIRoute, APIWebSocketRoute
from jose import JWTError
from sqlalchemy.orm import Session
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings
from app.core.security import verify_token
from app.database import get_db
from app.models.user import User
from app.services.jti_store import is_denied

logger = logging.getLogger(__name__)


# ═════════════════════════════════════════════════════════════════════
# 1. PUBLIC ROUTE REGISTRY — the ONLY way an endpoint skips auth.
#    Key: (METHOD, full path template). WebSockets use method "WS".
#    Every entry needs a reason — it is printed at startup so the
#    public surface is visible on every boot.
# ═════════════════════════════════════════════════════════════════════

PUBLIC_ROUTES: dict[tuple[str, str], str] = {
    # ── System ──
    ("GET", "/health"): "liveness probe; returns no user data",

    # ── Password auth entry points (they CREATE the session) ──
    ("POST", "/api/v1/auth/register"): "account creation; rate-limited 3/min",
    ("POST", "/api/v1/auth/login"): "credential login; rate-limited 5/min",
    ("POST", "/api/v1/auth/refresh"): "cookie-authenticated + Origin-checked; rate-limited 20/min",
    ("POST", "/api/v1/auth/logout"): "cookie-authenticated + Origin-checked",

    # ── OAuth (browser redirects cannot carry a Bearer header) ──
    ("GET", "/api/v1/oauth/{provider}/start"): "OAuth initiation; creates server-side transaction",
    ("GET", "/api/v1/oauth/{provider}/callback"): "provider redirect target; state+PKCE verified",
    ("POST", "/api/v1/oauth/link/{challenge_id}/confirm"): "account-link proof; requires account password",

    # ── Fyers broker callback (external redirect, no Bearer possible) ──
    ("GET", "/api/v1/auth/fyers/callback"): "Fyers popup redirect; carries one-time auth_code only",
    ("GET", "/api/v1/broker/fyers/callback"): "legacy alias of the Fyers redirect target",

    # ── Market status (no user data, used by pre-login screens) ──
    ("GET", "/api/v1/market/status"): "market open/closed clock; contains no user or account data",
}


# ═════════════════════════════════════════════════════════════════════
# 2. WEBSOCKET AUTH — browsers cannot send Authorization headers on
#    WebSocket upgrade, so the access token travels as ?token=…
#    Same verification pipeline as HTTP: signature, expiry, type,
#    JTI denylist, token_version, active user.
# ═════════════════════════════════════════════════════════════════════

def get_ws_user(
    websocket: WebSocket,
    token: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> User:
    """Authenticate a WebSocket connection or reject it with 1008 (policy violation)."""
    denied = WebSocketException(code=status.WS_1008_POLICY_VIOLATION, reason="authentication required")
    if not token:
        raise denied
    try:
        payload = verify_token(token, expected_type="access")
    except JWTError:
        raise denied
    if is_denied(payload.get("jti")):
        raise denied
    try:
        user_id = _uuid.UUID(payload.get("sub", ""))
    except ValueError:
        raise denied
    user = db.query(User).filter(User.id == user_id).first()
    if user is None or not user.is_active:
        raise denied
    if payload.get("tv", 0) != user.token_version:
        raise denied
    return user


# ═════════════════════════════════════════════════════════════════════
# 3. DEV-ONLY GATE — debug endpoints vanish (404) outside development.
# ═════════════════════════════════════════════════════════════════════

def require_dev_environment() -> None:
    """Dependency that makes an endpoint exist only in development."""
    if not settings.is_development:
        raise HTTPException(status_code=404, detail="Not found")


# ═════════════════════════════════════════════════════════════════════
# 4. THE FAIL-CLOSED BOOT AUDIT — the "force" in force-security.
# ═════════════════════════════════════════════════════════════════════

def _collect_auth_calls():
    """The dependency callables the kernel recognizes as authentication."""
    from app.dependencies import get_current_active_admin, get_current_auth, get_current_user
    return {get_current_user, get_current_auth, get_current_active_admin, get_ws_user}


def _dependant_has_auth(dependant, auth_calls) -> bool:
    """Recursively walk a FastAPI dependency tree looking for an auth dependency."""
    if dependant.call in auth_calls:
        return True
    return any(_dependant_has_auth(sub, auth_calls) for sub in dependant.dependencies)


def audit_route_security(app) -> dict:
    """
    Walk every registered route. Each must be authenticated or declared
    public. Otherwise: RuntimeError — the app will not start.

    Returns a summary dict {"authenticated": n, "public": n} for logging.
    """
    auth_calls = _collect_auth_calls()
    violations: list[str] = []
    stats = {"authenticated": 0, "public": 0}
    seen_public: set[tuple[str, str]] = set()

    for route in app.routes:
        if isinstance(route, APIWebSocketRoute):
            entries = [("WS", route.path)]
            dependant = route.dependant
        elif isinstance(route, APIRoute):
            entries = [(m, route.path) for m in route.methods if m not in ("HEAD", "OPTIONS")]
            dependant = route.dependant
        else:
            continue  # docs/openapi/static starlette routes — not API surface

        authed = _dependant_has_auth(dependant, auth_calls)
        for method, path in entries:
            if authed:
                stats["authenticated"] += 1
            elif (method, path) in PUBLIC_ROUTES:
                stats["public"] += 1
                seen_public.add((method, path))
            else:
                violations.append(f"{method} {path}")

    if violations:
        raise RuntimeError(
            "SECURITY KERNEL: refusing to start — the following routes are neither "
            "authenticated nor declared in PUBLIC_ROUTES (app/core/security_kernel.py):\n  "
            + "\n  ".join(violations)
            + "\nEither add an auth dependency (CurrentUser) or declare the route public with a reason."
        )

    stale = set(PUBLIC_ROUTES) - seen_public
    if stale:
        logger.warning(
            "SECURITY KERNEL: PUBLIC_ROUTES entries with no matching route (remove them): %s",
            ", ".join(f"{m} {p}" for m, p in sorted(stale)),
        )

    return stats


# ═════════════════════════════════════════════════════════════════════
# 5. SECURITY HEADERS — applied to every response, every feature,
#    automatically. New endpoints inherit them with zero effort.
# ═════════════════════════════════════════════════════════════════════

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        if request.url.path.startswith("/api/"):
            response.headers.setdefault("Cache-Control", "no-store")
        if settings.is_production:
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return response
