"""Append-only audit trail for security- and trading-sensitive actions

Revision ID: 20260730_audit_logs
Revises: 20260729_virtual_fund_ledger
Create Date: 2026-07-30 00:00:00.000000

Nothing is backfilled: history is exactly the thing an audit log cannot be
given retrospectively, which is the argument for creating the table before
there is anyone to read it.

user_id and tenant_id are nullable because a failed login against an unknown
email is among the most valuable rows here and has no user to attach to.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260730_audit_logs"
down_revision: Union[str, None] = "20260729_virtual_fund_ledger"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("seq", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("tenants.id"), nullable=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id"), nullable=True),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("outcome", sa.String(10), nullable=False),
        sa.Column("reference_type", sa.String(30), nullable=True),
        sa.Column("reference_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("detail", postgresql.JSONB, nullable=False,
                  server_default=sa.text("'{}'::jsonb")),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.String(300), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("outcome IN ('SUCCESS', 'FAILURE')", name="ck_audit_logs_outcome"),
        sa.UniqueConstraint("seq", name="uq_audit_logs_seq"),
    )
    op.create_index("idx_audit_logs_user_created", "audit_logs", ["user_id", "created_at"])
    op.create_index("idx_audit_logs_action_created", "audit_logs", ["action", "created_at"])
    op.create_index("idx_audit_logs_tenant_id", "audit_logs", ["tenant_id"])
    op.create_index("idx_audit_logs_reference", "audit_logs",
                    ["reference_type", "reference_id"])

    # Same append-only posture as virtual_fund_ledger: UPDATE blocked, DELETE
    # allowed (teardown and account deletion need it, and a delete fails loudly
    # as a gap in seq whereas an update corrupts silently).
    op.execute("""
        CREATE OR REPLACE FUNCTION audit_logs_forbid_update() RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'audit_logs is append-only (attempted UPDATE on row %)', OLD.id;
        END;
        $$ LANGUAGE plpgsql
    """)
    op.execute("""
        CREATE TRIGGER trg_audit_logs_forbid_update
            BEFORE UPDATE ON audit_logs
            FOR EACH ROW EXECUTE FUNCTION audit_logs_forbid_update()
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_audit_logs_forbid_update ON audit_logs")
    op.execute("DROP FUNCTION IF EXISTS audit_logs_forbid_update()")
    op.drop_index("idx_audit_logs_reference", table_name="audit_logs")
    op.drop_index("idx_audit_logs_tenant_id", table_name="audit_logs")
    op.drop_index("idx_audit_logs_action_created", table_name="audit_logs")
    op.drop_index("idx_audit_logs_user_created", table_name="audit_logs")
    op.drop_table("audit_logs")
