"""strategy builder saved workspaces

Revision ID: 20260724_strategy_workspace
Revises: 20260724_order_idempotency
Create Date: 2026-07-24 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260724_strategy_workspace"
down_revision: Union[str, None] = "20260724_order_idempotency"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "strategy_builder_configurations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("kind", sa.String(length=12), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=True),
        sa.Column("underlying", sa.String(length=20), nullable=False),
        sa.Column("schema_version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("state", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "kind IN ('SAVED','DRAFT')",
            name="ck_strategy_builder_configurations_kind",
        ),
        sa.CheckConstraint(
            "underlying IN ('NIFTY','BANKNIFTY','SENSEX')",
            name="ck_strategy_builder_configurations_underlying",
        ),
    )
    op.create_index(
        "idx_strategy_builder_configs_user_kind_updated",
        "strategy_builder_configurations",
        ["user_id", "kind", "updated_at"],
    )
    op.create_index(
        "idx_strategy_builder_configs_tenant",
        "strategy_builder_configurations",
        ["tenant_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "idx_strategy_builder_configs_tenant",
        table_name="strategy_builder_configurations",
    )
    op.drop_index(
        "idx_strategy_builder_configs_user_kind_updated",
        table_name="strategy_builder_configurations",
    )
    op.drop_table("strategy_builder_configurations")
