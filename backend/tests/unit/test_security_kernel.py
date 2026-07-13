"""
Tests for the Security Kernel (app/core/security_kernel.py).

The kernel's guarantee: a route that is neither authenticated nor
declared public prevents the application from booting. These tests
prove the guarantee holds — and that it can't be silently weakened.
"""

import pytest
from fastapi import APIRouter, Depends, FastAPI, WebSocket

from app.core.security_kernel import (
    PUBLIC_ROUTES,
    audit_route_security,
    get_ws_user,
)
from app.dependencies import get_current_active_admin, get_current_auth, get_current_user


def make_app() -> FastAPI:
    return FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


# ── The core guarantee ────────────────────────────────────────────


def test_unprotected_route_refuses_boot():
    app = make_app()

    @app.get("/api/v1/forgotten-feature")
    def forgotten():
        return {"oops": True}

    with pytest.raises(RuntimeError) as exc:
        audit_route_security(app)
    assert "GET /api/v1/forgotten-feature" in str(exc.value)


def test_unprotected_websocket_refuses_boot():
    app = make_app()

    @app.websocket("/api/v1/forgotten-ws")
    async def forgotten_ws(websocket: WebSocket):
        await websocket.accept()

    with pytest.raises(RuntimeError) as exc:
        audit_route_security(app)
    assert "WS /api/v1/forgotten-ws" in str(exc.value)


def test_every_method_is_audited_separately():
    app = make_app()

    @app.api_route("/api/v1/multi", methods=["GET", "POST", "DELETE"])
    def multi():
        return {}

    with pytest.raises(RuntimeError) as exc:
        audit_route_security(app)
    message = str(exc.value)
    assert "GET /api/v1/multi" in message
    assert "POST /api/v1/multi" in message
    assert "DELETE /api/v1/multi" in message


# ── Authenticated routes pass ─────────────────────────────────────


def test_route_with_get_current_user_passes():
    app = make_app()

    @app.get("/api/v1/secure")
    def secure(user=Depends(get_current_user)):
        return {}

    stats = audit_route_security(app)
    assert stats == {"authenticated": 1, "public": 0}


def test_route_with_admin_dependency_passes():
    app = make_app()

    @app.get("/api/v1/admin-only")
    def admin_only(admin=Depends(get_current_active_admin)):
        return {}

    assert audit_route_security(app)["authenticated"] == 1


def test_route_with_session_auth_passes():
    app = make_app()

    @app.get("/api/v1/sessions-view")
    def sessions_view(auth=Depends(get_current_auth)):
        return {}

    assert audit_route_security(app)["authenticated"] == 1


def test_router_level_dependency_passes():
    """Auth attached at the router level covers every route in it."""
    app = make_app()
    router = APIRouter(dependencies=[Depends(get_current_user)])

    @router.get("/one")
    def one():
        return {}

    @router.get("/two")
    def two():
        return {}

    app.include_router(router, prefix="/api/v1/bulk")
    assert audit_route_security(app)["authenticated"] == 2


def test_websocket_with_ws_auth_passes():
    app = make_app()

    @app.websocket("/api/v1/live")
    async def live(websocket: WebSocket, user=Depends(get_ws_user)):
        await websocket.accept()

    assert audit_route_security(app)["authenticated"] == 1


# ── Declared-public routes pass, undeclared do not ────────────────


def test_declared_public_route_passes():
    app = make_app()

    @app.get("/health")
    def health():
        return {"status": "ok"}

    assert ("GET", "/health") in PUBLIC_ROUTES  # declared with a reason
    stats = audit_route_security(app)
    assert stats == {"authenticated": 0, "public": 1}


def test_public_declaration_is_method_specific():
    """GET /health is public; POST /health is not."""
    app = make_app()

    @app.api_route("/health", methods=["GET", "POST"])
    def health():
        return {"status": "ok"}

    with pytest.raises(RuntimeError) as exc:
        audit_route_security(app)
    assert "POST /health" in str(exc.value)
    assert "GET /health" not in str(exc.value)


def test_every_public_route_has_a_reason():
    for key, reason in PUBLIC_ROUTES.items():
        assert isinstance(reason, str) and len(reason) > 10, (
            f"PUBLIC_ROUTES entry {key} needs a meaningful reason"
        )


# ── The real application passes its own audit ─────────────────────


def test_real_app_boots_and_audits_clean():
    from app.main import app as real_app

    stats = real_app.state.security_audit
    assert stats["authenticated"] > 0
    assert stats["public"] > 0
