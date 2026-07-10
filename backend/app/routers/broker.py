"""Fyers broker integration endpoints."""

from html import escape

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from app.market.provider_factory import reset_provider
from app.services import fyers_auth_service as fyers_auth

router = APIRouter(tags=["Fyers Broker"])


class FyersAuthCodeRequest(BaseModel):
    auth_code: str


class FyersAccessTokenRequest(BaseModel):
    access_token: str


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


@router.get("/auth/fyers/login")
def fyers_login():
    try:
        return fyers_auth.get_login_payload()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


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
        reset_provider()
        return _success_html("You can close this popup and return to StrikeFluency.")
    except Exception as exc:
        return _error_html(str(exc))


@router.get("/auth/fyers/status")
def fyers_status():
    return fyers_auth.connection_status()


@router.delete("/auth/fyers/token")
def delete_fyers_token():
    fyers_auth.clear_saved_token(revoke_db=True)
    reset_provider()
    return {"success": True, "message": "Fyers token cleared"}


@router.post("/auth/fyers/token")
def set_fyers_token(payload: FyersAccessTokenRequest):
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
def exchange_fyers_auth_code(payload: FyersAuthCodeRequest):
    try:
        response = fyers_auth.exchange_auth_code(payload.auth_code)
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


@router.get("/auth/fyers/debug/chain/{instrument_id}")
def debug_fyers_chain(instrument_id: str):
    try:
        from app.market.provider_factory import get_market_provider

        provider = get_market_provider()
        return provider.get_option_chain(instrument_id.upper())
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


# Backward-compatible aliases for the older Settings implementation.
@router.get("/broker/fyers/status")
def legacy_fyers_status():
    return fyers_status()


@router.get("/broker/fyers/auth-url")
def legacy_fyers_auth_url():
    payload = fyers_login()
    return {"auth_url": payload["login_url"], **payload}


@router.get("/broker/fyers/callback")
def legacy_fyers_callback(auth_code: str | None = Query(default=None), code: str | None = Query(default=None)):
    return fyers_callback(auth_code=auth_code, code=code)


@router.get("/broker/fyers/profile")
def legacy_fyers_profile():
    try:
        return fyers_auth.get_profile()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/broker/fyers/token")
def legacy_fyers_exchange(payload: FyersAuthCodeRequest):
    return exchange_fyers_auth_code(payload)


@router.post("/broker/fyers/disconnect")
def legacy_fyers_disconnect():
    return delete_fyers_token()
