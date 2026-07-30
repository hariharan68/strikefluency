"""Resting LIMIT exit for an open virtual order

Revision ID: 20260802_order_exit_limit
Revises: 20260801_user_plan
Create Date: 2026-08-02 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260802_order_exit_limit"
down_revision: Union[str, None] = "20260801_user_plan"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "virtual_orders",
        sa.Column("exit_limit_price", sa.Numeric(10, 2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("virtual_orders", "exit_limit_price")
