"""Administrator-managed Zerodha Kite Connect setup endpoints."""

from __future__ import annotations

from html import escape
import logging
from urllib.parse import parse_qs

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from app.database import SessionLocal
from app.dependencies import CurrentAdmin, CurrentUser
from app.market import kite_cache
from app.market.provider_factory import reset_provider
from app.services import kite_auth_service as auth
from app.services.kite_instrument_service import sync_instruments

router = APIRouter(tags=["Zerodha Kite"])
logger = logging.getLogger(__name__)


class KiteCredentialsRequest(BaseModel):
    api_key: str
    api_secret: str


def _callback_html(ok: bool, message: str) -> HTMLResponse:
    title = "Zerodha connected" if ok else "Zerodha connection failed"
    body = f"""<!doctype html><html><head><title>{title}</title></head>
    <body style="font-family:Inter,Arial,sans-serif;padding:24px">
      <h2>{title}</h2><p>{escape(message)}</p>
      {'<script>setTimeout(function(){window.close()},1200)</script>' if ok else ''}
    </body></html>"""
    return HTMLResponse(body, status_code=200 if ok else 400)


@router.get("/auth/kite/status")
def kite_status(current_user: CurrentUser = None):
    return auth.connection_status(validate=False)


@router.get("/auth/kite/credentials")
def kite_credentials(current_admin: CurrentAdmin = None):
    return auth.credentials_status()


@router.post("/auth/kite/credentials")
def save_kite_credentials(payload: KiteCredentialsRequest, current_admin: CurrentAdmin = None):
    api_key = payload.api_key.strip()
    api_secret = payload.api_secret.strip()
    if not (4 <= len(api_key) <= 128) or any(ch.isspace() for ch in api_key):
        raise HTTPException(status_code=400, detail="Kite API key looks invalid")
    if not (8 <= len(api_secret) <= 256) or any(ch.isspace() for ch in api_secret):
        raise HTTPException(status_code=400, detail="Kite API secret looks invalid")
    try:
        return auth.save_credentials(api_key, api_secret)
    except OSError as exc:
        raise HTTPException(status_code=500, detail="Could not persist Kite credentials") from exc


@router.delete("/auth/kite/credentials")
def delete_kite_credentials(current_admin: CurrentAdmin = None):
    result = auth.revoke_credentials()
    reset_provider()
    return {"success": True, "message": "Kite credentials revoked", **result}


@router.get("/auth/kite/login")
def kite_login(current_admin: CurrentAdmin = None):
    try:
        return auth.create_login(str(current_admin.id))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except kite_cache.KiteCacheUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/auth/kite/callback")
def kite_callback(
    request_token: str | None = Query(default=None),
    redirect_params: str | None = Query(default=None),
    state: str | None = Query(default=None),
    status: str | None = Query(default=None),
):
    operation_id = state or ""
    if not operation_id and redirect_params:
        parsed_redirect = parse_qs(redirect_params)
        operation_id = parsed_redirect.get("state", [redirect_params])[0]
    if status and status.lower() != "success":
        # Consume the operation even for a rejected login so it cannot be replayed.
        try:
            kite_cache.consume_operation(operation_id)
        except Exception:
            pass
        return _callback_html(False, "Zerodha login was not completed")
    try:
        auth.exchange_request_token(request_token or "", operation_id)
        reset_provider()
        sync_message = ""
        db = SessionLocal()
        try:
            sync_instruments(db, auth._kite(auth.get_saved_access_token()))
        except Exception:
            db.rollback()
            sync_message = " Instrument sync will retry at 08:30 IST."
        finally:
            db.close()
        try:
            kite_cache.client().publish(kite_cache.CONTROL_CHANNEL, '{"action":"start"}')
        except Exception:
            pass
        return _callback_html(
            True, "Live market-data authentication is ready." + sync_message,
        )
    except Exception as exc:
        logger.warning("Kite callback failed: %s", type(exc).__name__)
        if isinstance(exc, ValueError):
            return _callback_html(False, str(exc))
        return _callback_html(False, "Kite login could not be completed. Return to Settings and try again.")


@router.delete("/auth/kite/token")
def delete_kite_token(current_admin: CurrentAdmin = None):
    auth.clear_saved_token()
    reset_provider()
    return {"success": True, "message": "Kite disconnected; credentials kept"}


@router.post("/auth/kite/instruments/sync")
def sync_kite_instruments(current_admin: CurrentAdmin = None):
    token = auth.get_saved_access_token()
    if not token:
        raise HTTPException(status_code=409, detail="Reconnect Zerodha before syncing instruments")
    db = SessionLocal()
    try:
        return {"success": True, **sync_instruments(db, auth._kite(token))}
    except Exception as exc:
        db.rollback()
        try:
            auth.handle_kite_exception(exc)
        except RuntimeError as auth_exc:
            raise HTTPException(status_code=401, detail=str(auth_exc)) from auth_exc
        except Exception:
            pass
        raise HTTPException(
            status_code=502,
            detail="Kite instrument sync failed; the previous catalog was preserved",
        ) from exc
    finally:
        db.close()
