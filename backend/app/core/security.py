"""
app/core/security.py
─────────────────────
All cryptographic operations live here. Nothing else touches
JWT or bcrypt directly — they always call these functions.

Four responsibilities:
  1. Hash passwords          → hash_password()
  2. Verify passwords        → verify_password()
  3. Create JWT tokens       → create_access_token(), create_refresh_token()
  4. Decode + verify tokens  → verify_token()
"""

import hashlib
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import settings

# ── bcrypt context ─────────────────────────────────────────────────────────────
# schemes=["bcrypt"] means only bcrypt is used (no legacy fallback)
# deprecated="auto" means old hash formats auto-upgrade on next login
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ─────────────────────────────────────────────────────────────────────────────
# PASSWORD FUNCTIONS
# ─────────────────────────────────────────────────────────────────────────────

def hash_password(plain_password: str) -> str:
    """
    Hash a plain-text password using bcrypt.
    The result is a 60-char string starting with $2b$
    Store this in the DB — never the plain password.

    Example:
        hashed = hash_password("mySecret123")
        # "$2b$12$eImiTXuWVxfM37uY4JANjQ..."
    """
    return pwd_context.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Compare a plain-text password against a stored bcrypt hash.
    Returns True if they match, False otherwise.
    Safe against timing attacks — bcrypt comparison is constant-time.

    Example:
        ok = verify_password("mySecret123", stored_hash)
        # True or False
    """
    return pwd_context.verify(plain_password, hashed_password)


# ─────────────────────────────────────────────────────────────────────────────
# JWT FUNCTIONS
# ─────────────────────────────────────────────────────────────────────────────

def create_access_token(
    user_id: str,
    tenant_id: str,
    role: str,
    expires_delta: Optional[timedelta] = None,
    session_id: Optional[str] = None,
    token_version: int = 0,
) -> str:
    """
    Create a short-lived JWT access token.

    Payload (claims):
        sub      → user_id (the "subject" of the token)
        tenant   → tenant_id (for multi-tenant scoping)
        role     → trader | tenant_admin | super_admin
        type     → "access" (distinguishes from refresh token)
        exp      → expiry timestamp (auto-checked by jose on decode)
        iat      → issued-at timestamp

    The token is signed with SECRET_KEY using ALGORITHM (HS256).
    Anyone with the secret key can verify it — keep it secret.

    Example:
        token = create_access_token(
            user_id=str(user.id),
            tenant_id=str(user.tenant_id),
            role=user.role,
        )
    """
    if expires_delta is None:
        expires_delta = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    now = datetime.now(timezone.utc)
    expire = now + expires_delta

    payload = {
        "sub": str(user_id),
        "tenant": str(tenant_id),
        "role": role,
        "type": "access",
        "iat": now,
        "exp": expire,
        "sid": session_id,
        "tv": token_version,
        "jti": uuid.uuid4().hex,
    }

    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(
    user_id: str,
    tenant_id: str,
) -> str:
    """
    Create a long-lived JWT refresh token.

    Refresh tokens:
      - Live much longer than access tokens (7 days default)
      - Contain LESS info (no role — only user_id + tenant_id)
      - Are stored (hashed) in the DB so they can be revoked
      - Are only accepted at POST /auth/refresh — nowhere else

    The "type": "refresh" claim prevents a refresh token from being
    used as an access token (verified in verify_token).
    """
    now = datetime.now(timezone.utc)
    expire = now + timedelta(
        days=settings.REFRESH_TOKEN_EXPIRE_DAYS
    )

    payload = {
        "sub": str(user_id),
        "tenant": str(tenant_id),
        "type": "refresh",
        "iat": now,
        "jti": uuid.uuid4().hex,
        "exp": expire,
    }

    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def verify_token(token: str, expected_type: str = "access") -> dict:
    """
    Decode and verify a JWT token. Returns the payload dict.
    Raises JWTError if the token is invalid, expired, or wrong type.

    Args:
        token         : the raw JWT string
        expected_type : "access" or "refresh"

    Returns dict with keys: sub, tenant, role (access only), type, exp, iat

    Raises:
        JWTError : if signature invalid, token expired, or type mismatch

    Example:
        payload = verify_token(token, expected_type="access")
        user_id = payload["sub"]
        tenant_id = payload["tenant"]
    """
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )

        # Make sure we got the right kind of token
        # Prevents a refresh token being submitted as an access token
        token_type = payload.get("type")
        if token_type != expected_type:
            raise JWTError(
                f"Token type mismatch: expected '{expected_type}', got '{token_type}'"
            )

        # sub (user_id) must always be present
        if payload.get("sub") is None:
            raise JWTError("Token missing 'sub' claim")

        return payload

    except JWTError:
        raise  # re-raise — caller handles the HTTP response


# ─────────────────────────────────────────────────────────────────────────────
# REFRESH TOKEN HASHING
# ─────────────────────────────────────────────────────────────────────────────

def hash_refresh_token(raw_token: str) -> str:
    """
    SHA-256 hash of the raw refresh token for DB storage.

    Why not bcrypt for refresh tokens?
      bcrypt is intentionally slow (good for passwords — attackers
      have to brute-force common passwords).
      Refresh tokens are long random strings — not brute-forceable.
      SHA-256 is fast and sufficient here.

    Example:
        token_hash = hash_refresh_token(raw_jwt_string)
        # Store token_hash in refresh_tokens table
        # When validating: hash the incoming token and compare to DB
    """
    return hashlib.sha256(raw_token.encode()).hexdigest()
