"""Nuvama (API Connect) broker integration endpoints.

Mirror of routers/broker.py (Fyers). The one deliberate difference: Nuvama has
no server-hosted OAuth callback (its redirect is https://127.0.0.1/), so instead
of a GET callback the user pastes the one-time request_id into POST
/auth/nuvama/exchange. Connecting here auto-disconnects Fyers (single active
provider) via nuvama_auth.store_access_token.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.dependencies import CurrentUser
from app.market.provider_factory import get_market_provider, reset_provider
from app.services import nuvama_auth_service as nuvama_auth

router = APIRouter(tags=["Nuvama Broker"])


class NuvamaCredentialsRequest(BaseModel):
    api_key: str
    api_secret: str
    client_id: str


class NuvamaRequestIdRequest(BaseModel):
    request_id: str


class NuvamaAccessTokenRequest(BaseModel):
    access_token: str


@router.get("/auth/nuvama/credentials")
def get_nuvama_credentials(current_user: CurrentUser = None):
    return {
        "configured": nuvama_auth.has_required_credentials(),
        "api_key_masked": nuvama_auth.mask_api_key(nuvama_auth.get_nuvama_api_key()),
        "client_id": nuvama_auth.get_nuvama_client_id(),
        "redirect_uri": nuvama_auth.effective_redirect_uri(),
    }


@router.post("/auth/nuvama/credentials")
def save_nuvama_credentials(payload: NuvamaCredentialsRequest, current_user: CurrentUser = None):
    api_key = payload.api_key.strip()
    api_secret = payload.api_secret.strip()
    client_id = payload.client_id.strip()
    if not (4 <= len(api_key) <= 128):
        raise HTTPException(status_code=400, detail="API key looks invalid — copy it from the Nuvama app console")
    if not (4 <= len(api_secret) <= 256):
        raise HTTPException(status_code=400, detail="API secret looks invalid — copy it from the Nuvama app console")
    if not client_id.isalnum() or not (4 <= len(client_id) <= 32):
        raise HTTPException(status_code=400, detail="Nuvama Client ID should be the numeric/alphanumeric id from the console (e.g. 70194097)")
    try:
        return nuvama_auth.save_credentials(api_key, api_secret, client_id)
    except (ValueError, OSError) as exc:
        raise HTTPException(status_code=500, detail="Could not save credentials to the server configuration") from exc


@router.delete("/auth/nuvama/credentials")
def revoke_nuvama_credentials(current_user: CurrentUser = None):
    """REVOKE — remove API key + secret + client id from .env. Reconnecting needs new keys."""
    result = nuvama_auth.revoke_credentials()
    reset_provider()
    return {"success": True, "message": "Nuvama credentials revoked", **result}


@router.get("/auth/nuvama/login")
def nuvama_login(current_user: CurrentUser = None):
    try:
        return nuvama_auth.get_login_payload()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/auth/nuvama/exchange")
def exchange_nuvama_request_id(payload: NuvamaRequestIdRequest, current_user: CurrentUser):
    try:
        response = nuvama_auth.exchange_request_id(payload.request_id)
        nuvama_auth.activate_nuvama_provider()
        reset_provider()
        provider = get_market_provider()
        if (
            provider.__class__.__name__ != "NuvamaMarketDataProvider"
            or not provider.is_connected()
        ):
            raise RuntimeError(
                "Nuvama login succeeded, but the live quote feed returned no index prices"
            )
        return {
            "success": True,
            "message": "Nuvama connected — live market data active (Fyers disconnected)",
            "token_preview": nuvama_auth.mask_token(response.get("access_token", "")),
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ImportError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/auth/nuvama/token")
def set_nuvama_token(payload: NuvamaAccessTokenRequest, current_user: CurrentUser):
    try:
        persisted = nuvama_auth.store_access_token(payload.access_token, source="manual")
        nuvama_auth.activate_nuvama_provider()
        reset_provider()
        return {
            "success": True,
            "persisted": persisted,
            "message": "Nuvama access token stored (Fyers disconnected)",
            "token_preview": nuvama_auth.mask_token(payload.access_token),
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/auth/nuvama/status")
def nuvama_status(current_user: CurrentUser = None):
    return nuvama_auth.connection_status()


@router.delete("/auth/nuvama/token")
def delete_nuvama_token(current_user: CurrentUser = None):
    """DISCONNECT — drop the session/token but keep credentials."""
    nuvama_auth.clear_saved_token(revoke_db=True)
    reset_provider()
    return {"success": True, "message": "Nuvama disconnected"}


@router.get("/broker/nuvama/profile")
def nuvama_profile(current_user: CurrentUser = None):
    try:
        return nuvama_auth.get_profile()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ImportError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
