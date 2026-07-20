"""Fyers broker integration endpoints."""

import re
from html import escape

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from app.core.security_kernel import require_dev_environment
from app.dependencies import CurrentUser
from app.market.provider_factory import reset_provider
from app.services import fyers_auth_service as fyers_auth

router = APIRouter(tags=["Fyers Broker"])


class FyersAuthCodeRequest(BaseModel):
    auth_code: str


class FyersAccessTokenRequest(BaseModel):
    access_token: str


class FyersCredentialsRequest(BaseModel):
    app_id: str
    secret_id: str


_APP_ID_RE = re.compile(r"^[A-Z0-9]{4,20}-[0-9]{2,4}$")  # e.g. XC4EODJ5MN-100


def _success_html(message: str) -> HTMLResponse:
    body = f"""
    <!doctype html>
    <html><head><title>Fyers Connected</title></head>
    <body style="font-family: Inter, Arial, sans-serif; padding: 24px;">
      <h2>Fyers connected</h2>
      <p>{escape(message)}</p>
      <script>setTimeout(function() {{ window.close(); }}, 1200);</script>
    </body></html>
    """
    return HTMLResponse(body)


def _error_html(message: str) -> HTMLResponse:
    body = f"""
    <!doctype html>
    <html><head><title>Fyers Connection Failed</title></head>
    <body style="font-family: Inter, Arial, sans-serif; padding: 24px;">
      <h2>Fyers connection failed</h2>
      <p>{escape(message)}</p>
    </body></html>
    """
    return HTMLResponse(body, status_code=400)


@router.get("/auth/fyers/credentials")
def get_fyers_credentials(current_user: CurrentUser = None):
    return {
        "configured": fyers_auth.has_required_credentials(),
        "app_id_masked": fyers_auth.mask_app_id(fyers_auth.get_fyers_client_id()),
        "redirect_uri": fyers_auth.effective_redirect_uri(),
    }


@router.post("/auth/fyers/credentials")
def save_fyers_credentials(payload: FyersCredentialsRequest, current_user: CurrentUser = None):
    app_id = payload.app_id.strip().upper()
    secret = payload.secret_id.strip()
    if not _APP_ID_RE.fullmatch(app_id):
        raise HTTPException(status_code=400, detail="App ID should look like ABCDE123XY-100 — copy it from the Fyers dashboard")
    if not (5 <= len(secret) <= 64) or not all(33 <= ord(c) <= 126 for c in secret) or "#" in secret:
        raise HTTPException(status_code=400, detail="Secret ID looks invalid — copy it exactly from the Fyers dashboard")
    try:
        return fyers_auth.save_credentials(app_id, secret)
    except (ValueError, OSError) as exc:
        raise HTTPException(status_code=500, detail="Could not save credentials to the server configuration") from exc


@router.delete("/auth/fyers/credentials")
def revoke_fyers_credentials(current_user: CurrentUser = None):
    """REVOKE — remove App ID + Secret ID from .env. Reconnecting needs new keys."""
    result = fyers_auth.revoke_credentials()
    reset_provider()
    return {"success": True, "message": "Fyers credentials revoked", **result}


@router.get("/auth/fyers/login")
def fyers_login(current_user: CurrentUser = None):
    try:
        return fyers_auth.get_login_payload()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ImportError as exc:
        raise HTTPException(status_code=503, detail="Fyers SDK is not available on the server") from exc


@router.get("/auth/fyers/callback")
def fyers_callback(
    auth_code: str | None = Query(default=None),
    code: str | None = Query(default=None),
    s: str | None = Query(default=None),
):
    received_code = auth_code or code
    if not received_code:
        return _error_html("Missing auth_code from Fyers callback")

    try:
        fyers_auth.exchange_auth_code(received_code)
        fyers_auth.activate_fyers_provider()
        reset_provider()
        return _success_html("You can close this popup and return to StrikeFluency.")
    except Exception as exc:
        return _error_html(str(exc))


@router.get("/auth/fyers/status")
def fyers_status(current_user: CurrentUser = None):
    return fyers_auth.connection_status()


@router.delete("/auth/fyers/token")
def delete_fyers_token(current_user: CurrentUser = None):
    fyers_auth.clear_saved_token(revoke_db=True)
    reset_provider()
    return {"success": True, "message": "Fyers token cleared"}


@router.post("/auth/fyers/token")
def set_fyers_token(payload: FyersAccessTokenRequest, current_user: CurrentUser):
    try:
        persisted = fyers_auth.store_access_token(payload.access_token, source="manual")
        reset_provider()
        return {
            "success": True,
            "persisted": persisted,
            "message": "Fyers access token stored",
            "token_preview": fyers_auth.mask_token(payload.access_token),
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/auth/fyers/exchange")
def exchange_fyers_auth_code(payload: FyersAuthCodeRequest, current_user: CurrentUser = None):
    try:
        response = fyers_auth.exchange_auth_code(payload.auth_code)
        fyers_auth.activate_fyers_provider()
        reset_provider()
        return {
            "success": True,
            "message": "Fyers access token stored",
            "token_preview": fyers_auth.mask_token(response.get("access_token", "")),
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/auth/fyers/debug/chain/{instrument_id}", dependencies=[Depends(require_dev_environment)])
def debug_fyers_chain(instrument_id: str, current_user: CurrentUser = None):
    try:
        from app.market.provider_factory import get_market_provider

        provider = get_market_provider()
        return provider.get_option_chain(instrument_id.upper())
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


# Backward-compatible aliases for the older Settings implementation.
@router.get("/broker/fyers/status")
def legacy_fyers_status(current_user: CurrentUser = None):
    return fyers_auth.connection_status()


@router.get("/broker/fyers/auth-url")
def legacy_fyers_auth_url(current_user: CurrentUser = None):
    try:
        payload = fyers_auth.get_login_payload()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"auth_url": payload["login_url"], **payload}


@router.get("/broker/fyers/callback")
def legacy_fyers_callback(auth_code: str | None = Query(default=None), code: str | None = Query(default=None)):
    return fyers_callback(auth_code=auth_code, code=code)


@router.get("/broker/fyers/profile")
def legacy_fyers_profile(current_user: CurrentUser = None):
    try:
        return fyers_auth.get_profile()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/broker/fyers/token")
def legacy_fyers_exchange(payload: FyersAuthCodeRequest, current_user: CurrentUser = None):
    return exchange_fyers_auth_code(payload)


@router.post("/broker/fyers/disconnect")
def legacy_fyers_disconnect(current_user: CurrentUser = None):
    return delete_fyers_token()
