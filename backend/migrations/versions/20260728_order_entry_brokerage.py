"""Split the entry brokerage leg out of virtual_orders.brokerage

Revision ID: 20260728_order_entry_brokerage
Revises: 20260727_pending_orders
Create Date: 2026-07-28 00:00:00.000000

`brokerage` is the round-trip total (entry at placement, exit added on close),
so once the entry leg is debited from the balance there is no column left that
records the entry leg alone. `pnl` cannot absorb it — `pnl` nets only the exit
leg, and adding the entry leg there would double-charge against the balance.

The backfill replicates calculate_brokerage() in SQL rather than importing it.
Migrations must stay frozen against code drift: if the fee schedule changes
next year, re-running this migration must still reproduce the values that were
correct when it ran.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260728_order_entry_brokerage"
down_revision: Union[str, None] = "20260727_pending_orders"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Mirrors app/services/brokerage_calculator.py:21-26 as of this revision.
#   flat 20 + STT (SELL only, 0.05%) + exchange (0.053%) + SEBI (10/crore)
#   + GST (18% on flat + exchange)
# Each component is rounded to paise before summing, then the total is rounded
# again — matching the per-component .quantize() calls in the Python.
_BACKFILL = sa.text("""
    UPDATE virtual_orders SET entry_brokerage = ROUND(
        20.00
        + CASE WHEN action = 'SELL'
               THEN ROUND(entry_price * quantity * lot_size * 0.0005, 2)
               ELSE 0.00 END
        + ROUND(entry_price * quantity * lot_size * 0.00053, 2)
        -- SEBI is 10 per crore. Expressed as a single multiplication
        -- (10 / 1e7 = 0.000001) rather than `turnover / 10000000 * 10`,
        -- because that division silently truncates to zero if every operand
        -- is an integer type.
        + ROUND(entry_price * quantity * lot_size * 0.000001, 2)
        + ROUND((20.00 + ROUND(entry_price * quantity * lot_size * 0.00053, 2)) * 0.18, 2)
    , 2)
""")


def upgrade() -> None:
    op.add_column(
        "virtual_orders",
        sa.Column("entry_brokerage", sa.Numeric(10, 2), nullable=True),
    )
    op.execute(_BACKFILL)
    op.alter_column(
        "virtual_orders",
        "entry_brokerage",
        nullable=False,
        server_default="0.00",
    )


def downgrade() -> None:
    op.drop_column("virtual_orders", "entry_brokerage")
