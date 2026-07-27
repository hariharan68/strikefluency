"""Add resting LIMIT orders (pending_orders)

Revision ID: 20260727_pending_orders
Revises: 20260724_strategy_workspace
Create Date: 2026-07-27 10:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260727_pending_orders"
down_revision: Union[str, None] = "20260724_strategy_workspace"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "pending_orders",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("virtual_accounts.id"), nullable=False),
        sa.Column("client_order_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("instrument", sa.String(20), server_default="NIFTY", nullable=False),
        sa.Column("expiry_date", sa.Date(), nullable=False),
        sa.Column("strike_price", sa.Numeric(10, 2), nullable=False),
        sa.Column("option_type", sa.String(2), nullable=False),
        sa.Column("action", sa.String(4), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("lot_size", sa.Integer(), server_default="50", nullable=False),
        sa.Column("product_type", sa.String(10), server_default="INTRADAY", nullable=False),
        sa.Column("limit_price", sa.Numeric(10, 2), nullable=False),
        sa.Column("placed_ltp", sa.Numeric(10, 2), nullable=False),
        sa.Column("sl_price", sa.Numeric(10, 2), nullable=True),
        sa.Column("target_price", sa.Numeric(10, 2), nullable=True),
        sa.Column("setup_tag", sa.String(30), nullable=False),
        sa.Column("status", sa.String(20), server_default="PENDING", nullable=False),
        sa.Column("margin_blocked", sa.Numeric(12, 2), server_default="0.00", nullable=False),
        sa.Column("trading_day", sa.Date(), nullable=False),
        sa.Column("filled_order_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("virtual_orders.id"), nullable=True),
        sa.Column("fill_price", sa.Numeric(10, 2), nullable=True),
        sa.Column("filled_at", sa.DateTime(), nullable=True),
        sa.Column("closed_at", sa.DateTime(), nullable=True),
        sa.Column("reject_reason", sa.String(300), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("option_type IN ('CE', 'PE')", name="ck_pending_orders_option_type"),
        sa.CheckConstraint("action IN ('BUY', 'SELL')", name="ck_pending_orders_action"),
        sa.CheckConstraint(
            "status IN ('PENDING', 'FILLED', 'CANCELLED', 'EXPIRED', 'REJECTED')",
            name="ck_pending_orders_status",
        ),
        sa.CheckConstraint("product_type IN ('INTRADAY', 'NRML')", name="ck_pending_orders_product_type"),
        sa.CheckConstraint("quantity > 0", name="ck_pending_orders_quantity_positive"),
        sa.CheckConstraint("limit_price > 0", name="ck_pending_orders_limit_positive"),
        sa.UniqueConstraint("user_id", "client_order_id", name="uq_pending_orders_user_client_order"),
    )
    op.create_index("idx_pending_orders_user_id", "pending_orders", ["user_id"])
    op.create_index("idx_pending_orders_status", "pending_orders", ["status"])
    op.create_index("idx_pending_orders_user_status", "pending_orders", ["user_id", "status"])
    op.create_index("idx_pending_orders_user_trading_day", "pending_orders", ["user_id", "trading_day"])


def downgrade() -> None:
    op.drop_index("idx_pending_orders_user_trading_day", table_name="pending_orders")
    op.drop_index("idx_pending_orders_user_status", table_name="pending_orders")
    op.drop_index("idx_pending_orders_status", table_name="pending_orders")
    op.drop_index("idx_pending_orders_user_id", table_name="pending_orders")
    op.drop_table("pending_orders")
