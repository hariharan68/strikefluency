"""Unit tests for Google id_token validation — no DB, no network.

These are the checks that make the app a relying party rather than a token
bearer: Google signed it, it is addressed to *our* client, and it answers the
nonce from this browser's /start.
"""

import base64
import hashlib
import time

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from jose import jwt
from jose.exceptions import JOSEError

from app.core.exceptions import InvalidCredentialsError
from app.services import oauth_service

CLIENT_ID = "test-client.apps.googleusercontent.com"
NONCE = "the-nonce-from-start"
ACCESS_TOKEN = "access-token-value"
KID = "test-key-1"


def _b64(value: int) -> str:
    raw = value.to_bytes((value.bit_length() + 7) // 8, "big")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


@pytest.fixture(scope="module")
def keypair():
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    numbers = private.public_key().public_numbers()
    public_jwk = {
        "kty": "RSA", "alg": "RS256", "use": "sig", "kid": KID,
        "n": _b64(numbers.n), "e": _b64(numbers.e),
    }
    private_pem = private.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    return private_pem, public_jwk


@pytest.fixture(autouse=True)
def _wire(monkeypatch, keypair):
    _private_pem, public_jwk = keypair
    monkeypatch.setattr(oauth_service.settings, "GOOGLE_CLIENT_ID", CLIENT_ID)
    monkeypatch.setattr(oauth_service, "_google_jwks", lambda force=False: {"keys": [public_jwk]})


def _at_hash(access_token: str) -> str:
    digest = hashlib.sha256(access_token.encode()).digest()
    return base64.urlsafe_b64encode(digest[: len(digest) // 2]).rstrip(b"=").decode()


def _claims(**overrides) -> dict:
    now = int(time.time())
    claims = {
        "iss": "https://accounts.google.com",
        "aud": CLIENT_ID,
        "sub": "1234567890",
        "email": "trader@example.com",
        "email_verified": True,
        "name": "Trader",
        "nonce": NONCE,
        "iat": now - 10,
        "exp": now + 600,
        "at_hash": _at_hash(ACCESS_TOKEN),
    }
    claims.update(overrides)
    return claims


def _mint(keypair, *, algorithm="RS256", key=None, headers=None, **overrides) -> str:
    private_pem, _public_jwk = keypair
    return jwt.encode(
        _claims(**overrides), key or private_pem, algorithm=algorithm,
        headers=headers or {"kid": KID},
    )


def test_valid_token_is_accepted(keypair):
    claims = oauth_service._verify_google_id_token(_mint(keypair), ACCESS_TOKEN, NONCE)
    assert claims["sub"] == "1234567890"
    assert claims["email"] == "trader@example.com"


def test_rejects_wrong_audience(keypair):
    # An id_token minted for a different OAuth client must not authenticate here.
    with pytest.raises(JOSEError):
        oauth_service._verify_google_id_token(
            _mint(keypair, aud="someone-elses-client.apps.googleusercontent.com"), ACCESS_TOKEN, NONCE
        )


def test_rejects_wrong_issuer(keypair):
    with pytest.raises(JOSEError):
        oauth_service._verify_google_id_token(
            _mint(keypair, iss="https://accounts.evil.example"), ACCESS_TOKEN, NONCE
        )


def test_rejects_expired_token(keypair):
    now = int(time.time())
    with pytest.raises(JOSEError):
        oauth_service._verify_google_id_token(
            _mint(keypair, iat=now - 4000, exp=now - 3600), ACCESS_TOKEN, NONCE
        )


def test_rejects_mismatched_nonce(keypair):
    with pytest.raises(InvalidCredentialsError):
        oauth_service._verify_google_id_token(_mint(keypair, nonce="a-different-nonce"), ACCESS_TOKEN, NONCE)


def test_rejects_missing_transaction_nonce(keypair):
    # A transaction predating the nonce column has nonce=None. That must fail
    # closed rather than waive the check.
    for absent in (None, ""):
        with pytest.raises(InvalidCredentialsError):
            oauth_service._verify_google_id_token(_mint(keypair), ACCESS_TOKEN, absent)


def test_rejects_unknown_signing_key(keypair):
    with pytest.raises(InvalidCredentialsError):
        oauth_service._verify_google_id_token(
            _mint(keypair, headers={"kid": "not-a-google-key"}), ACCESS_TOKEN, NONCE
        )


def test_rejects_mismatched_at_hash(keypair):
    # at_hash binds the assertion to the access token we were actually handed.
    with pytest.raises(JOSEError):
        oauth_service._verify_google_id_token(_mint(keypair), "a-different-access-token", NONCE)


def test_rejects_algorithm_confusion(keypair):
    """HS256 signed with the RSA public key as the shared secret.

    This is exactly what pinning algorithms=["RS256"] exists to stop; reading
    `alg` from the header instead would accept it.
    """
    _private_pem, public_jwk = keypair
    forged = jwt.encode(_claims(), public_jwk["n"], algorithm="HS256", headers={"kid": KID})
    with pytest.raises(JOSEError):
        oauth_service._verify_google_id_token(forged, ACCESS_TOKEN, NONCE)
