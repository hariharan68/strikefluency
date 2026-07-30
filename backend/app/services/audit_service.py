"""
app/services/audit_service.py
─────────────────────────────
Writes the append-only audit trail.

Two write modes, and the choice between them is the whole design:

  record(db, ...)   joins the caller's transaction. Correct for successful
                    state changes — if the transaction rolls back, the action
                    did not happen, and an audit row claiming it did would be
                    a lie.

  record_now(...)   opens its own short-lived session and commits immediately.
                    Required for events that must survive a rollback: a failed
                    login raises before the router ever commits, and a rejected
                    order rolls the transaction back — yet those are precisely
                    the events most worth having.

Both are fire-and-forget and never raise. An audit failure must never fail a
trade or block a login; the same reasoning as _create_journal_entry's
swallowing try/except in virtual_order_service.
"""

import logging
import uuid
from typing import Optional

from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)


def client_ip(request) -> Optional[str]:
    """
    Best-effort client address. Behind NGINX/Cloudflare the socket peer is the
    proxy, so X-Forwarded-For wins when present. Only trustworthy to the extent
    the proxy is — good enough for an audit hint, not for authorisation.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:45]
    return request.client.host if request.client else None


class AuditAction:
    """Actions worth recording. Mirrors the architecture doc, section 37."""
    # Auth
    LOGIN = "LOGIN"
    LOGIN_FAILED = "LOGIN_FAILED"
    LOGOUT = "LOGOUT"
    LOGOUT_ALL = "LOGOUT_ALL"
    REGISTER = "REGISTER"
    REFRESH_REUSE_DETECTED = "REFRESH_REUSE_DETECTED"
    SESSION_REVOKED = "SESSION_REVOKED"
    OAUTH_LINKED = "OAUTH_LINKED"
    # Trading
    ORDER_PLACED = "ORDER_PLACED"
    ORDER_REJECTED = "ORDER_REJECTED"
    ORDER_PROTECTION_UPDATED = "ORDER_PROTECTION_UPDATED"
    ORDER_CLOSED = "ORDER_CLOSED"
    LIMIT_PLACED = "LIMIT_PLACED"
    LIMIT_CANCELLED = "LIMIT_CANCELLED"
    # Account
    DISCIPLINE_MODE_CHANGED = "DISCIPLINE_MODE_CHANGED"
    FUNDS_ADJUSTED = "FUNDS_ADJUSTED"


class AuditOutcome:
    SUCCESS = "SUCCESS"
    FAILURE = "FAILURE"


class AuditRef:
    VIRTUAL_ORDER = "VIRTUAL_ORDER"
    PENDING_ORDER = "PENDING_ORDER"
    STRATEGY = "STRATEGY"
    ACCOUNT = "ACCOUNT"
    USER = "USER"
    SESSION = "SESSION"


def _build(
    *,
    action: str,
    outcome: str,
    user_id: Optional[uuid.UUID],
    tenant_id: Optional[uuid.UUID],
    reference_type: Optional[str],
    reference_id: Optional[uuid.UUID],
    detail: Optional[dict],
    ip_address: Optional[str],
    user_agent: Optional[str],
) -> AuditLog:
    return AuditLog(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        user_id=user_id,
        action=action,
        outcome=outcome,
        reference_type=reference_type,
        reference_id=reference_id,
        detail=detail or {},
        ip_address=(ip_address or None),
        # Truncated rather than rejected: an oversized UA header must not be
        # able to suppress an audit row.
        user_agent=(user_agent or None) and str(user_agent)[:300],
    )


def record(
    db: Session,
    *,
    action: str,
    outcome: str = AuditOutcome.SUCCESS,
    user_id: Optional[uuid.UUID] = None,
    tenant_id: Optional[uuid.UUID] = None,
    reference_type: Optional[str] = None,
    reference_id: Optional[uuid.UUID] = None,
    detail: Optional[dict] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> None:
    """
    Append an audit row inside the caller's transaction. Never commits, never
    raises. Rolls back with the caller — which is the intended semantics for
    an action that did not complete.
    """
    try:
        db.add(_build(
            action=action, outcome=outcome, user_id=user_id, tenant_id=tenant_id,
            reference_type=reference_type, reference_id=reference_id,
            detail=detail, ip_address=ip_address, user_agent=user_agent,
        ))
    except Exception:  # noqa: BLE001 — auditing must never break the caller
        logger.exception("audit_service.record failed for action=%s", action)


def record_now(
    *,
    action: str,
    outcome: str = AuditOutcome.FAILURE,
    user_id: Optional[uuid.UUID] = None,
    tenant_id: Optional[uuid.UUID] = None,
    reference_type: Optional[str] = None,
    reference_id: Optional[uuid.UUID] = None,
    detail: Optional[dict] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> None:
    """
    Append an audit row in its own transaction, committed immediately.

    Use for events whose surrounding transaction is about to roll back or has
    already failed — failed logins, rejected orders. Never raises.
    """
    from app.database import SessionLocal

    db = None
    try:
        db = SessionLocal()
        db.add(_build(
            action=action, outcome=outcome, user_id=user_id, tenant_id=tenant_id,
            reference_type=reference_type, reference_id=reference_id,
            detail=detail, ip_address=ip_address, user_agent=user_agent,
        ))
        db.commit()
    except Exception:  # noqa: BLE001
        logger.exception("audit_service.record_now failed for action=%s", action)
        if db is not None:
            try:
                db.rollback()
            except Exception:  # noqa: BLE001
                pass
    finally:
        if db is not None:
            db.close()
