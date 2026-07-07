"""
app/services/token_service.py
──────────────────────────────
Refresh token database operations.

Why store refresh tokens in DB?
  JWTs are stateless — once issued, they're valid until expiry.
  If a user logs out or their device is stolen, we need to
  invalidate the token. We do this by storing a hash of each
  refresh token in the DB and marking it revoked on logout.

  Access tokens are NOT stored — they're short-lived (24h).
  Only refresh tokens (7d) need DB tracking.
"""

from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session

from app.config import settings
from app.core.security import hash_refresh_token
from app.core.exceptions import TokenRevokedError, TokenInvalidError
from app.models.refresh_token import RefreshToken
from app.models.user import User


def create_refresh_token_record(
    db: Session,
    user: User,
    raw_token: str,
    device_info: str = None,
) -> RefreshToken:
    """
    Hash the raw refresh token and save it to the DB.
    Called immediately after create_refresh_token() in security.py.

    Args:
        db          : database session
        user        : the User object
        raw_token   : the raw JWT string (we store only its hash)
        device_info : optional browser/device tag for the user's session list
    """
    expires_at = datetime.now(timezone.utc) + timedelta(
        days=settings.REFRESH_TOKEN_EXPIRE_DAYS
    )

    record = RefreshToken(
        user_id=user.id,
        tenant_id=user.tenant_id,
        token_hash=hash_refresh_token(raw_token),
        expires_at=expires_at,
        is_revoked=False,
        device_info=device_info,
    )
    db.add(record)
    return record


def verify_refresh_token_record(db: Session, raw_token: str) -> RefreshToken:
    """
    Look up the refresh token record in the DB and validate it.

    Checks:
      1. Record exists (token was issued by us)
      2. Not revoked (user hasn't logged out)
      3. Not expired (beyond 7-day window)

    Raises:
      TokenInvalidError  : token not found in DB
      TokenRevokedError  : token was revoked (user logged out)
      TokenInvalidError  : token has expired in DB
    """
    token_hash = hash_refresh_token(raw_token)

    record = db.query(RefreshToken).filter(
        RefreshToken.token_hash == token_hash
    ).first()

    if not record:
        raise TokenInvalidError("Refresh token not recognised")

    if record.is_revoked:
        raise TokenRevokedError("Refresh token has been revoked")

    now = datetime.now(timezone.utc)

    # Make expires_at timezone-aware if it isn't
    expires_at = record.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if now > expires_at:
        raise TokenInvalidError("Refresh token has expired")

    return record


def revoke_refresh_token(db: Session, raw_token: str) -> None:
    """
    Mark a single refresh token as revoked.
    Called on POST /auth/logout.
    """
    token_hash = hash_refresh_token(raw_token)
    record = db.query(RefreshToken).filter(
        RefreshToken.token_hash == token_hash
    ).first()
    if record:
        record.is_revoked = True


def revoke_all_user_tokens(db: Session, user_id) -> None:
    """
    Revoke ALL active refresh tokens for a user.
    Used for "logout all devices" or security reset.
    """
    db.query(RefreshToken).filter(
        RefreshToken.user_id == user_id,
        RefreshToken.is_revoked == False,
    ).update({"is_revoked": True})