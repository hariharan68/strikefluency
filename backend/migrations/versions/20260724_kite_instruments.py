"""Zerodha Kite instrument master

Revision ID: 20260724_kite_instruments
Revises: 20260721_trading_day_product
Create Date: 2026-07-24 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260724_kite_instruments"
down_revision: Union[str, None] = "20260721_trading_day_product"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "kite_instruments",
        sa.Column("instrument_token", sa.BigInteger(), primary_key=True),
        sa.Column("exchange_token", sa.String(32), nullable=True),
        sa.Column("exchange", sa.String(16), nullable=False),
        sa.Column("segment", sa.String(32), nullable=False),
        sa.Column("tradingsymbol", sa.String(128), nullable=False),
        sa.Column("name", sa.String(128), nullable=True),
        sa.Column("expiry", sa.Date(), nullable=True),
        sa.Column("strike", sa.Numeric(16, 4), nullable=True),
        sa.Column("tick_size", sa.Numeric(12, 4), nullable=False),
        sa.Column("lot_size", sa.Integer(), nullable=False),
        sa.Column("instrument_type", sa.String(16), nullable=False),
        sa.Column("underlying", sa.String(32), nullable=True),
        sa.Column("synced_at", sa.DateTime(), nullable=False),
    )
    op.create_index("idx_kite_exchange_symbol", "kite_instruments", ["exchange", "tradingsymbol"])
    op.create_index(
        "idx_kite_underlying_expiry_type_strike",
        "kite_instruments",
        ["underlying", "expiry", "instrument_type", "strike"],
    )
    op.create_index("idx_kite_segment_type", "kite_instruments", ["segment", "instrument_type"])
    op.create_index("idx_kite_expiry", "kite_instruments", ["expiry"])


def downgrade() -> None:
    op.drop_index("idx_kite_expiry", table_name="kite_instruments")
    op.drop_index("idx_kite_segment_type", table_name="kite_instruments")
    op.drop_index("idx_kite_underlying_expiry_type_strike", table_name="kite_instruments")
    op.drop_index("idx_kite_exchange_symbol", table_name="kite_instruments")
    op.drop_table("kite_instruments")
