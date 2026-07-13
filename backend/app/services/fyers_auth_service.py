"""Helpers for the Fyers OAuth/token flow used by broker integration."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import logging

from app.brokers.connections import save_fyers_token_best_effort, revoke_fyers_token_best_effort
from app.config import settings
from app.core import token_store
from app.core.env_file import update_env_file

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[3]
_IGNORE_LEGACY_TOKEN = False

# Must match the mounted route exactly: broker.router at /api/v1 + /auth/fyers/callback.
# This is the URL users paste into the "Redirect URL" field on myapi.fyers.in.
DEFAULT_FYERS_REDIRECT_URI = "http://127.0.0.1:8000/api/v1/auth/fyers/callback"


def get_fyers_client_id() -> str:
    return settings.FYERS_APP_ID or settings.FYERS_CLIENT_ID


def effective_redirect_uri() -> str:
    return settings.FYERS_REDIRECT_URI or DEFAULT_FYERS_REDIRECT_URI


def mask_app_id(app_id: str) -> str:
    if not app_id:
        return ""
    head, _, tail = app_id.partition("-")
    if len(head) <= 4:
        return f"{head}****"
    return f"{head[:4]}****" + (f"-{tail}" if tail else "")


def save_credentials(app_id: str, secret_id: str) -> dict[str, Any]:
    """Persist Fyers app credentials to .env AND the live settings object.

    The in-memory assignment is what makes the wizard work without a server
    restart (uvicorn --reload watches .py files, not .env). The .env write
    makes it survive restarts. The secret is never returned or logged.
    """
    redirect = effective_redirect_uri()
    update_env_file({
        "FYERS_APP_ID": app_id,
        "FYERS_SECRET_ID": secret_id,
        "FYERS_REDIRECT_URI": redirect,
    })
    settings.FYERS_APP_ID = app_id
    settings.FYERS_SECRET_ID = secret_id
    settings.FYERS_REDIRECT_URI = redirect
    return {
        "configured": has_required_credentials(),
        "app_id_masked": mask_app_id(app_id),
        "redirect_uri": redirect,
    }


def activate_fyers_provider() -> None:
    """Switch market data to the live Fyers provider after a successful connect.

    In-memory first (always works), .env best-effort. Safe even if the token
    later dies: the provider factory falls back to mock data when credentials
    or token are missing.
    """
    if settings.MARKET_DATA_PROVIDER == "fyers":
        return
    settings.MARKET_DATA_PROVIDER = "fyers"
    try:
        update_env_file({"MARKET_DATA_PROVIDER": "fyers"})
    except OSError:
        logger.warning("Could not persist MARKET_DATA_PROVIDER to .env; live for this run only")


def get_token_path() -> Path:
    return (PROJECT_ROOT / settings.FYERS_TOKEN_FILE).resolve()


def get_access_token_path() -> Path:
    return (PROJECT_ROOT / settings.FYERS_ACCESS_TOKEN_FILE).resolve()


def has_required_credentials() -> bool:
    return bool(get_fyers_client_id() and settings.FYERS_SECRET_ID and settings.FYERS_REDIRECT_URI)


def get_saved_access_token() -> str:
    hot_token = token_store.get_access_token()
    if hot_token:
        return hot_token

    if _IGNORE_LEGACY_TOKEN:
        return ""

    # Legacy read-only fallback for existing local dev setups. New tokens are not
    # written to these plaintext files; durable persistence is encrypted in DB.
    token_path = get_token_path()
    if token_path.exists():
        try:
            data = json.loads(token_path.read_text(encoding="utf-8"))
            token = data.get("access_token")
            if token:
                token_store.set_in_memory(token, source="legacy_file")
                return token
        except (OSError, json.JSONDecodeError):
            pass

    access_token_path = get_access_token_path()
    if access_token_path.exists():
        try:
            token = access_token_path.read_text(encoding="utf-8").strip()
            if token:
                token_store.set_in_memory(token, source="legacy_file")
                return token
        except OSError:
            pass

    if settings.FYERS_ACCESS_TOKEN:
        token_store.set_in_memory(settings.FYERS_ACCESS_TOKEN, source="env")
        return settings.FYERS_ACCESS_TOKEN

    return ""


def mask_token(token: str) -> str:
    if not token:
        return ""
    if len(token) <= 12:
        return "***"
    return f"{token[:6]}...{token[-6:]}"


def create_session():
    # fyers-apiv3 >= 3.1 moved SessionModel into fyersModel; older releases
    # kept it in accessToken. Support both so SDK upgrades don't break login.
    try:
        from fyers_apiv3.fyersModel import SessionModel
    except ImportError:
        from fyers_apiv3.accessToken import SessionModel

    client_id = get_fyers_client_id()
    return SessionModel(
        client_id=client_id,
        secret_key=settings.FYERS_SECRET_ID,
        redirect_uri=settings.FYERS_REDIRECT_URI,
        response_type="code",
        grant_type="authorization_code",
    )


def generate_auth_url() -> str:
    if not has_required_credentials():
        raise ValueError("FYERS_NOT_CONFIGURED: set FYERS_APP_ID, FYERS_SECRET_ID, and FYERS_REDIRECT_URI.")
    return create_session().generate_authcode()


def get_login_payload() -> dict[str, Any]:
    return {
        "login_url": generate_auth_url(),
        "instructions": "Open login_url, complete Fyers login, then wait for this app to detect the callback.",
        "app_id": get_fyers_client_id(),
        "redirect_uri": settings.FYERS_REDIRECT_URI,
    }


def exchange_auth_code(auth_code: str) -> dict[str, Any]:
    if not auth_code:
        raise ValueError("auth_code is required")
    if not has_required_credentials():
        raise ValueError("FYERS_NOT_CONFIGURED: set FYERS_APP_ID, FYERS_SECRET_ID, and FYERS_REDIRECT_URI.")

    client_id = get_fyers_client_id()
    session = create_session()
    session.set_token(auth_code)
    session.app_id_hash = hashlib.sha256(f"{client_id}:{settings.FYERS_SECRET_ID}".encode()).hexdigest()
    response = session.generate_token()

    token = response.get("access_token")
    if not token:
        raise RuntimeError(f"Fyers token exchange failed: {response}")

    store_access_token(token, source="oauth", meta={"fyers_response": _safe_token_response(response)})
    return response


def store_access_token(access_token: str, source: str = "manual", meta: dict[str, Any] | None = None) -> bool:
    global _IGNORE_LEGACY_TOKEN

    token = (access_token or "").strip()
    if not token:
        raise ValueError("access_token is required")

    _IGNORE_LEGACY_TOKEN = False
    token_store.set_access_token(token, source=source)
    persisted = save_fyers_token_best_effort(token, meta=meta or {"source": source})
    return persisted


def clear_saved_token(revoke_db: bool = True) -> None:
    global _IGNORE_LEGACY_TOKEN

    _IGNORE_LEGACY_TOKEN = True
    token_store.clear_access_token()
    for path in (get_token_path(), get_access_token_path()):
        try:
            if path.exists():
                path.unlink()
        except OSError:
            pass
    if revoke_db:
        revoke_fyers_token_best_effort()


def get_fyers_model(access_token: str | None = None):
    from fyers_apiv3 import fyersModel

    token = access_token or get_saved_access_token()
    if not token:
        raise ValueError("No Fyers access token is available")

    return fyersModel.FyersModel(
        client_id=get_fyers_client_id(),
        is_async=False,
        token=token,
        log_path="",
    )


def get_profile() -> dict[str, Any]:
    return get_fyers_model().get_profile()


def connection_status() -> dict[str, Any]:
    token = get_saved_access_token()
    token_info = token_store.get_token_info()
    status: dict[str, Any] = {
        "configured": has_required_credentials(),
        "has_token": bool(token),
        "token_preview": mask_token(token),
        "token_source": token_info.get("source"),
        "updated_at": token_info.get("updated_at"),
        "connected": False,
        "profile": None,
        "message": "Not connected",
    }

    if not status["configured"]:
        status["message"] = "Fyers app credentials are missing"
        return status
    if not token:
        status["message"] = "Fyers access token is missing"
        return status

    try:
        profile = get_profile()
        ok = profile.get("s") == "ok" or profile.get("code") == 200
        status.update({
            "connected": ok,
            "profile": profile.get("data") or profile,
            "message": "Connected" if ok else "Fyers token rejected",
        })
    except Exception as exc:
        status["message"] = str(exc)

    return status


def _safe_token_response(response: dict[str, Any]) -> dict[str, Any]:
    safe = dict(response)
    if safe.get("access_token"):
        safe["access_token"] = mask_token(safe["access_token"])
    if safe.get("refresh_token"):
        safe["refresh_token"] = mask_token(safe["refresh_token"])
    return safe
