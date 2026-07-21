"""trading-day boundary + INTRADAY/NRML product type

Revision ID: 20260721_trading_day_product
Revises: 1674dd5f928c
Create Date: 2026-07-21 20:00:00.000000

Adds the daily-reset + product-type primitives:
  - virtual_orders.product_type  (default INTRADAY) — INTRADAY auto-squares off
                                  at EOD; NRML carries forward across days.
  - virtual_orders.trading_day   (08:30 IST boundary) — orderbook/tradebook
                                  views scope to the current trading day so they
                                  reset each morning. Backfilled from entry_time.
  - strategies.product_type      (default INTRADAY) — same semantics for
                                  multi-leg strategies.

product_type carries a server_default so existing rows backfill to the previous
(intraday) behavior. trading_day is added nullable, backfilled from entry_time's
date (orders only occur during market hours, so the date component is correct),
then made NOT NULL.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260721_trading_day_product"
down_revision: Union[str, None] = "1674dd5f928c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── virtual_orders.product_type ──
    op.add_column(
        "virtual_orders",
        sa.Column("product_type", sa.String(length=10), nullable=False,
                  server_default=sa.text("'INTRADAY'")),
    )
    op.create_check_constraint(
        "ck_virtual_orders_product_type",
        "virtual_orders",
        "product_type IN ('INTRADAY', 'NRML')",
    )

    # ── virtual_orders.trading_day (nullable → backfill → NOT NULL) ──
    op.add_column(
        "virtual_orders",
        sa.Column("trading_day", sa.Date(), nullable=True),
    )
    op.execute(
        "UPDATE virtual_orders SET trading_day = entry_time::date "
        "WHERE trading_day IS NULL"
    )
    op.alter_column("virtual_orders", "trading_day", nullable=False)
    op.create_index(
        "idx_virtual_orders_user_trading_day",
        "virtual_orders",
        ["user_id", "trading_day"],
    )

    # ── strategies.product_type ──
    op.add_column(
        "strategies",
        sa.Column("product_type", sa.String(length=10), nullable=False,
                  server_default=sa.text("'INTRADAY'")),
    )
    op.create_check_constraint(
        "ck_strategies_product_type",
        "strategies",
        "product_type IN ('INTRADAY', 'NRML')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_strategies_product_type", "strategies", type_="check")
    op.drop_column("strategies", "product_type")

    op.drop_index("idx_virtual_orders_user_trading_day", table_name="virtual_orders")
    op.drop_column("virtual_orders", "trading_day")
    op.drop_constraint("ck_virtual_orders_product_type", "virtual_orders", type_="check")
    op.drop_column("virtual_orders", "product_type")
