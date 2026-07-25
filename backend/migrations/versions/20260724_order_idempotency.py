"""Add retry-safe client order identifiers

Revision ID: 20260724_order_idempotency
Revises: 20260724_kite_instruments
Create Date: 2026-07-24 00:30:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260724_order_idempotency"
down_revision: Union[str, None] = "20260724_kite_instruments"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Existing orders and server-created strategy legs have no client request
    # identifier, so the column intentionally remains nullable.
    op.add_column(
        "virtual_orders",
        sa.Column("client_order_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_unique_constraint(
        "uq_virtual_orders_user_client_order",
        "virtual_orders",
        ["user_id", "client_order_id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_virtual_orders_user_client_order",
        "virtual_orders",
        type_="unique",
    )
    op.drop_column("virtual_orders", "client_order_id")
