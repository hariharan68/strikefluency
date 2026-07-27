import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import (
    String, BigInteger, Identity, ForeignKey, CheckConstraint, Index,
    UniqueConstraint, text, func,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.database import Base
from app.models.append_only import attach_append_only_guard


class AuditLog(Base):
    """
    Append-only record of security- and trading-sensitive actions.

    Distinct from `security_notifications`, which exists to tell a *user* that
    something happened to their account and is written for only three events.
    This is the operator-facing trail: who did what, when, from where, and
    whether it succeeded.

    The one thing that cannot be retro-fitted is history, which is why this
    table is worth having before there is anyone to read it.

    `user_id` is nullable on purpose: a failed login against an unknown email
    is exactly the event most worth recording, and it has no user to attach to.
    `tenant_id` is nullable for the same reason.
    """

    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Total order; created_at ties for rows written in the same transaction.
    seq: Mapped[int] = mapped_column(BigInteger, Identity(always=True), nullable=False)

    tenant_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=True)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    action: Mapped[str] = mapped_column(String(50), nullable=False)
    outcome: Mapped[str] = mapped_column(String(10), nullable=False)

    # What the action was performed on. Polymorphic and without an FK for the
    # same reason as the ledger: an audit row must outlive the thing it
    # describes.
    reference_type: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    reference_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)

    # Free-form context. JSONB so new fields never need a migration, which
    # matters for a table nobody wants to keep altering.
    detail: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))

    # Best-effort request provenance; absent for scheduler-driven actions.
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)  # fits IPv6
    user_agent: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)

    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)

    __table_args__ = (
        CheckConstraint("outcome IN ('SUCCESS', 'FAILURE')", name="ck_audit_logs_outcome"),
        UniqueConstraint("seq", name="uq_audit_logs_seq"),
        Index("idx_audit_logs_user_created", "user_id", "created_at"),
        Index("idx_audit_logs_action_created", "action", "created_at"),
        Index("idx_audit_logs_tenant_id", "tenant_id"),
        Index("idx_audit_logs_reference", "reference_type", "reference_id"),
    )


attach_append_only_guard(AuditLog)
