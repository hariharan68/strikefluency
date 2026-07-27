"""Daily portfolio and per-position P&L snapshots

Revision ID: 20260731_snapshots
Revises: 20260730_audit_logs
Create Date: 2026-07-31 00:00:00.000000

Nothing is backfilled. The one thing these tables record that is not otherwise
recoverable is the unrealised mark on positions open at each close, and that
history does not exist anywhere to backfill from — virtual_positions keeps only
the latest current_ltp.

Unlike virtual_fund_ledger and audit_logs these are NOT append-only: a snapshot
is a derived observation, so re-running a day must update rather than
duplicate. The unique constraints make that safe.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260731_snapshots"
down_revision: Union[str, None] = "20260730_audit_logs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "portfolio_snapshots",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id"), nullable=False),
        sa.Column("account_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("virtual_accounts.id"), nullable=False),
        sa.Column("snapshot_date", sa.Date(), nullable=False),
        sa.Column("balance", sa.Numeric(12, 2), nullable=False),
        sa.Column("margin_blocked", sa.Numeric(12, 2), nullable=False),
        sa.Column("unrealized_pnl", sa.Numeric(12, 2), nullable=False),
        sa.Column("realized_pnl_today", sa.Numeric(12, 2), nullable=False),
        sa.Column("equity", sa.Numeric(12, 2), nullable=False),
        sa.Column("open_positions", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("trades_today", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("tier", sa.String(10), nullable=False),
        sa.Column("discipline_score", sa.Numeric(5, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "snapshot_date",
                            name="uq_portfolio_snapshots_user_date"),
        sa.CheckConstraint("equity = balance + margin_blocked + unrealized_pnl",
                           name="ck_portfolio_snapshots_equity"),
    )
    op.create_index("idx_portfolio_snapshots_user_date", "portfolio_snapshots",
                    ["user_id", "snapshot_date"])
    op.create_index("idx_portfolio_snapshots_tenant_id", "portfolio_snapshots",
                    ["tenant_id"])

    op.create_table(
        "pnl_snapshots",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id"), nullable=False),
        sa.Column("snapshot_date", sa.Date(), nullable=False),
        # No FK on position_id: the snapshot must outlive the position it
        # describes, exactly as the ledger's reference does.
        sa.Column("position_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("instrument", sa.String(20), nullable=False),
        sa.Column("strike_price", sa.Numeric(10, 2), nullable=False),
        sa.Column("option_type", sa.String(2), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("avg_entry_price", sa.Numeric(10, 2), nullable=False),
        sa.Column("mark_price", sa.Numeric(10, 2), nullable=False),
        sa.Column("unrealized_pnl", sa.Numeric(12, 2), nullable=False),
        sa.Column("margin_blocked", sa.Numeric(12, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("position_id", "snapshot_date",
                            name="uq_pnl_snapshots_position_date"),
        sa.CheckConstraint("option_type IN ('CE', 'PE')",
                           name="ck_pnl_snapshots_option_type"),
    )
    op.create_index("idx_pnl_snapshots_user_date", "pnl_snapshots",
                    ["user_id", "snapshot_date"])
    op.create_index("idx_pnl_snapshots_tenant_id", "pnl_snapshots", ["tenant_id"])


def downgrade() -> None:
    op.drop_index("idx_pnl_snapshots_tenant_id", table_name="pnl_snapshots")
    op.drop_index("idx_pnl_snapshots_user_date", table_name="pnl_snapshots")
    op.drop_table("pnl_snapshots")
    op.drop_index("idx_portfolio_snapshots_tenant_id", table_name="portfolio_snapshots")
    op.drop_index("idx_portfolio_snapshots_user_date", table_name="portfolio_snapshots")
    op.drop_table("portfolio_snapshots")
