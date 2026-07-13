"""Add session policies, refresh-token families, and token-version revocation."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260711_auth_hardening"
down_revision = "20260709_1200"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("token_version", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("refresh_tokens", sa.Column("family_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("refresh_tokens", sa.Column("parent_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("refresh_tokens", sa.Column("session_policy", sa.String(length=20), nullable=False, server_default="persistent"))
    op.add_column("refresh_tokens", sa.Column("replaced_at", sa.DateTime(), nullable=True))
    op.add_column("refresh_tokens", sa.Column("revoked_at", sa.DateTime(), nullable=True))
    op.add_column("refresh_tokens", sa.Column("last_used_at", sa.DateTime(), nullable=True))
    op.add_column("refresh_tokens", sa.Column("revoke_reason", sa.String(length=40), nullable=True))
    op.execute("UPDATE refresh_tokens SET family_id = id, last_used_at = created_at WHERE family_id IS NULL")
    op.alter_column("refresh_tokens", "family_id", nullable=False)
    op.alter_column("refresh_tokens", "last_used_at", nullable=False)
    op.create_foreign_key("fk_refresh_tokens_parent", "refresh_tokens", "refresh_tokens", ["parent_id"], ["id"])
    op.create_index("ix_refresh_tokens_family_id", "refresh_tokens", ["family_id"])
    op.create_index("ux_users_tenant_email_lower", "users", ["tenant_id", sa.text("lower(email)")], unique=True)


def downgrade() -> None:
    op.drop_index("ux_users_tenant_email_lower", table_name="users")
    op.drop_index("ix_refresh_tokens_family_id", table_name="refresh_tokens")
    op.drop_constraint("fk_refresh_tokens_parent", "refresh_tokens", type_="foreignkey")
    for name in ("revoke_reason", "last_used_at", "revoked_at", "replaced_at", "session_policy", "parent_id", "family_id"):
        op.drop_column("refresh_tokens", name)
    op.drop_column("users", "token_version")
