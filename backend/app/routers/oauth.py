"""Provider sign-in redirects and the account-link confirmation endpoint."""

import logging
import secrets

from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.core.exceptions import InvalidCredentialsError
from app.core.origin import check_origin
from app.database import get_db
from app.models.link_challenge import LinkChallenge
from app.models.oauth_identity import OAuthIdentity
from app.models.user import User
from app.schemas.auth import UserProfile
from app.schemas.token import TokenResponse
from app.services import audit_service
from app.services.oauth_service import (
    OAuthConfigurationError, access_for, authorization_url, complete_link_challenge,
    complete_link_challenge_via_provider, consume_transaction, create_link_challenge,
    create_transaction, exchange_code, find_link_challenge, issue_new_oauth_user,
    login_existing_identity,
)

logger = logging.getLogger(__name__)

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


def _fail(code: str) -> RedirectResponse:
    """Send the browser back to /login with an error code, clearing the binding.

    Every failure path goes through here so a dead transaction cookie is never
    left behind to confuse the next attempt.
    """
    # 302, matching the success path: this is a GET -> GET browser redirect, and
    # RedirectResponse's 307 default would needlessly preserve the method.
    response = RedirectResponse(f"{FRONTEND}/login?oauth_error={code}", status_code=302)
    response.delete_cookie(TXN_COOKIE, path=TXN_PATH)
    return response


@router.get("/{provider}/start")
def start(
    provider: str, remember_me: bool = False, link_challenge: str | None = None,
    db: Session = Depends(get_db),
):
    challenge_id = None
    if link_challenge:
        # Re-authentication for an account-link challenge on a password-less
        # account. The challenge must already name this provider as the one that
        # can satisfy it, so this cannot be pointed at an arbitrary account.
        try:
            challenge_id = find_link_challenge(db, link_challenge, provider).id
        except InvalidCredentialsError:
            return _fail("link_failed")
    try:
        txn, state, challenge, nonce = create_transaction(db, provider, remember_me, challenge_id)
        url = authorization_url(provider.lower(), state, challenge, nonce)
    except OAuthConfigurationError:
        return _fail("not_configured")
    response = RedirectResponse(url)
    response.set_cookie(TXN_COOKIE, str(txn.txn_id), max_age=600, httponly=True, secure=settings.COOKIE_SECURE, samesite="lax", path=TXN_PATH)
    return response


@router.get("/{provider}/callback")
def callback(
    provider: str, request: Request, db: Session = Depends(get_db),
    code: str | None = None, state: str | None = None, error: str | None = None,
):
    provider = provider.lower()

    # Google sends ?error=access_denied with no code when the user cancels or is
    # not an approved test user. Declaring code/state as required would answer
    # that with a raw 422 in the browser instead of a redirect.
    if state:
        try:
            txn = consume_transaction(db, state)
        except Exception:
            return _fail("invalid_state")
    else:
        return _fail("cancelled")

    if error or not code:
        return _fail("cancelled")

    # The transaction must belong to the browser that started it. Without this the
    # state is a bearer value: an attacker could run their own flow and hand the
    # victim the finished callback URL, silently signing the victim into the
    # attacker's Google account. Accepted tradeoff: /start overwrites the cookie,
    # so with two concurrent sign-in tabs the older one fails invalid_state.
    cookie_txn = request.cookies.get(TXN_COOKIE) or ""
    if not secrets.compare_digest(cookie_txn, str(txn.txn_id)):
        return _fail("invalid_state")

    if txn.provider != provider:
        return _fail("provider_mismatch")

    try:
        profile = exchange_code(provider, code, txn)
    except OAuthConfigurationError:
        return _fail("not_configured")
    except Exception:
        return _fail("exchange_failed")

    ip = audit_service.client_ip(request)
    user_agent = request.headers.get("user-agent")

    try:
        existing_identity = db.query(OAuthIdentity).filter(
            OAuthIdentity.provider == provider,
            OAuthIdentity.provider_subject == profile["subject"]
        ).first()

        if txn.link_challenge_id:
            return _complete_provider_link(db, txn, existing_identity, ip, user_agent)

        if existing_identity:
            user = db.query(User).filter(User.id == existing_identity.user_id, User.is_active == True).first()
            if not user:
                return _fail("inactive")
            record, raw = login_existing_identity(db, user, txn.remember_me, provider, ip, user_agent)
        else:
            existing_user = db.query(User).filter(User.email == profile["email"]).first()
            if existing_user:
                return _challenge_link(db, existing_user, provider, profile)
            user, record, raw = issue_new_oauth_user(db, profile, provider, txn.remember_me, ip, user_agent)
    except Exception:
        # Constraint violations and DB faults were previously invisible here.
        logger.exception("OAuth callback failed for provider=%s", provider)
        return _fail("server_error")

    redirect = RedirectResponse(f"{FRONTEND}/auth/oauth-callback", status_code=302)
    redirect.delete_cookie(TXN_COOKIE, path=TXN_PATH)
    _set_refresh_cookie(redirect, raw, txn.remember_me)
    return redirect


def _challenge_link(db: Session, existing_user: User, provider: str, profile: dict):
    """An account already holds this email but has not linked this provider.

    A bare email match must never grant a session: /auth/register does not verify
    email, so an attacker can pre-register someone else's address. The user has to
    prove they control the existing account first.
    """
    if existing_user.has_usable_password:
        challenge = create_link_challenge(db, existing_user, provider, profile)
        return RedirectResponse(f"{FRONTEND}/login?oauth_link={challenge.id}&provider={provider}")

    prior = db.query(OAuthIdentity).filter(OAuthIdentity.user_id == existing_user.id).first()
    if not prior:
        # No password and no linked provider — nothing could ever prove ownership.
        # Unreachable today; loud rather than silent if that ever changes.
        logger.warning("Account %s has neither a password nor an OAuth identity", existing_user.id)
        return _fail("link_unavailable")

    challenge = create_link_challenge(db, existing_user, provider, profile, verify_provider=prior.provider)
    return RedirectResponse(
        f"{FRONTEND}/login?oauth_link={challenge.id}&provider={provider}&verify={prior.provider}"
    )


def _complete_provider_link(db: Session, txn, existing_identity, ip, user_agent):
    """Finish a link challenge that was confirmed by re-authenticating a provider."""
    challenge = db.query(LinkChallenge).filter(
        LinkChallenge.id == txn.link_challenge_id,
        LinkChallenge.consumed_at.is_(None),
    ).first()
    # The identity that just authenticated must belong to the same account the
    # challenge names, or this would link a provider to a stranger's account.
    if not challenge or not existing_identity or existing_identity.user_id != challenge.user_id:
        return _fail("link_failed")
    user, record, raw = complete_link_challenge_via_provider(db, challenge, txn.remember_me, ip, user_agent)
    redirect = RedirectResponse(f"{FRONTEND}/auth/oauth-callback", status_code=302)
    redirect.delete_cookie(TXN_COOKIE, path=TXN_PATH)
    _set_refresh_cookie(redirect, raw, txn.remember_me)
    return redirect


@router.post("/link/{challenge_id}/confirm", response_model=TokenResponse)
def confirm_link(challenge_id: str, data: LinkConfirmation, request: Request, response: Response, db: Session = Depends(get_db)):
    check_origin(request)
    try:
        user, record, raw = complete_link_challenge(
            db, challenge_id, data.password,
            audit_service.client_ip(request), request.headers.get("user-agent"),
        )
    except InvalidCredentialsError:
        # One message for every failure. Distinguishing "wrong password" from
        # "too many attempts" or "no password on this account" would turn this
        # into an account-shape oracle.
        raise HTTPException(status_code=400, detail="Invalid or expired challenge")
    _set_refresh_cookie(response, raw, True)
    return TokenResponse(access_token=access_for(user, record), user=UserProfile.model_validate(user))
