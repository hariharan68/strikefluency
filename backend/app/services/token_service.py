"""Opaque refresh-token families with atomic rotation and reuse detection."""

import secrets
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import update
from sqlalchemy.orm import Session

from app.config import settings
from app.core.exceptions import InvalidCredentialsError, TokenInvalidError
from app.core.security import hash_refresh_token
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.models.security_notification import SecurityNotification
from app.services.email_service import send_security_email


def create_refresh_token_record(
    db: Session,
    user: User,
    device_info: str | None = None,
    remember_me: bool = True,
    family_id=None,
    parent_id=None,
) -> tuple[RefreshToken, str]:
    raw_token = secrets.token_urlsafe(48)
    now = datetime.now(timezone.utc)
    policy = "persistent" if remember_me else "ephemeral"
    expires_at = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    if not remember_me:
        expires_at = min(expires_at, now + timedelta(hours=settings.EPHEMERAL_ABSOLUTE_CAP_HOURS))
    record = RefreshToken(
        user_id=user.id,
        tenant_id=user.tenant_id,
        token_hash=hash_refresh_token(raw_token),
        family_id=family_id or uuid.uuid4(),
        parent_id=parent_id,
        session_policy=policy,
        expires_at=expires_at,
        last_used_at=now,
        is_revoked=False,
        device_info=device_info,
    )
    db.add(record)
    db.flush()
    return record, raw_token


def get_refresh_record(db: Session, raw_token: str) -> RefreshToken | None:
    return db.query(RefreshToken).filter(
        RefreshToken.token_hash == hash_refresh_token(raw_token)
    ).first()


def revoke_family(db: Session, family_id, reason: str) -> None:
    now = datetime.now(timezone.utc)
    db.query(RefreshToken).filter(
        RefreshToken.family_id == family_id,
        RefreshToken.is_revoked == False,
    ).update({"is_revoked": True, "revoked_at": now, "revoke_reason": reason}, synchronize_session=False)


def rotate_refresh_token(db: Session, raw_token: str, device_info: str | None = None) -> tuple[User, RefreshToken, str]:
    token_hash = hash_refresh_token(raw_token)
    now = datetime.now(timezone.utc)
    claim = db.execute(
        update(RefreshToken)
        .where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.is_revoked == False,
            RefreshToken.replaced_at.is_(None),
            RefreshToken.expires_at > now,
        )
        .values(replaced_at=now, last_used_at=now)
        .returning(RefreshToken.id)
    )
    claimed_id = claim.scalar_one_or_none()
    claimed = db.get(RefreshToken, claimed_id) if claimed_id else None

    if claimed is None:
        prior = get_refresh_record(db, raw_token)
        if prior and prior.replaced_at is not None and not prior.is_revoked:
            # A recently rotated token can be a legitimate browser race; the
            # caller still receives 401, but we avoid destroying the family.
            replaced_at = prior.replaced_at
            if replaced_at.tzinfo is None:
                replaced_at = replaced_at.replace(tzinfo=timezone.utc)
            if now - replaced_at > timedelta(seconds=10):
                revoke_family(db, prior.family_id, "reuse_detected")
                user = db.query(User).filter(User.id == prior.user_id).first()
                if user:
                    db.add(SecurityNotification(user_id=user.id, event_type="refresh_token_reuse", message="A previously used session token was presented. All sessions in that session family were revoked."))
                    db.flush()
                    send_security_email(user.email, "StrikeFluency security alert", "A previously used refresh token was detected. The affected session family has been revoked.")
        db.commit()
        raise InvalidCredentialsError("Invalid or expired refresh token")

    if claimed.session_policy == "ephemeral":
        # Each token is minted at the previous refresh, so its created_at IS
        # the last-activity timestamp. (last_used_at was just overwritten by
        # the claim UPDATE above and would always read ~now.) The 12h absolute
        # cap needs no check here: expires_at is capped at creation, inherited
        # across rotations, and enforced by the claim's WHERE clause.
        created = claimed.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        if now - created > timedelta(minutes=settings.EPHEMERAL_IDLE_TIMEOUT_MINUTES):
            revoke_family(db, claimed.family_id, "idle_timeout")
            db.commit()
            raise InvalidCredentialsError("Session expired")

    user = db.query(User).filter(User.id == claimed.user_id, User.is_active == True).first()
    if not user:
        raise InvalidCredentialsError("Invalid or expired refresh token")
    successor, new_raw = create_refresh_token_record(
        db, user, device_info or claimed.device_info,
        remember_me=claimed.session_policy == "persistent",
        family_id=claimed.family_id,
        parent_id=claimed.id,
    )
    successor.expires_at = claimed.expires_at
    db.commit()
    return user, successor, new_raw


def revoke_refresh_token(db: Session, raw_token: str) -> None:
    record = get_refresh_record(db, raw_token)
    if record:
        revoke_family(db, record.family_id, "logout")


def revoke_all_user_tokens(db: Session, user_id) -> None:
    db.query(RefreshToken).filter(
        RefreshToken.user_id == user_id,
        RefreshToken.is_revoked == False,
    ).update({"is_revoked": True, "revoked_at": datetime.now(timezone.utc), "revoke_reason": "logout_all"}, synchronize_session=False)


def cleanup_refresh_tokens(db: Session, retention_days: int = 30) -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    return db.query(RefreshToken).filter(
        ((RefreshToken.revoked_at.is_not(None)) & (RefreshToken.revoked_at < cutoff)) |
        (RefreshToken.expires_at < cutoff)
    ).delete(synchronize_session=False)
