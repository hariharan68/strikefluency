"""broker connections table

Revision ID: 20260709_1200
Revises: 7f6ed0e8d2c9
Create Date: 2026-07-09 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "20260709_1200"
down_revision: Union[str, None] = "7f6ed0e8d2c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "broker_connections",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column("broker", sa.String(length=50), nullable=False),
        sa.Column("access_token_enc", sa.String(), nullable=True),
        sa.Column("refresh_token_enc", sa.String(), nullable=True),
        sa.Column("meta", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("connected_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_broker_connections_user_broker", "broker_connections", ["user_id", "broker"], unique=False)
    op.create_index("idx_broker_connections_status", "broker_connections", ["status"], unique=False)
    op.create_index("ix_broker_connections_broker", "broker_connections", ["broker"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_broker_connections_broker", table_name="broker_connections")
    op.drop_index("idx_broker_connections_status", table_name="broker_connections")
    op.drop_index("idx_broker_connections_user_broker", table_name="broker_connections")
    op.drop_table("broker_connections")
