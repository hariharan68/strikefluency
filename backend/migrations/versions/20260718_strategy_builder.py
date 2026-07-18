"""strategy builder tables

Revision ID: 20260718_strategy_builder
Revises: 20260713_global_unique_email
Create Date: 2026-07-18 00:00:00.000000

Adds the multi-leg Strategy Builder tables (strategies, strategy_legs,
strategy_positions) that VirtualOrder/VirtualPosition could not represent, and
extends virtual_orders so executed strategy legs can be mirrored into it:
  - new nullable strategy_id FK (groups mirrored legs under their strategy)
  - sl_price relaxed to nullable (a mirrored leg has no per-leg stop)
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "20260718_strategy_builder"
down_revision: Union[str, None] = "20260713_global_unique_email"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── strategies ────────────────────────────────────────────
    op.create_table(
        "strategies",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("underlying", sa.String(length=20), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=True),
        sa.Column("template_id", sa.String(length=50), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="DRAFT"),
        sa.Column("allow_calendar", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("setup_tag", sa.String(length=30), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("net_premium", sa.Numeric(12, 2), nullable=True),
        sa.Column("max_profit", sa.Numeric(12, 2), nullable=True),
        sa.Column("max_loss", sa.Numeric(12, 2), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.ForeignKeyConstraint(["account_id"], ["virtual_accounts.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("status IN ('DRAFT', 'EXECUTED', 'CLOSED')", name="ck_strategies_status"),
    )
    op.create_index("idx_strategies_user_id", "strategies", ["user_id"])
    op.create_index("idx_strategies_tenant_id", "strategies", ["tenant_id"])
    op.create_index("idx_strategies_user_status", "strategies", ["user_id", "status"])

    # ── strategy_legs ─────────────────────────────────────────
    op.create_table(
        "strategy_legs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("strategy_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("instrument", sa.String(length=20), nullable=False),
        sa.Column("expiry_date", sa.Date(), nullable=False),
        sa.Column("strike_price", sa.Numeric(10, 2), nullable=True),
        sa.Column("instrument_type", sa.String(length=3), nullable=False),
        sa.Column("action", sa.String(length=4), nullable=False),
        sa.Column("lots", sa.Integer(), nullable=False),
        sa.Column("lot_size", sa.Integer(), nullable=False),
        sa.Column("entry_price", sa.Numeric(10, 2), nullable=True),
        sa.Column("exit_price", sa.Numeric(10, 2), nullable=True),
        sa.Column("status", sa.String(length=10), nullable=False, server_default="PENDING"),
        sa.Column("realized_pnl", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("opened_at", sa.DateTime(), nullable=True),
        sa.Column("closed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["strategy_id"], ["strategies.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("instrument_type IN ('CE', 'PE', 'FUT')", name="ck_strategy_legs_instrument_type"),
        sa.CheckConstraint("action IN ('BUY', 'SELL')", name="ck_strategy_legs_action"),
        sa.CheckConstraint("status IN ('PENDING', 'OPEN', 'CLOSED')", name="ck_strategy_legs_status"),
        sa.CheckConstraint("lots > 0", name="ck_strategy_legs_lots_positive"),
        sa.CheckConstraint(
            "(instrument_type = 'FUT' AND strike_price IS NULL) "
            "OR (instrument_type IN ('CE','PE') AND strike_price IS NOT NULL)",
            name="ck_strategy_legs_strike_matches_type",
        ),
    )
    op.create_index("idx_strategy_legs_strategy_id", "strategy_legs", ["strategy_id"])
    op.create_index("idx_strategy_legs_user_status", "strategy_legs", ["user_id", "status"])

    # ── strategy_positions ────────────────────────────────────
    op.create_table(
        "strategy_positions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("strategy_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("margin_blocked", sa.Numeric(12, 2), nullable=False),
        sa.Column("realized_pnl", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("unrealized_pnl", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("brokerage", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("is_open", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("opened_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("closed_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["strategy_id"], ["strategies.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.ForeignKeyConstraint(["account_id"], ["virtual_accounts.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("strategy_id", name="uq_strategy_positions_strategy_id"),
    )
    op.create_index("idx_strategy_positions_user_open", "strategy_positions", ["user_id", "is_open"])
    op.create_index("idx_strategy_positions_tenant_id", "strategy_positions", ["tenant_id"])

    # ── virtual_orders: mirroring support ─────────────────────
    op.add_column(
        "virtual_orders",
        sa.Column("strategy_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_virtual_orders_strategy_id", "virtual_orders", "strategies",
        ["strategy_id"], ["id"],
    )
    op.create_index("idx_virtual_orders_strategy_id", "virtual_orders", ["strategy_id"])
    # A mirrored strategy leg has no per-leg stop-loss.
    op.alter_column("virtual_orders", "sl_price", existing_type=sa.Numeric(10, 2), nullable=True)


def downgrade() -> None:
    op.alter_column("virtual_orders", "sl_price", existing_type=sa.Numeric(10, 2), nullable=False)
    op.drop_index("idx_virtual_orders_strategy_id", table_name="virtual_orders")
    op.drop_constraint("fk_virtual_orders_strategy_id", "virtual_orders", type_="foreignkey")
    op.drop_column("virtual_orders", "strategy_id")

    op.drop_table("strategy_positions")
    op.drop_table("strategy_legs")
    op.drop_table("strategies")
