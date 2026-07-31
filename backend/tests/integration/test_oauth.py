"""End-to-end coverage of the Google OAuth flow.

Each test names the security property it protects, so a regression identifies its
own hole rather than just going red.
"""

import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlsplit

import pytest

from app.core import rate_limit
from app.core.security import hash_password
from app.models.audit_log import AuditLog
from app.models.link_challenge import LinkChallenge
from app.models.oauth_identity import OAuthIdentity
from app.models.oauth_transaction import OAuthTransaction
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.services import oauth_service

TRUSTED_ORIGIN = "http://localhost:5173"
UA = "Mozilla/5.0 (TestBrowser) AppleWebKit/537.36"

CLAIMS = {
    "sub": "google-subject-123",
    "email": "oauth.newuser@example.com",
    "email_verified": True,
    "name": "OAuth Newuser",
    "nonce": "unused-the-verifier-is-stubbed",
}


@pytest.fixture(autouse=True)
def _reset_limits():
    # TestClient reports every request as coming from the host "testclient", so
    # without this the per-IP deques bleed across tests and a later test sees a
    # spurious 429.
    rate_limit.reset_rate_limits()
    yield
    rate_limit.reset_rate_limits()


@pytest.fixture(autouse=True)
def _configure_google(monkeypatch):
    monkeypatch.setattr(oauth_service.settings, "GOOGLE_CLIENT_ID", "test-client.apps.googleusercontent.com")
    monkeypatch.setattr(oauth_service.settings, "GOOGLE_CLIENT_SECRET", "test-secret")
    monkeypatch.setattr(
        oauth_service.settings, "GOOGLE_REDIRECT_URI",
        "http://localhost:5173/api/v1/oauth/google/callback",
    )


@pytest.fixture
def client(db_session):
    """Whole-app client: OAuth depends on the real middleware stack.

    follow_redirects=False keeps the 302s assertable and stops the client from
    actually walking out to accounts.google.com.
    """
    from fastapi.testclient import TestClient
    from app.database import get_db
    from app.main import app

    app.dependency_overrides[get_db] = lambda: db_session
    try:
        yield TestClient(app, follow_redirects=False)
    finally:
        app.dependency_overrides.clear()


def _token_post(payload=None):
    """Stub for the Google token endpoint."""
    class _Response:
        @staticmethod
        def raise_for_status():
            return None

        @staticmethod
        def json():
            return payload or {"access_token": "at-123", "id_token": "idt-123"}

    return lambda *args, **kwargs: _Response()


def _stub_google(monkeypatch, claims=None, verify_error=None):
    monkeypatch.setattr(oauth_service.httpx, "post", _token_post())
    if verify_error is not None:
        def _raise(*args, **kwargs):
            raise verify_error
        monkeypatch.setattr(oauth_service, "_verify_google_id_token", _raise)
    else:
        monkeypatch.setattr(
            oauth_service, "_verify_google_id_token",
            lambda *args, **kwargs: dict(CLAIMS, **(claims or {})),
        )


def _start(client, provider="google", **params):
    response = client.get(f"/api/v1/oauth/{provider}/start", params=params)
    assert response.status_code in (302, 307), response.text
    query = parse_qs(urlsplit(response.headers["location"]).query)
    return response, query


def _error_code(response) -> str:
    return parse_qs(urlsplit(response.headers["location"]).query).get("oauth_error", [""])[0]


# ── /start ────────────────────────────────────────────────────────────────────

def test_start_redirects_to_google_with_state_nonce_and_pkce(client, db_session):
    response, query = _start(client)
    location = response.headers["location"]
    assert location.startswith("https://accounts.google.com/o/oauth2/v2/auth?")
    assert query["code_challenge_method"] == ["S256"]
    assert query["redirect_uri"] == ["http://localhost:5173/api/v1/oauth/google/callback"]
    assert query["scope"] == ["openid email profile"]

    txn = db_session.query(OAuthTransaction).filter(
        OAuthTransaction.state == query["state"][0]
    ).one()
    # The nonce in the URL must be the one persisted, or the id_token check
    # cannot bind the assertion to this browser's /start.
    assert query["nonce"] == [txn.nonce]
    assert response.cookies.get("oauth_txn") == str(txn.txn_id)


def test_start_without_credentials_reports_not_configured(client, monkeypatch):
    monkeypatch.setattr(oauth_service.settings, "GOOGLE_CLIENT_ID", "")
    response = client.get("/api/v1/oauth/google/start")
    assert _error_code(response) == "not_configured"


def test_start_is_rate_limited(client):
    # Unauthenticated and writes an oauth_transactions row per hit, so it has to
    # be capped like the other auth endpoints.
    codes = [client.get("/api/v1/oauth/google/start").status_code for _ in range(11)]
    assert codes[-1] == 429
    assert codes.count(429) == 1


# ── Happy paths ───────────────────────────────────────────────────────────────

def test_new_user_signup_creates_passwordless_account_and_audits(client, db_session, monkeypatch):
    _stub_google(monkeypatch)
    _, query = _start(client)
    response = client.get(
        "/api/v1/oauth/google/callback",
        params={"code": "auth-code", "state": query["state"][0]},
        headers={"user-agent": UA},
    )
    assert response.status_code == 302
    assert response.headers["location"].endswith("/auth/oauth-callback")
    assert response.cookies.get("refresh_token")

    user = db_session.query(User).filter(User.email == CLAIMS["email"]).one()
    # Registered with a random password nobody knows — the flag is what stops
    # /auth/login and the password-confirmation path from comparing against it.
    assert user.has_usable_password is False
    identity = db_session.query(OAuthIdentity).filter(OAuthIdentity.user_id == user.id).one()
    assert identity.provider == "google"
    assert identity.provider_subject == CLAIMS["sub"]

    audit = db_session.query(AuditLog).filter(
        AuditLog.user_id == user.id, AuditLog.action == "REGISTER"
    ).one()
    assert audit.detail["via"] == "oauth"
    token = db_session.query(RefreshToken).filter(RefreshToken.user_id == user.id).one()
    # Was hardcoded "oauth", which left OAuth sessions device-less in the
    # session-revocation UI.
    assert token.device_info == UA


def test_returning_user_logs_in_without_creating_a_second_account(client, db_session, monkeypatch, seeded_user):
    db_session.add(OAuthIdentity(
        id=uuid.uuid4(), user_id=seeded_user.id, provider="google",
        provider_subject=CLAIMS["sub"], email=seeded_user.email, linked_via="oauth_login",
    ))
    db_session.flush()
    before = db_session.query(User).count()

    _stub_google(monkeypatch)
    _, query = _start(client)
    response = client.get(
        "/api/v1/oauth/google/callback",
        params={"code": "auth-code", "state": query["state"][0]},
        headers={"user-agent": UA},
    )
    assert response.status_code == 302
    assert db_session.query(User).count() == before
    assert db_session.query(AuditLog).filter(
        AuditLog.user_id == seeded_user.id, AuditLog.action == "OAUTH_LOGIN"
    ).count() == 1


# ── State and transaction binding ─────────────────────────────────────────────

def test_state_cannot_be_replayed_after_a_failed_exchange(client, monkeypatch):
    """Regression for the consumption being flushed but never committed.

    The failure branches return a redirect without committing, so a flush would
    be rolled back and the same state + code pair would stay live.
    """
    _stub_google(monkeypatch, verify_error=RuntimeError("bad assertion"))
    _, query = _start(client)
    state = query["state"][0]
    first = client.get("/api/v1/oauth/google/callback", params={"code": "c", "state": state})
    assert _error_code(first) == "exchange_failed"

    _stub_google(monkeypatch)
    replay = client.get("/api/v1/oauth/google/callback", params={"code": "c", "state": state})
    assert _error_code(replay) == "invalid_state"


def test_callback_requires_the_transaction_cookie(client, monkeypatch):
    """Regression for the oauth_txn cookie being set but never read.

    Without the binding, state is a bearer value: an attacker completes their own
    flow and hands the victim the callback URL, signing the victim into the
    attacker's Google account.
    """
    _stub_google(monkeypatch)
    _, query = _start(client)
    client.cookies.clear()
    response = client.get(
        "/api/v1/oauth/google/callback",
        params={"code": "auth-code", "state": query["state"][0]},
    )
    assert _error_code(response) == "invalid_state"


def test_callback_rejects_a_foreign_transaction_cookie(client, monkeypatch):
    _stub_google(monkeypatch)
    _, query = _start(client)
    client.cookies.clear()
    response = client.get(
        "/api/v1/oauth/google/callback",
        params={"code": "auth-code", "state": query["state"][0]},
        headers={"cookie": f"oauth_txn={uuid.uuid4()}"},
    )
    assert _error_code(response) == "invalid_state"


def test_provider_mismatch_is_rejected(client, db_session, monkeypatch):
    _stub_google(monkeypatch)
    txn, state, _challenge, _nonce = oauth_service.create_transaction(db_session, "github", False)
    client.cookies.clear()
    response = client.get(
        "/api/v1/oauth/google/callback", params={"code": "c", "state": state},
        headers={"cookie": f"oauth_txn={txn.txn_id}"},
    )
    assert _error_code(response) == "provider_mismatch"


def test_user_cancellation_redirects_instead_of_returning_422(client, monkeypatch):
    # Google sends ?error=access_denied with no code when the user clicks Cancel
    # or is not an approved test user.
    _stub_google(monkeypatch)
    _, query = _start(client)
    response = client.get(
        "/api/v1/oauth/google/callback",
        params={"error": "access_denied", "state": query["state"][0]},
    )
    assert response.status_code == 302
    assert _error_code(response) == "cancelled"


# ── Assertion validation ──────────────────────────────────────────────────────

def test_nonce_mismatch_creates_no_account(client, db_session, monkeypatch):
    from app.core.exceptions import InvalidCredentialsError

    _stub_google(monkeypatch, verify_error=InvalidCredentialsError("OAuth nonce mismatch"))
    _, query = _start(client)
    response = client.get(
        "/api/v1/oauth/google/callback",
        params={"code": "c", "state": query["state"][0]},
    )
    assert _error_code(response) == "exchange_failed"
    assert db_session.query(User).filter(User.email == CLAIMS["email"]).count() == 0


def test_unverified_email_creates_no_account(client, db_session, monkeypatch):
    _stub_google(monkeypatch, claims={"email_verified": False})
    _, query = _start(client)
    response = client.get(
        "/api/v1/oauth/google/callback",
        params={"code": "c", "state": query["state"][0]},
    )
    assert _error_code(response) == "exchange_failed"
    assert db_session.query(User).filter(User.email == CLAIMS["email"]).count() == 0


# ── Link challenge ────────────────────────────────────────────────────────────

def _password_user(db_session, seeded_user, password="correct-horse-battery"):
    seeded_user.hashed_password = hash_password(password)
    seeded_user.has_usable_password = True
    db_session.flush()
    return password


def test_existing_password_account_must_confirm_before_linking(client, db_session, monkeypatch, seeded_user):
    _password_user(db_session, seeded_user)
    _stub_google(monkeypatch, claims={"email": seeded_user.email})
    _, query = _start(client)
    response = client.get(
        "/api/v1/oauth/google/callback",
        params={"code": "c", "state": query["state"][0]},
    )
    # A bare email match must never mint a session: /auth/register does not
    # verify email, so anyone can pre-register someone else's address.
    location = response.headers["location"]
    assert "oauth_link=" in location
    assert "refresh_token" not in (response.headers.get("set-cookie") or "")
    challenge = db_session.query(LinkChallenge).filter(LinkChallenge.user_id == seeded_user.id).one()
    assert challenge.verify_provider is None


def test_link_challenge_locks_out_after_five_wrong_passwords(client, db_session, seeded_user):
    """Regression for the unauthenticated, uncounted password oracle."""
    password = _password_user(db_session, seeded_user)
    challenge = LinkChallenge(
        id=uuid.uuid4(), user_id=seeded_user.id, provider="google",
        provider_subject="sub-1", provider_email=seeded_user.email,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
    )
    db_session.add(challenge)
    db_session.flush()

    url = f"/api/v1/oauth/link/{challenge.id}/confirm"
    for _ in range(5):
        response = client.post(url, json={"password": "wrong"}, headers={"origin": TRUSTED_ORIGIN})
        assert response.status_code == 400, response.text

    # Clear the per-IP throttle so the next request exercises the attempt cap
    # rather than the rate limiter. The whole point of the counter is that it
    # binds regardless of how many source addresses an attacker rotates through.
    rate_limit.reset_rate_limits()
    # The correct password must now fail too — the challenge is burned.
    final = client.post(url, json={"password": password}, headers={"origin": TRUSTED_ORIGIN})
    assert final.status_code == 400
    db_session.refresh(challenge)
    assert challenge.attempts == 5
    assert challenge.consumed_at is not None


def test_link_confirm_rejects_an_untrusted_origin(client, db_session, seeded_user):
    """Regression for the startswith origin test.

    ``http://localhost:5173.evil.com`` passed a trusted ``http://localhost:5173``
    under prefix matching.
    """
    _password_user(db_session, seeded_user)
    response = client.post(
        f"/api/v1/oauth/link/{uuid.uuid4()}/confirm",
        json={"password": "x"},
        headers={"origin": "http://localhost:5173.evil.com"},
    )
    assert response.status_code == 403


def test_link_confirm_succeeds_with_the_right_password(client, db_session, seeded_user):
    password = _password_user(db_session, seeded_user)
    challenge = LinkChallenge(
        id=uuid.uuid4(), user_id=seeded_user.id, provider="google",
        provider_subject="sub-ok", provider_email=seeded_user.email,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
    )
    db_session.add(challenge)
    db_session.flush()

    response = client.post(
        f"/api/v1/oauth/link/{challenge.id}/confirm",
        json={"password": password},
        headers={"origin": TRUSTED_ORIGIN, "user-agent": UA},
    )
    assert response.status_code == 200, response.text
    identity = db_session.query(OAuthIdentity).filter(
        OAuthIdentity.user_id == seeded_user.id, OAuthIdentity.provider == "google"
    ).one()
    assert identity.linked_via == "password_confirmation"
    assert db_session.query(AuditLog).filter(
        AuditLog.user_id == seeded_user.id, AuditLog.action == "OAUTH_LINKED"
    ).count() == 1


def test_passwordless_account_is_offered_provider_reauth_not_a_password(client, db_session, monkeypatch, seeded_user):
    """A Google-created account has no password to type, so demanding one is a
    permanent dead end. It must re-authenticate the provider it already has."""
    seeded_user.has_usable_password = False
    db_session.add(OAuthIdentity(
        id=uuid.uuid4(), user_id=seeded_user.id, provider="google",
        provider_subject="google-existing", email=seeded_user.email, linked_via="oauth_login",
    ))
    db_session.flush()

    _stub_google(monkeypatch, claims={"email": seeded_user.email, "sub": "another-google-subject"})
    _, query = _start(client)
    response = client.get(
        "/api/v1/oauth/google/callback",
        params={"code": "c", "state": query["state"][0]},
    )
    location = response.headers["location"]
    assert "verify=google" in location
    challenge = db_session.query(LinkChallenge).filter(
        LinkChallenge.user_id == seeded_user.id
    ).one()
    assert challenge.verify_provider == "google"

    # And the password path is closed for it, whatever is supplied.
    confirm = client.post(
        f"/api/v1/oauth/link/{challenge.id}/confirm",
        json={"password": "anything"},
        headers={"origin": TRUSTED_ORIGIN},
    )
    assert confirm.status_code == 400
