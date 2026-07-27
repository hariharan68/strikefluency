"""Admin-managed Zerodha Kite Connect authentication lifecycle."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

import httpx

from app.brokers.connections import (
    BROKER_KITE,
    get_broker_connection,
    get_broker_token,
    revoke_kite_token_best_effort,
    save_kite_token_best_effort,
)
from app.config import settings
from app.core import token_store
from app.core.env_file import remove_env_keys, update_env_file
from app.database import SessionLocal
from app.market import kite_cache

logger = logging.getLogger(__name__)
DEFAULT_KITE_REDIRECT_URI = "http://127.0.0.1:8000/api/v1/auth/kite/callback"


def effective_redirect_uri() -> str:
    return settings.KITE_REDIRECT_URI or DEFAULT_KITE_REDIRECT_URI


def has_required_credentials() -> bool:
    return bool(settings.KITE_API_KEY and settings.KITE_API_SECRET)


def mask_api_key(value: str) -> str:
    if not value:
        return ""
    return f"{value[:4]}****{value[-2:]}" if len(value) > 6 else f"{value[:2]}****"


def save_credentials(api_key: str, api_secret: str) -> dict[str, Any]:
    redirect = effective_redirect_uri()
    update_env_file({
        "KITE_API_KEY": api_key,
        "KITE_API_SECRET": api_secret,
        "KITE_REDIRECT_URI": redirect,
    })
    settings.KITE_API_KEY = api_key
    settings.KITE_API_SECRET = api_secret
    settings.KITE_REDIRECT_URI = redirect
    return credentials_status()


def credentials_status() -> dict[str, Any]:
    return {
        "configured": has_required_credentials(),
        "api_key_masked": mask_api_key(settings.KITE_API_KEY),
        "redirect_uri": effective_redirect_uri(),
    }


def _kite(access_token: str | None = None):
    from kiteconnect import KiteConnect

    kite = KiteConnect(api_key=settings.KITE_API_KEY)
    if access_token:
        kite.set_access_token(access_token)
    return kite


def create_login(admin_id: str) -> dict[str, Any]:
    if not has_required_credentials():
        raise ValueError("KITE_NOT_CONFIGURED: save the API key and API secret first")
    validate_api_key()
    operation_id = kite_cache.create_operation(admin_id)
    # redirect_params is returned unchanged by Kite and binds the public
    # callback to the authenticated admin who initiated the operation.
    redirect_state = urlencode({"state": operation_id})
    login_url = _kite().login_url() + "&" + urlencode({"redirect_params": redirect_state})
    kite_cache.set_status(
        "connecting", connected=False, message="Waiting for Zerodha login",
    )
    return {
        "login_url": login_url,
        "operation_id": operation_id,
        "redirect_uri": effective_redirect_uri(),
    }


def validate_api_key() -> None:
    """Fail before opening a popup when Zerodha rejects the configured key."""
    try:
        response = httpx.get(_kite().login_url(), follow_redirects=False, timeout=10)
    except httpx.HTTPError as exc:
        raise RuntimeError("Could not reach Zerodha to validate the Kite API key") from exc

    if response.status_code < 400:
        return
    try:
        payload = response.json()
    except ValueError:
        payload = {}
    message = str(payload.get("message") or "")
    if "api_key" in message.lower():
        raise ValueError(
            "Zerodha rejected this API key. Copy the API key and matching API secret "
            "from the same active Connect app in developers.kite.trade, then save them again."
        )
    raise RuntimeError("Zerodha refused the Kite login request")


def _next_expiry() -> datetime:
    now = datetime.now(ZoneInfo("Asia/Kolkata"))
    expiry = now.replace(hour=6, minute=0, second=0, microsecond=0)
    if now >= expiry:
        expiry += timedelta(days=1)
    return expiry.astimezone(timezone.utc)


def exchange_request_token(request_token: str, operation_id: str) -> dict[str, Any]:
    operation = kite_cache.consume_operation(operation_id)
    if not operation:
        raise ValueError("Kite connection operation is missing, expired, or already used")
    if not request_token:
        raise ValueError("Kite callback did not include request_token")

    kite = _kite()
    session = kite.generate_session(request_token, api_secret=settings.KITE_API_SECRET)
    access_token = session.get("access_token")
    if not access_token:
        raise RuntimeError("Kite token exchange returned no access token")
    kite.set_access_token(access_token)
    profile = kite.profile()
    if not profile or not profile.get("user_id"):
        raise RuntimeError("Kite profile validation failed")

    expires_at = _next_expiry()
    meta = {
        "source": "oauth",
        "user_id": profile.get("user_id"),
        "user_name": profile.get("user_name"),
        "login_time": datetime.now(timezone.utc).isoformat(),
        "expires_at": expires_at.isoformat(),
        "connected_by": operation.get("admin_id"),
    }
    _disconnect_other_brokers()
    token_store.set_access_token(access_token, source="kite_oauth")
    if not save_kite_token_best_effort(access_token, meta):
        token_store.clear_access_token()
        raise RuntimeError("Kite token could not be persisted securely")
    activate_provider()
    kite_cache.set_status(
        "feed_reconnecting", connected=True, feed_connected=False,
        message="Kite authenticated; waiting for KiteTicker",
        profile={"user_id": profile.get("user_id"), "user_name": profile.get("user_name")},
        expires_at=expires_at.isoformat(),
    )
    return {"profile": profile, "expires_at": expires_at.isoformat()}


def _disconnect_other_brokers() -> None:
    from app.services import fyers_auth_service

    fyers_auth_service.clear_saved_token(revoke_db=True)


def activate_provider() -> None:
    settings.MARKET_DATA_PROVIDER = "kite"
    try:
        update_env_file({"MARKET_DATA_PROVIDER": "kite"})
    except OSError:
        logger.warning("Could not persist MARKET_DATA_PROVIDER=kite")


def get_saved_access_token() -> str:
    meta = token_metadata()
    expires_at = meta.get("expires_at")
    if expires_at:
        try:
            if datetime.fromisoformat(expires_at) <= datetime.now(timezone.utc):
                mark_expired()
                return ""
        except ValueError:
            pass
    if settings.MARKET_DATA_PROVIDER == "kite":
        hot = token_store.get_access_token()
        if hot:
            return hot
    db = SessionLocal()
    try:
        return get_broker_token(db, broker=BROKER_KITE, user_id=None) or settings.KITE_ACCESS_TOKEN
    finally:
        db.close()


def token_metadata() -> dict[str, Any]:
    db = SessionLocal()
    try:
        connection = get_broker_connection(db, broker=BROKER_KITE, user_id=None)
        return dict(connection.meta or {}) if connection else {}
    finally:
        db.close()


def mark_expired(message: str = "Zerodha session expired") -> None:
    token_store.clear_access_token()
    revoke_kite_token_best_effort(expired=True)
    kite_cache.set_status(
        "reconnect_required", connected=False, message=message,
    )


def clear_saved_token(*, expired: bool = False) -> None:
    if settings.MARKET_DATA_PROVIDER == "kite":
        token_store.clear_access_token()
    revoke_kite_token_best_effort(expired=expired)
    kite_cache.set_status(
        "reconnect_required" if expired else "unavailable",
        connected=False,
        message="Zerodha login required" if expired else "Kite disconnected",
    )
    try:
        kite_cache.client(required=False).publish(
            kite_cache.CONTROL_CHANNEL, '{"action":"stop"}'
        )
    except Exception:
        pass


def revoke_credentials() -> dict[str, Any]:
    clear_saved_token()
    remove_env_keys(["KITE_API_KEY", "KITE_API_SECRET", "KITE_ACCESS_TOKEN"])
    settings.KITE_API_KEY = ""
    settings.KITE_API_SECRET = ""
    settings.KITE_ACCESS_TOKEN = ""
    if settings.MARKET_DATA_PROVIDER == "kite":
        settings.MARKET_DATA_PROVIDER = "mock"
        update_env_file({"MARKET_DATA_PROVIDER": "mock"})
    return credentials_status()


def connection_status(*, validate: bool = False) -> dict[str, Any]:
    status = {**credentials_status(), **kite_cache.get_status()}
    token = get_saved_access_token() if has_required_credentials() else ""
    meta = token_metadata() if token else {}
    expires_at = meta.get("expires_at")
    if expires_at:
        try:
            if datetime.fromisoformat(expires_at) <= datetime.now(timezone.utc):
                mark_expired()
                token = ""
                status = {**credentials_status(), **kite_cache.get_status()}
        except ValueError:
            pass
    status.update({
        "has_token": bool(token),
        "expires_at": expires_at,
        "profile": (
            {"user_id": meta.get("user_id"), "user_name": meta.get("user_name")}
            if meta.get("user_id") else None
        ),
    })
    if validate and token:
        try:
            profile = _kite(token).profile()
            status.update({"connected": True, "state": "connected", "profile": {
                "user_id": profile.get("user_id"), "user_name": profile.get("user_name"),
            }})
        except Exception as exc:
            handle_kite_exception(exc)
            status = {**credentials_status(), **kite_cache.get_status(), "has_token": False}
    return status


def handle_kite_exception(exc: Exception) -> None:
    try:
        from kiteconnect.exceptions import TokenException
    except ImportError:
        TokenException = ()  # type: ignore[assignment]
    status_code = getattr(exc, "code", None) or getattr(exc, "status_code", None)
    if isinstance(exc, TokenException) or status_code == 403:
        mark_expired()
        raise RuntimeError("Zerodha session expired; administrator reconnect required") from exc
    raise exc
