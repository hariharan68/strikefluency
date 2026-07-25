"""Helpers for the Nuvama (API Connect) login/token flow.

This mirrors app/services/fyers_auth_service.py deliberately: same shape,
same persistence model (hot in-memory token_store + encrypted DB row), same
wizard-friendly .env writes. The two differences from Fyers are:

  1. Auth. Nuvama has no server-side OAuth callback we can host on 127.0.0.1
     with HTTPS. The login URL redirects to the app's Redirect URL with a
     one-time ``request_id`` in the address bar; the user pastes it back and we
     exchange it via the Nuvama Python SDK (APIConnect).

  2. Static IP. Nuvama only answers API calls from the whitelisted IP(s) set on
     the app (see the "Create New App" console). connection_status() surfaces
     that as a distinct, human-readable reason instead of a silent mock fallback.

Only ONE market-data provider is active at a time (settings.MARKET_DATA_PROVIDER).
Connecting Nuvama therefore auto-disconnects Fyers, and vice-versa — see
store_access_token() / activate_nuvama_provider().
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from app.brokers.connections import (
    revoke_nuvama_token_best_effort,
    save_nuvama_token_best_effort,
)
from app.config import settings
from app.core import token_store
from app.core.env_file import remove_env_keys, update_env_file

logger = logging.getLogger(__name__)

# The redirect users register on the Nuvama app console (see the "Create New App"
# form). Nuvama appends the one-time request_id to this URL after login. We never
# have to host anything here — the user copies the request_id out of the address
# bar and pastes it into the wizard.
DEFAULT_NUVAMA_REDIRECT_URI = "https://127.0.0.1/"
NUVAMA_LOGIN_BASE = "https://www.nuvamawealth.com/api-connect/login"


def get_nuvama_api_key() -> str:
    return settings.NUVAMA_API_KEY


def get_nuvama_client_id() -> str:
    return settings.NUVAMA_CLIENT_ID


def effective_redirect_uri() -> str:
    return settings.NUVAMA_REDIRECT_URI or DEFAULT_NUVAMA_REDIRECT_URI


def mask_api_key(api_key: str) -> str:
    if not api_key:
        return ""
    if len(api_key) <= 6:
        return f"{api_key[:2]}****"
    return f"{api_key[:4]}****{api_key[-2:]}"


def mask_token(token: str) -> str:
    if not token:
        return ""
    if len(token) <= 12:
        return "***"
    return f"{token[:6]}...{token[-6:]}"


def has_required_credentials() -> bool:
    return bool(
        settings.NUVAMA_API_KEY
        and settings.NUVAMA_API_SECRET
        and settings.NUVAMA_CLIENT_ID
    )


def save_credentials(api_key: str, api_secret: str, client_id: str) -> dict[str, Any]:
    """Persist Nuvama app credentials to .env AND the live settings object.

    In-memory assignment makes the wizard work without a server restart; the
    .env write makes it survive restarts. The secret is never returned or logged.
    """
    redirect = effective_redirect_uri()
    update_env_file({
        "NUVAMA_API_KEY": api_key,
        "NUVAMA_API_SECRET": api_secret,
        "NUVAMA_CLIENT_ID": client_id,
        "NUVAMA_REDIRECT_URI": redirect,
    })
    settings.NUVAMA_API_KEY = api_key
    settings.NUVAMA_API_SECRET = api_secret
    settings.NUVAMA_CLIENT_ID = client_id
    settings.NUVAMA_REDIRECT_URI = redirect
    return {
        "configured": has_required_credentials(),
        "api_key_masked": mask_api_key(api_key),
        "client_id": client_id,
        "redirect_uri": redirect,
    }


def generate_auth_url() -> str:
    if not has_required_credentials():
        raise ValueError(
            "NUVAMA_NOT_CONFIGURED: set NUVAMA_API_KEY, NUVAMA_API_SECRET and NUVAMA_CLIENT_ID."
        )
    return f"{NUVAMA_LOGIN_BASE}?api_key={settings.NUVAMA_API_KEY}"


def get_login_payload() -> dict[str, Any]:
    return {
        "login_url": generate_auth_url(),
        "instructions": (
            "Open login_url, sign in with your Nuvama credentials, then copy the "
            "request_id from the redirected address bar and paste it back here."
        ),
        "client_id": get_nuvama_client_id(),
        "redirect_uri": effective_redirect_uri(),
    }


def _sdk_session_path() -> Path:
    """Return the session file path used internally by APIConnect."""
    return Path.cwd() / f"data_{settings.NUVAMA_API_KEY}.txt"


def _remove_sdk_session_file() -> None:
    session_path = _sdk_session_path()
    try:
        session_path.unlink(missing_ok=True)
    except OSError as exc:
        raise RuntimeError("Could not clear the previous Nuvama SDK session") from exc


def _build_api_connect(request_id: str, *, force_reauth: bool = False):
    """Construct APIConnect and convert its sys.exit behavior into an error."""
    from app.brokers.nuvama.sdk import create_api_connect

    # APIConnect ignores a newly supplied request_id whenever its old data_*.txt
    # session exists. Explicit Connect must remove that file or it can silently
    # reuse an expired session and report a false success.
    if force_reauth:
        _remove_sdk_session_file()

    try:
        return create_api_connect(
            settings.NUVAMA_API_KEY,
            settings.NUVAMA_API_SECRET,
            request_id,
        )
    except SystemExit as exc:
        raise RuntimeError(
            "Nuvama request_id expired or was already used — sign in again and paste the new request_id"
        ) from exc


def _decode_sdk_payload(raw: Any, operation: str) -> dict[str, Any]:
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"Nuvama returned invalid JSON for {operation}") from exc
    if not isinstance(raw, dict):
        raise RuntimeError(f"Nuvama returned no usable data for {operation}")
    error = raw.get("error")
    if isinstance(error, dict):
        message = error.get("errMsg") or error.get("message") or error
        raise RuntimeError(f"Nuvama {operation} failed: {message}")
    return raw


def _validate_live_session(api: Any) -> dict[str, Any]:
    """Confirm that APIConnect generated usable login/session data."""
    fn = getattr(api, "GetLoginData", None)
    if not callable(fn):
        raise RuntimeError("Installed Nuvama SDK does not expose GetLoginData")
    payload = _decode_sdk_payload(fn(), "session validation")
    if not _profile_ok(payload):
        raise RuntimeError("Nuvama session validation returned no login data")
    return payload


def _extract_access_token(api: Any, request_id: str) -> str:
    """Pull a reusable access-token string out of the SDK client.

    TODO(nuvama-sdk): confirm the real accessor on the installed library. We try
    the common ones and fall back to the request_id so a live session still works
    for this run even if we can't persist a long-lived token.
    """
    for attr in ("get_access_token", "getAccessToken", "access_token", "accessToken"):
        candidate = getattr(api, attr, None)
        if candidate is None:
            continue
        value = candidate() if callable(candidate) else candidate
        if value:
            return str(value)
    return request_id


def exchange_request_id(request_id: str) -> dict[str, Any]:
    if not request_id or not request_id.strip():
        raise ValueError("request_id is required")
    if not has_required_credentials():
        raise ValueError(
            "NUVAMA_NOT_CONFIGURED: set NUVAMA_API_KEY, NUVAMA_API_SECRET and NUVAMA_CLIENT_ID."
        )

    request_id = request_id.strip()
    try:
        api = _build_api_connect(request_id, force_reauth=True)
        _validate_live_session(api)
    except ImportError as exc:
        raise ImportError("Nuvama SDK (APIConnect) is not installed on the server") from exc
    except Exception as exc:  # SDK raises broadly on bad request_id / IP not whitelisted
        raise RuntimeError(f"Nuvama login failed: {exc}") from exc

    access_token = _extract_access_token(api, request_id)
    # Persist the request_id so the provider can rebuild the session after a restart.
    try:
        update_env_file({"NUVAMA_REQUEST_ID": request_id})
        settings.NUVAMA_REQUEST_ID = request_id
    except OSError:
        logger.warning("Could not persist NUVAMA_REQUEST_ID to .env; live for this run only")

    store_access_token(access_token, source="oauth", meta={"request_id": mask_token(request_id)})
    return {"access_token": access_token}


def store_access_token(access_token: str, source: str = "manual", meta: dict[str, Any] | None = None) -> bool:
    """Store the Nuvama access token, hot + durable, enforcing single-active broker.

    Because the app runs exactly one live provider at a time and both brokers
    share one in-memory token slot, we disconnect Fyers FIRST (which clears the
    shared store), THEN write the Nuvama token — so ordering can never leave the
    store holding the wrong broker's token.
    """
    token = (access_token or "").strip()
    if not token:
        raise ValueError("access_token is required")

    # Mutual exclusivity: switching to Nuvama revokes the Fyers session.
    _disconnect_fyers()
    try:
        from app.services import kite_auth_service

        kite_auth_service.clear_saved_token()
    except Exception as exc:
        logger.warning("Could not auto-disconnect Kite while switching to Nuvama: %s", exc)

    token_store.set_access_token(token, source=source)
    persisted = save_nuvama_token_best_effort(token, meta=meta or {"source": source})
    return persisted


def _disconnect_fyers() -> None:
    """Drop the Fyers live session (token) without wiping its saved credentials.

    Lazy import avoids an import cycle: fyers_auth_service disconnects Nuvama the
    same way. clear_saved_token() does NOT call back into store_access_token, so
    there is no recursion.
    """
    try:
        from app.services import fyers_auth_service

        fyers_auth_service.clear_saved_token(revoke_db=True)
    except Exception as exc:
        logger.warning("Could not auto-disconnect Fyers while switching to Nuvama: %s", exc)


def get_saved_access_token() -> str:
    hot_token = token_store.get_access_token()
    if hot_token:
        return hot_token
    if settings.NUVAMA_ACCESS_TOKEN:
        token_store.set_in_memory(settings.NUVAMA_ACCESS_TOKEN, source="env")
        return settings.NUVAMA_ACCESS_TOKEN
    return ""


def activate_nuvama_provider() -> None:
    """Make Nuvama the live market-data provider after a successful connect.

    In-memory first (always works), .env best-effort. Safe even if the token
    later dies: the provider factory falls back to mock when the token is missing
    or the IP is no longer whitelisted.
    """
    if settings.MARKET_DATA_PROVIDER == "nuvama":
        return
    settings.MARKET_DATA_PROVIDER = "nuvama"
    try:
        update_env_file({"MARKET_DATA_PROVIDER": "nuvama"})
    except OSError:
        logger.warning("Could not persist MARKET_DATA_PROVIDER to .env; live for this run only")


def clear_saved_token(revoke_db: bool = True) -> None:
    """DISCONNECT: drop the access token but KEEP the app credentials.

    Reconnecting afterwards needs only the login → request_id flow, no re-entry
    of the API key/secret. Never calls store_access_token — safe to invoke from
    the Fyers side as the cross-broker revoke.
    """
    token_store.clear_access_token()
    try:
        _remove_sdk_session_file()
    except RuntimeError as exc:
        logger.warning("Could not remove local Nuvama SDK session: %s", exc)
    if revoke_db:
        revoke_nuvama_token_best_effort()


def revoke_credentials() -> dict[str, Any]:
    """REVOKE: forget Nuvama entirely — remove credentials from .env.

    Clears the token first, deletes the app credentials from both .env and the
    live settings object, and reverts market data to mock. Reconnecting requires
    re-entering the API key/secret.
    """
    clear_saved_token(revoke_db=True)

    remove_env_keys([
        "NUVAMA_API_KEY", "NUVAMA_API_SECRET", "NUVAMA_CLIENT_ID",
        "NUVAMA_REQUEST_ID", "NUVAMA_ACCESS_TOKEN",
    ])
    settings.NUVAMA_API_KEY = ""
    settings.NUVAMA_API_SECRET = ""
    settings.NUVAMA_CLIENT_ID = ""
    settings.NUVAMA_REQUEST_ID = ""
    settings.NUVAMA_ACCESS_TOKEN = ""

    # Only revert to mock if Nuvama was the active provider — never stomp on Fyers.
    if settings.MARKET_DATA_PROVIDER == "nuvama":
        settings.MARKET_DATA_PROVIDER = "mock"
        try:
            update_env_file({"MARKET_DATA_PROVIDER": "mock"})
        except OSError:
            logger.warning("Could not persist MARKET_DATA_PROVIDER=mock to .env")

    return {"configured": has_required_credentials()}


def get_profile() -> dict[str, Any]:
    """Return login/profile data from APIConnect's local session file."""
    request_id = settings.NUVAMA_REQUEST_ID
    if not request_id:
        raise ValueError("No Nuvama session — connect the broker first")
    session_path = _sdk_session_path()
    if not session_path.exists():
        raise RuntimeError("Nuvama session expired — click Connect and sign in again")
    try:
        session = json.loads(session_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError("Could not read the local Nuvama SDK session") from exc
    return _decode_sdk_payload(session.get("data"), "login profile")


def connection_status() -> dict[str, Any]:
    token = get_saved_access_token()
    token_info = token_store.get_token_info()
    status: dict[str, Any] = {
        "broker": "nuvama",
        "configured": has_required_credentials(),
        "has_token": bool(token),
        "token_preview": mask_token(token),
        "token_source": token_info.get("source"),
        "updated_at": token_info.get("updated_at"),
        "connected": False,
        "profile": None,
        "message": "Not connected",
        "active": settings.MARKET_DATA_PROVIDER == "nuvama",
    }

    if not status["configured"]:
        status["message"] = "Nuvama app credentials are missing"
        return status
    if not token:
        status["message"] = "Nuvama session is missing — sign in to connect"
        return status

    try:
        profile = get_profile()
        profile_ok = _profile_ok(profile)
        live_connected = False
        if status["active"]:
            from app.market.provider_factory import get_market_provider

            provider = get_market_provider()
            live_connected = (
                provider.__class__.__name__ == "NuvamaMarketDataProvider"
                and provider.is_connected()
            )
        ok = profile_ok and live_connected
        status.update({
            "connected": ok,
            "profile": profile.get("data") if isinstance(profile, dict) else profile,
            "message": (
                "Connected"
                if ok
                else "Nuvama login is saved, but the live quote feed is unavailable"
            ),
        })
    except ImportError:
        status["message"] = "Nuvama SDK is not installed on the server"
    except Exception as exc:
        # The single most common live failure: the server IP is not whitelisted.
        text = str(exc).lower()
        if "expired" in text or "already used" in text or "session validation" in text:
            status["message"] = "Nuvama session expired — click Connect and sign in again"
        elif "ip" in text or "whitelist" in text or "forbidden" in text or "403" in text:
            status["message"] = (
                "Nuvama rejected the request — this server's IP may not be whitelisted "
                "on your Nuvama app (Static IP Primary). Update it in the Nuvama console."
            )
        else:
            status["message"] = str(exc)

    return status


def _profile_ok(profile: Any) -> bool:
    if not isinstance(profile, dict):
        return bool(profile)
    if profile.get("code") in (200, "200"):
        return True
    data = profile.get("data")
    if isinstance(data, dict) and isinstance(data.get("lgnData"), dict):
        return True
    status_val = str(profile.get("status") or profile.get("s") or "").lower()
    return status_val in ("ok", "success", "true")
