"""Provider exchange and server-side OAuth transaction helpers."""

import base64
import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.core.exceptions import InvalidCredentialsError
from app.core.security import create_access_token, hash_password, verify_password
from app.models.link_challenge import LinkChallenge
from app.models.oauth_identity import OAuthIdentity
from app.models.oauth_transaction import OAuthTransaction
from app.models.security_notification import SecurityNotification
from app.models.user import User
from app.schemas.auth import RegisterRequest
from app.services.auth_service import normalize_email, register_user
from app.services.token_service import create_refresh_token_record


class OAuthConfigurationError(Exception):
    pass


def _pkce_pair() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(48)
    digest = hashlib.sha256(verifier.encode()).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    return verifier, challenge


def create_transaction(db: Session, provider: str, remember_me: bool) -> tuple[OAuthTransaction, str, str]:
    provider = provider.lower()
    if provider not in {"google", "github", "facebook"}:
        raise OAuthConfigurationError("Unsupported OAuth provider")
    verifier, challenge = _pkce_pair()
    state = secrets.token_urlsafe(32)
    txn = OAuthTransaction(
        provider=provider, state=state, pkce_verifier=verifier,
        remember_me=remember_me,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
    )
    db.add(txn)
    db.commit()
    return txn, state, challenge


def authorization_url(provider: str, state: str, challenge: str) -> str:
    if provider == "google":
        if not settings.GOOGLE_CLIENT_ID:
            raise OAuthConfigurationError("Google OAuth is not configured")
        params = {
            "client_id": settings.GOOGLE_CLIENT_ID, "redirect_uri": settings.GOOGLE_REDIRECT_URI,
            "response_type": "code", "scope": "openid email profile", "state": state,
            "code_challenge": challenge, "code_challenge_method": "S256",
            "prompt": "select_account", "access_type": "online",
        }
        return "https://accounts.google.com/o/oauth2/v2/auth?" + httpx.QueryParams(params).__str__()
    if provider == "github":
        if not settings.GITHUB_CLIENT_ID:
            raise OAuthConfigurationError("GitHub OAuth is not configured")
        params = {
            "client_id": settings.GITHUB_CLIENT_ID, "redirect_uri": settings.GITHUB_REDIRECT_URI,
            "scope": "read:user user:email", "state": state,
            "allow_signup": "true",
        }
        return "https://github.com/login/oauth/authorize?" + httpx.QueryParams(params).__str__()
    if not settings.FACEBOOK_CLIENT_ID:
        raise OAuthConfigurationError("Facebook OAuth is not configured")
    params = {
        "client_id": settings.FACEBOOK_CLIENT_ID, "redirect_uri": settings.FACEBOOK_REDIRECT_URI,
        "scope": "email,public_profile", "state": state, "response_type": "code",
    }
    return "https://www.facebook.com/v20.0/dialog/oauth?" + httpx.QueryParams(params).__str__()


def _exchange_google(code: str, txn: OAuthTransaction) -> dict:
    response = httpx.post("https://oauth2.googleapis.com/token", data={
        "client_id": settings.GOOGLE_CLIENT_ID, "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "code": code, "grant_type": "authorization_code", "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "code_verifier": txn.pkce_verifier,
    }, timeout=10)
    response.raise_for_status()
    access_token = response.json().get("access_token")
    profile = httpx.get("https://openidconnect.googleapis.com/v1/userinfo", headers={"Authorization": f"Bearer {access_token}"}, timeout=10)
    profile.raise_for_status()
    data = profile.json()
    return {"subject": data.get("sub"), "email": data.get("email"), "verified": data.get("email_verified", False), "name": data.get("name") or "Trader"}


def _exchange_github(code: str, txn: OAuthTransaction) -> dict:
    if not settings.GITHUB_CLIENT_ID or not settings.GITHUB_CLIENT_SECRET:
        raise OAuthConfigurationError("GitHub OAuth is not configured")
    token = httpx.post("https://github.com/login/oauth/access_token", data={
        "client_id": settings.GITHUB_CLIENT_ID, "client_secret": settings.GITHUB_CLIENT_SECRET,
        "code": code, "redirect_uri": settings.GITHUB_REDIRECT_URI,
    }, headers={"Accept": "application/json"}, timeout=10)
    token.raise_for_status()
    access_token = token.json().get("access_token")
    headers = {"Authorization": f"Bearer {access_token}", "Accept": "application/vnd.github+json"}
    user_response = httpx.get("https://api.github.com/user", headers=headers, timeout=10)
    emails_response = httpx.get("https://api.github.com/user/emails", headers=headers, timeout=10)
    user_response.raise_for_status()
    emails_response.raise_for_status()
    verified = next((item for item in emails_response.json() if item.get("primary") and item.get("verified")), None)
    return {"subject": str(user_response.json().get("id") or ""), "email": verified.get("email") if verified else "", "verified": bool(verified), "name": user_response.json().get("name") or user_response.json().get("login") or "Trader"}


def _exchange_facebook(code: str, txn: OAuthTransaction) -> dict:
    if not settings.FACEBOOK_CLIENT_ID or not settings.FACEBOOK_CLIENT_SECRET:
        raise OAuthConfigurationError("Facebook OAuth is not configured")
    token = httpx.get("https://graph.facebook.com/v20.0/oauth/access_token", params={
        "client_id": settings.FACEBOOK_CLIENT_ID, "client_secret": settings.FACEBOOK_CLIENT_SECRET,
        "code": code, "redirect_uri": settings.FACEBOOK_REDIRECT_URI,
    }, timeout=10)
    token.raise_for_status()
    access_token = token.json().get("access_token")
    profile = httpx.get("https://graph.facebook.com/me", params={
        "fields": "id,name,email", "access_token": access_token,
    }, timeout=10)
    profile.raise_for_status()
    data = profile.json()
    email = data.get("email") or ""
    return {"subject": str(data.get("id") or ""), "email": email, "verified": bool(email), "name": data.get("name") or "Trader"}


def exchange_code(provider: str, code: str, txn: OAuthTransaction) -> dict:
    _exchange = {"google": _exchange_google, "github": _exchange_github, "facebook": _exchange_facebook}
    try:
        profile = _exchange[provider](code, txn)
    except httpx.HTTPError as exc:
        raise InvalidCredentialsError("OAuth provider exchange failed") from exc
    email = normalize_email(profile.get("email") or "")
    subject = str(profile.get("subject") or "")
    if not subject or len(subject) > 255 or "@" not in email or len(email) > 320 or not profile.get("verified"):
        raise InvalidCredentialsError("OAuth profile could not be verified")
    profile["email"] = email
    return profile


def consume_transaction(db: Session, state: str) -> OAuthTransaction:
    now = datetime.now(timezone.utc)
    txn = db.query(OAuthTransaction).filter(
        OAuthTransaction.state == state,
        OAuthTransaction.consumed_at.is_(None),
        OAuthTransaction.expires_at > now,
    ).first()
    if not txn:
        raise InvalidCredentialsError("OAuth transaction is invalid or expired")
    txn.consumed_at = now
    db.flush()
    return txn


def create_link_challenge(db: Session, user: User, provider: str, profile: dict) -> LinkChallenge:
    challenge = LinkChallenge(
        user_id=user.id, provider=provider, provider_subject=profile["subject"],
        provider_email=profile["email"], expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
    )
    db.add(challenge)
    db.add(SecurityNotification(user_id=user.id, event_type="oauth_link_requested", message=f"A {provider} sign-in link was requested for your account."))
    db.commit()
    return challenge


def complete_link_challenge(db: Session, challenge_id, password: str) -> tuple[User, object, str]:
    challenge = db.query(LinkChallenge).filter(LinkChallenge.id == challenge_id, LinkChallenge.consumed_at.is_(None)).first()
    if not challenge or challenge.expires_at <= datetime.now(timezone.utc):
        raise InvalidCredentialsError("Link challenge is invalid or expired")
    user = db.query(User).filter(User.id == challenge.user_id, User.is_active == True).first()
    if not user or not verify_password(password, user.hashed_password):
        raise InvalidCredentialsError("Invalid password")
    identity = OAuthIdentity(user_id=user.id, provider=challenge.provider, provider_subject=challenge.provider_subject, email=challenge.provider_email, linked_via="password_confirmation")
    db.add(identity)
    challenge.consumed_at = datetime.now(timezone.utc)
    db.add(SecurityNotification(user_id=user.id, event_type="oauth_linked", message=f"{challenge.provider.title()} sign-in was added to your account."))
    record, raw = create_refresh_token_record(db, user, "oauth-link", True)
    db.commit()
    return user, record, raw


def issue_new_oauth_user(db: Session, profile: dict, provider: str, remember_me: bool) -> tuple[User, object, str]:
    try:
        user = db.query(User).filter(User.email == profile["email"]).first()
        if not user:
            user = register_user(db, RegisterRequest(full_name=profile["name"][:100], email=profile["email"], password=secrets.token_urlsafe(32), remember_me=remember_me))
        identity = OAuthIdentity(user_id=user.id, provider=provider, provider_subject=profile["subject"], email=profile["email"], linked_via="oauth_login")
        db.add(identity)
        record, raw = create_refresh_token_record(db, user, "oauth", remember_me)
        db.commit()
        return user, record, raw
    except IntegrityError:
        db.rollback()
        user = db.query(User).filter(User.email == profile["email"]).first()
        if not user:
            raise InvalidCredentialsError("OAuth account could not be created")
        identity = db.query(OAuthIdentity).filter(OAuthIdentity.provider == provider, OAuthIdentity.provider_subject == profile["subject"]).first()
        if not identity:
            identity = OAuthIdentity(user_id=user.id, provider=provider, provider_subject=profile["subject"], email=profile["email"], linked_via="oauth_login")
            db.add(identity)
        record, raw = create_refresh_token_record(db, user, "oauth", remember_me)
        db.commit()
        return user, record, raw


def access_for(user: User, record) -> str:
    return create_access_token(str(user.id), str(user.tenant_id), user.role, session_id=str(record.family_id), token_version=user.token_version)
