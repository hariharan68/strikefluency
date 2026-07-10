from __future__ import annotations

import base64
import hashlib
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.core import token_store
from app.database import SessionLocal
from app.models.broker_connection import BrokerConnection

logger = logging.getLogger(__name__)

BROKER_FYERS = "fyers"
STATUS_ACTIVE = "ACTIVE"
STATUS_REVOKED = "REVOKED"


def _fernet() -> Fernet:
    configured = (settings.BROKER_TOKEN_ENC_KEY or "").strip()
    if configured:
        key = configured.encode("utf-8")
    else:
        digest = hashlib.sha256(settings.SECRET_KEY.encode("utf-8")).digest()
        key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


def encrypt_token(token: str | None) -> str | None:
    if not token:
        return None
    return _fernet().encrypt(token.encode("utf-8")).decode("utf-8")


def decrypt_token(token_enc: str | None) -> str | None:
    if not token_enc:
        return None
    try:
        return _fernet().decrypt(token_enc.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        logger.warning("Broker token decryption failed")
        return None


def _active_connection_query(broker: str, user_id: uuid.UUID | None):
    stmt = select(BrokerConnection).where(
        BrokerConnection.broker == broker,
        BrokerConnection.status == STATUS_ACTIVE,
    )
    if user_id is None:
        return stmt.where(BrokerConnection.user_id.is_(None))
    return stmt.where(BrokerConnection.user_id == user_id)


def save_broker_token(
    db: Session,
    *,
    broker: str,
    access_token: str,
    refresh_token: str | None = None,
    user_id: uuid.UUID | None = None,
    meta: dict[str, Any] | None = None,
) -> BrokerConnection:
    existing = db.execute(_active_connection_query(broker, user_id)).scalars().first()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    payload_meta = dict(meta or {})
    payload_meta.setdefault("stored_at", datetime.now(timezone.utc).isoformat())

    if existing is None:
        existing = BrokerConnection(
            user_id=user_id,
            broker=broker,
            status=STATUS_ACTIVE,
            connected_at=now,
        )
        db.add(existing)

    existing.access_token_enc = encrypt_token(access_token)
    existing.refresh_token_enc = encrypt_token(refresh_token)
    existing.meta = payload_meta
    existing.status = STATUS_ACTIVE
    existing.connected_at = existing.connected_at or now
    existing.revoked_at = None
    db.commit()
    db.refresh(existing)
    return existing


def get_broker_token(
    db: Session,
    *,
    broker: str,
    user_id: uuid.UUID | None = None,
) -> str | None:
    connection = db.execute(_active_connection_query(broker, user_id)).scalars().first()
    if connection is None:
        return None
    return decrypt_token(connection.access_token_enc)


def revoke_broker_token(
    db: Session,
    *,
    broker: str,
    user_id: uuid.UUID | None = None,
) -> bool:
    connection = db.execute(_active_connection_query(broker, user_id)).scalars().first()
    if connection is None:
        return False
    connection.status = STATUS_REVOKED
    connection.revoked_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()
    return True


def load_fyers_token_into_store() -> bool:
    try:
        db = SessionLocal()
    except Exception as exc:
        logger.warning("Unable to open DB session for Fyers token hydration: %s", exc)
        return False

    try:
        token = get_broker_token(db, broker=BROKER_FYERS, user_id=None)
        if token:
            token_store.set_in_memory(token, source="broker_connections")
            logger.info("Loaded Fyers token from broker_connections")
            return True
        if token_store.get_access_token():
            return True
        return False
    except Exception as exc:
        logger.warning("Unable to hydrate Fyers token from broker_connections: %s", exc)
        return False
    finally:
        db.close()


def save_fyers_token_best_effort(access_token: str, meta: dict[str, Any] | None = None) -> bool:
    db = SessionLocal()
    try:
        save_broker_token(
            db,
            broker=BROKER_FYERS,
            access_token=access_token,
            user_id=None,
            meta=meta,
        )
        return True
    except Exception as exc:
        db.rollback()
        logger.warning("Unable to persist Fyers token: %s", exc)
        return False
    finally:
        db.close()


def revoke_fyers_token_best_effort() -> bool:
    db = SessionLocal()
    try:
        return revoke_broker_token(db, broker=BROKER_FYERS, user_id=None)
    except Exception as exc:
        db.rollback()
        logger.warning("Unable to revoke Fyers token: %s", exc)
        return False
    finally:
        db.close()
