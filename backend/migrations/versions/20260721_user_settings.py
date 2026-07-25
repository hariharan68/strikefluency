"""per-user settings (trading preferences + notification toggles)

Revision ID: 20260721_user_settings
Revises: 20260720_discipline_mode
Create Date: 2026-07-21 00:00:00.000000

Adds a `user_settings` table holding one JSONB blob per user. The app merges the
blob over typed defaults, so new preferences never require another migration.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "20260721_user_settings"
down_revision: Union[str, None] = "20260720_discipline_mode"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_settings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("data", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", name="uq_user_settings_user_id"),
    )
    op.create_index("idx_user_settings_tenant_id", "user_settings", ["tenant_id"])


def downgrade() -> None:
    op.drop_index("idx_user_settings_tenant_id", table_name="user_settings")
    op.drop_table("user_settings")
