"""Provider exchange and server-side OAuth transaction helpers."""

import base64
import hashlib
import logging
import secrets
import time
import uuid
from datetime import datetime, timedelta, timezone

import httpx
from jose import jwt
from jose.exceptions import JOSEError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.core.exceptions import InvalidCredentialsError
from app.core.security import create_access_token, verify_password
from app.models.link_challenge import LinkChallenge
from app.models.oauth_identity import OAuthIdentity
from app.models.oauth_transaction import OAuthTransaction
from app.models.security_notification import SecurityNotification
from app.models.user import User
from app.schemas.auth import RegisterRequest
from app.services import audit_service
from app.services.audit_service import AuditAction, AuditRef
from app.services.auth_service import _DUMMY_PASSWORD_HASH, normalize_email, register_user
from app.services.token_service import create_refresh_token_record

logger = logging.getLogger(__name__)

SUPPORTED_PROVIDERS = frozenset({"google", "github", "facebook"})

# Wrong-password guesses allowed against one link challenge before it is burned.
# The challenge id travels in a URL and the confirm endpoint is unauthenticated,
# so per-IP rate limiting alone is not a bound.
MAX_LINK_ATTEMPTS = 5

_GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"
# Google has issued tokens under both spellings for years; both are legitimate.
_GOOGLE_ISSUERS = ("https://accounts.google.com", "accounts.google.com")
_JWKS_TTL_SECONDS = 3600

_jwks_cache: dict | None = None
_jwks_fetched_at: float = 0.0


class OAuthConfigurationError(Exception):
    pass


def _pkce_pair() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(48)
    digest = hashlib.sha256(verifier.encode()).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    return verifier, challenge


def _reap_expired(db: Session) -> None:
    """Drop long-dead transactions and challenges.

    Nothing else deletes these rows, and /start inserts one per unauthenticated
    hit, so without this the tables only grow.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=1)
    db.query(OAuthTransaction).filter(OAuthTransaction.expires_at < cutoff).delete(synchronize_session=False)
    db.query(LinkChallenge).filter(LinkChallenge.expires_at < cutoff).delete(synchronize_session=False)


def create_transaction(
    db: Session, provider: str, remember_me: bool, link_challenge_id: uuid.UUID | None = None
) -> tuple[OAuthTransaction, str, str, str]:
    provider = provider.lower()
    if provider not in SUPPORTED_PROVIDERS:
        raise OAuthConfigurationError("Unsupported OAuth provider")
    verifier, challenge = _pkce_pair()
    state = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(32)
    _reap_expired(db)
    txn = OAuthTransaction(
        provider=provider, state=state, pkce_verifier=verifier, nonce=nonce,
        remember_me=remember_me, link_challenge_id=link_challenge_id,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
    )
    db.add(txn)
    db.commit()
    return txn, state, challenge, nonce


def authorization_url(provider: str, state: str, challenge: str, nonce: str) -> str:
    if provider == "google":
        if not settings.GOOGLE_CLIENT_ID:
            raise OAuthConfigurationError("Google OAuth is not configured")
        params = {
            "client_id": settings.GOOGLE_CLIENT_ID, "redirect_uri": settings.GOOGLE_REDIRECT_URI,
            "response_type": "code", "scope": "openid email profile", "state": state,
            "code_challenge": challenge, "code_challenge_method": "S256",
            # Binds the id_token we get back to this specific /start.
            "nonce": nonce,
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


def _google_jwks(force: bool = False) -> dict:
    global _jwks_cache, _jwks_fetched_at
    fresh = _jwks_cache is not None and time.monotonic() - _jwks_fetched_at < _JWKS_TTL_SECONDS
    if fresh and not force:
        return _jwks_cache
    response = httpx.get(_GOOGLE_JWKS_URL, timeout=10)
    response.raise_for_status()
    _jwks_cache = response.json()
    _jwks_fetched_at = time.monotonic()
    return _jwks_cache


def _google_signing_key(kid: str) -> dict:
    for jwks in (_google_jwks(), _google_jwks(force=True)):
        for key in jwks.get("keys", []):
            if key.get("kid") == kid:
                return key
    raise InvalidCredentialsError("Unknown Google signing key")


def _verify_google_id_token(id_token: str, access_token: str, nonce: str | None) -> dict:
    """Validate Google's OIDC assertion and return its claims.

    This is what makes the caller a relying party rather than a token bearer: we
    check that Google signed the assertion, that it is addressed to *our* client,
    and that it answers the nonce from this browser's /start.
    """
    header = jwt.get_unverified_header(id_token)
    kid = header.get("kid") or ""
    claims = jwt.decode(
        id_token,
        key=_google_signing_key(kid),
        # Pinned, never read from the header — otherwise "alg": "none" or HS256
        # signed with the RSA public key as the shared secret would be accepted.
        algorithms=["RS256"],
        audience=settings.GOOGLE_CLIENT_ID,
        issuer=_GOOGLE_ISSUERS,
        # Google's code-flow id_tokens carry at_hash. Supplying the access token
        # both satisfies python-jose (it raises without it) and cryptographically
        # binds the assertion to the token we were handed.
        access_token=access_token,
    )
    # A transaction predating the nonce column has nonce=None; treat that as a
    # failure rather than a waiver.
    if not nonce or not secrets.compare_digest(str(claims.get("nonce") or ""), nonce):
        raise InvalidCredentialsError("OAuth nonce mismatch")
    return claims


def _exchange_google(code: str, txn: OAuthTransaction) -> dict:
    response = httpx.post("https://oauth2.googleapis.com/token", data={
        "client_id": settings.GOOGLE_CLIENT_ID, "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "code": code, "grant_type": "authorization_code", "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "code_verifier": txn.pkce_verifier,
    }, timeout=10)
    response.raise_for_status()
    payload = response.json()
    # The id_token carries sub/email/email_verified/name for the scopes we ask
    # for, so there is no reason to call the userinfo endpoint — and doing so
    # would authenticate whoever bears the access token rather than a Google
    # assertion addressed to this client.
    claims = _verify_google_id_token(payload["id_token"], payload.get("access_token", ""), txn.nonce)
    return {
        "subject": claims.get("sub"),
        "email": claims.get("email"),
        "verified": claims.get("email_verified", False),
        "name": claims.get("name") or "Trader",
    }


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
    except (httpx.HTTPError, JOSEError, KeyError) as exc:
        # A malformed token response or a rejected assertion is a failed
        # exchange, not a server fault — surface it as such.
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
    # Commit, not flush: the callers that reject the flow after this point return
    # a redirect without committing, so a flush would be rolled back and the same
    # state + code pair would stay replayable for the rest of its lifetime.
    db.commit()
    return txn


def find_link_challenge(db: Session, challenge_id: str, provider: str) -> LinkChallenge:
    """Resolve a challenge that `provider` is allowed to satisfy by re-auth."""
    try:
        parsed = uuid.UUID(str(challenge_id))
    except (ValueError, AttributeError, TypeError) as exc:
        raise InvalidCredentialsError("Link challenge is invalid or expired") from exc
    challenge = db.query(LinkChallenge).filter(
        LinkChallenge.id == parsed,
        LinkChallenge.consumed_at.is_(None),
        LinkChallenge.expires_at > datetime.now(timezone.utc),
    ).first()
    if not challenge or challenge.verify_provider != provider.lower():
        raise InvalidCredentialsError("Link challenge is invalid or expired")
    return challenge


def create_link_challenge(
    db: Session, user: User, provider: str, profile: dict, verify_provider: str | None = None
) -> LinkChallenge:
    challenge = LinkChallenge(
        user_id=user.id, provider=provider, provider_subject=profile["subject"],
        provider_email=profile["email"], verify_provider=verify_provider,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
    )
    db.add(challenge)
    db.add(SecurityNotification(user_id=user.id, event_type="oauth_link_requested", message=f"A {provider} sign-in link was requested for your account."))
    db.commit()
    return challenge


def complete_link_challenge(
    db: Session, challenge_id, password: str, ip: str | None = None, user_agent: str | None = None
) -> tuple[User, object, str]:
    try:
        parsed = uuid.UUID(str(challenge_id))
    except (ValueError, AttributeError, TypeError) as exc:
        # A non-UUID path segment would otherwise reach Postgres and raise a
        # DataError, i.e. a 500 on attacker-controlled input.
        raise InvalidCredentialsError("Link challenge is invalid or expired") from exc
    challenge = db.query(LinkChallenge).filter(
        LinkChallenge.id == parsed,
        LinkChallenge.consumed_at.is_(None),
        LinkChallenge.attempts < MAX_LINK_ATTEMPTS,
    ).first()
    if not challenge or challenge.expires_at <= datetime.now(timezone.utc):
        raise InvalidCredentialsError("Link challenge is invalid or expired")
    if challenge.verify_provider is not None:
        # This challenge is satisfied by provider re-authentication, not a
        # password. Burn a dummy verify so the two shapes are indistinguishable.
        verify_password(password, _DUMMY_PASSWORD_HASH)
        raise InvalidCredentialsError("Link challenge is invalid or expired")

    user = db.query(User).filter(User.id == challenge.user_id, User.is_active == True).first()
    if not user or not user.has_usable_password or not verify_password(password, user.hashed_password):
        if not user or not user.has_usable_password:
            verify_password(password, _DUMMY_PASSWORD_HASH)
        challenge.attempts += 1
        if challenge.attempts >= MAX_LINK_ATTEMPTS:
            challenge.consumed_at = datetime.now(timezone.utc)
            if user:
                db.add(SecurityNotification(
                    user_id=user.id, event_type="oauth_link_blocked",
                    message=f"A {challenge.provider} link attempt was blocked after too many failed password entries.",
                ))
        # Commit before raising: the router turns this exception into an HTTP
        # error and never commits, so an in-transaction increment would be
        # rolled away and the counter would never advance.
        db.commit()
        raise InvalidCredentialsError("Invalid password")

    identity = OAuthIdentity(user_id=user.id, provider=challenge.provider, provider_subject=challenge.provider_subject, email=challenge.provider_email, linked_via="password_confirmation")
    db.add(identity)
    challenge.consumed_at = datetime.now(timezone.utc)
    db.add(SecurityNotification(user_id=user.id, event_type="oauth_linked", message=f"{challenge.provider.title()} sign-in was added to your account."))
    record, raw = create_refresh_token_record(db, user, user_agent, True)
    audit_service.record(
        db, action=AuditAction.OAUTH_LINKED, user_id=user.id, tenant_id=user.tenant_id,
        reference_type=AuditRef.SESSION, reference_id=record.family_id,
        detail={"provider": challenge.provider, "linked_via": "password_confirmation"},
        ip_address=ip, user_agent=user_agent,
    )
    db.commit()
    return user, record, raw


def complete_link_challenge_via_provider(
    db: Session, challenge: LinkChallenge, remember_me: bool,
    ip: str | None = None, user_agent: str | None = None,
) -> tuple[User, object, str]:
    """Finish a link challenge for an account that has no password.

    Reached only after the callback has confirmed that the provider identity just
    authenticated belongs to the same user the challenge names — so this is proof
    of control of something the account already owns.
    """
    user = db.query(User).filter(User.id == challenge.user_id, User.is_active == True).first()
    if not user:
        raise InvalidCredentialsError("Link challenge is invalid or expired")
    db.add(OAuthIdentity(
        user_id=user.id, provider=challenge.provider, provider_subject=challenge.provider_subject,
        email=challenge.provider_email, linked_via="provider_reauth",
    ))
    challenge.consumed_at = datetime.now(timezone.utc)
    db.add(SecurityNotification(user_id=user.id, event_type="oauth_linked", message=f"{challenge.provider.title()} sign-in was added to your account."))
    record, raw = create_refresh_token_record(db, user, user_agent, remember_me)
    audit_service.record(
        db, action=AuditAction.OAUTH_LINKED, user_id=user.id, tenant_id=user.tenant_id,
        reference_type=AuditRef.SESSION, reference_id=record.family_id,
        detail={"provider": challenge.provider, "linked_via": "provider_reauth"},
        ip_address=ip, user_agent=user_agent,
    )
    db.commit()
    return user, record, raw


def login_existing_identity(
    db: Session, user: User, remember_me: bool, provider: str,
    ip: str | None = None, user_agent: str | None = None,
) -> tuple[object, str]:
    record, raw = create_refresh_token_record(db, user, user_agent, remember_me)
    audit_service.record(
        db, action=AuditAction.OAUTH_LOGIN, user_id=user.id, tenant_id=user.tenant_id,
        reference_type=AuditRef.SESSION, reference_id=record.family_id,
        detail={"provider": provider}, ip_address=ip, user_agent=user_agent,
    )
    db.commit()
    return record, raw


def issue_new_oauth_user(
    db: Session, profile: dict, provider: str, remember_me: bool,
    ip: str | None = None, user_agent: str | None = None,
) -> tuple[User, object, str]:
    try:
        user = db.query(User).filter(User.email == profile["email"]).first()
        created = False
        if not user:
            user = register_user(db, RegisterRequest(full_name=profile["name"][:100], email=profile["email"], password=secrets.token_urlsafe(32), remember_me=remember_me))
            # The password above is random and never shown to anyone; mark the
            # account so password login and password-confirmation both refuse
            # rather than compare against an unguessable secret.
            user.has_usable_password = False
            created = True
        identity = OAuthIdentity(user_id=user.id, provider=provider, provider_subject=profile["subject"], email=profile["email"], linked_via="oauth_login")
        db.add(identity)
        record, raw = create_refresh_token_record(db, user, user_agent, remember_me)
        # register_user deliberately does not audit — the auth router does it for
        # password signups — so the OAuth path has to write its own row, and it
        # has to happen here because this function owns the commit.
        audit_service.record(
            db,
            action=AuditAction.REGISTER if created else AuditAction.OAUTH_LOGIN,
            user_id=user.id, tenant_id=user.tenant_id,
            reference_type=AuditRef.USER if created else AuditRef.SESSION,
            reference_id=user.id if created else record.family_id,
            detail={"via": "oauth", "provider": provider}, ip_address=ip, user_agent=user_agent,
        )
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
        record, raw = create_refresh_token_record(db, user, user_agent, remember_me)
        audit_service.record(
            db, action=AuditAction.OAUTH_LOGIN, user_id=user.id, tenant_id=user.tenant_id,
            reference_type=AuditRef.SESSION, reference_id=record.family_id,
            detail={"via": "oauth", "provider": provider, "raced": True},
            ip_address=ip, user_agent=user_agent,
        )
        db.commit()
        return user, record, raw


def access_for(user: User, record) -> str:
    return create_access_token(str(user.id), str(user.tenant_id), user.role, session_id=str(record.family_id), token_version=user.token_version)
