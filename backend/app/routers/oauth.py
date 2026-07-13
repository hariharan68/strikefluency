from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.oauth_identity import OAuthIdentity
from app.models.user import User
from app.schemas.auth import UserProfile
from app.schemas.token import TokenResponse
from app.services.oauth_service import (
    OAuthConfigurationError, access_for, authorization_url, complete_link_challenge,
    consume_transaction, create_link_challenge, create_transaction, exchange_code,
    issue_new_oauth_user,
)
from app.services.token_service import create_refresh_token_record

router = APIRouter(prefix="/oauth", tags=["OAuth"])
TXN_COOKIE = "oauth_txn"
TXN_PATH = "/api/v1/oauth"

FRONTEND = settings.FRONTEND_URL


class LinkConfirmation(BaseModel):
    password: str


def _set_refresh_cookie(response, raw: str, remember_me: bool):
    response.set_cookie(
        "refresh_token", raw,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400 if remember_me else None,
        httponly=True, secure=settings.COOKIE_SECURE, samesite="lax", path="/api/v1/auth"
    )


@router.get("/{provider}/start")
def start(provider: str, remember_me: bool = False, db: Session = Depends(get_db)):
    try:
        txn, state, challenge = create_transaction(db, provider, remember_me)
        url = authorization_url(provider.lower(), state, challenge)
    except OAuthConfigurationError as exc:
        return RedirectResponse(f"{FRONTEND}/login?oauth_error=not_configured")
    response = RedirectResponse(url)
    response.set_cookie(TXN_COOKIE, str(txn.txn_id), max_age=600, httponly=True, secure=settings.COOKIE_SECURE, samesite="lax", path=TXN_PATH)
    return response


@router.get("/{provider}/callback")
def callback(provider: str, code: str, state: str, request: Request, db: Session = Depends(get_db)):
    provider = provider.lower()

    try:
        txn = consume_transaction(db, state)
    except Exception:
        return RedirectResponse(f"{FRONTEND}/login?oauth_error=invalid_state")

    if txn.provider != provider:
        return RedirectResponse(f"{FRONTEND}/login?oauth_error=provider_mismatch")

    try:
        profile = exchange_code(provider, code, txn)
    except OAuthConfigurationError:
        return RedirectResponse(f"{FRONTEND}/login?oauth_error=not_configured")
    except Exception:
        return RedirectResponse(f"{FRONTEND}/login?oauth_error=exchange_failed")

    try:
        existing_identity = db.query(OAuthIdentity).filter(
            OAuthIdentity.provider == provider,
            OAuthIdentity.provider_subject == profile["subject"]
        ).first()

        if existing_identity:
            user = db.query(User).filter(User.id == existing_identity.user_id, User.is_active == True).first()
            if not user:
                return RedirectResponse(f"{FRONTEND}/login?oauth_error=inactive")
            record, raw = create_refresh_token_record(db, user, request.headers.get("user-agent"), txn.remember_me)
            db.commit()
        else:
            existing_user = db.query(User).filter(User.email == profile["email"]).first()
            if existing_user:
                challenge = create_link_challenge(db, existing_user, provider, profile)
                return RedirectResponse(
                    f"{FRONTEND}/login?oauth_link={challenge.id}&provider={provider}"
                )
            user, record, raw = issue_new_oauth_user(db, profile, provider, txn.remember_me)
    except Exception:
        return RedirectResponse(f"{FRONTEND}/login?oauth_error=server_error")

    redirect = RedirectResponse(f"{FRONTEND}/auth/oauth-callback", status_code=302)
    redirect.delete_cookie(TXN_COOKIE, path=TXN_PATH)
    _set_refresh_cookie(redirect, raw, txn.remember_me)
    return redirect


@router.post("/link/{challenge_id}/confirm", response_model=TokenResponse)
def confirm_link(challenge_id: str, data: LinkConfirmation, response: Response, db: Session = Depends(get_db)):
    try:
        user, record, raw = complete_link_challenge(db, challenge_id, data.password)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid or expired challenge")
    _set_refresh_cookie(response, raw, True)
    return TokenResponse(access_token=access_for(user, record), user=UserProfile.model_validate(user))
