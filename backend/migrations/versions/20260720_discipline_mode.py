"""discipline mode master switch + free-play flag

Revision ID: 20260720_discipline_mode
Revises: 20260718_strategy_builder
Create Date: 2026-07-20 00:00:00.000000

Adds the master Discipline Mode switch and free-play accounting:
  - virtual_accounts.discipline_mode_enabled  (default TRUE)  — rules gate orders
  - virtual_accounts.capital_unlocked         (default FALSE) — full capital granted
  - virtual_orders.was_free_play              (default FALSE) — placed with rules OFF

All columns carry a server_default so existing rows backfill without a rewrite.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260720_discipline_mode"
down_revision: Union[str, None] = "20260718_strategy_builder"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "virtual_accounts",
        sa.Column("discipline_mode_enabled", sa.Boolean(), nullable=False,
                  server_default=sa.text("true")),
    )
    op.add_column(
        "virtual_accounts",
        sa.Column("capital_unlocked", sa.Boolean(), nullable=False,
                  server_default=sa.text("false")),
    )
    op.add_column(
        "virtual_orders",
        sa.Column("was_free_play", sa.Boolean(), nullable=False,
                  server_default=sa.text("false")),
    )


def downgrade() -> None:
    op.drop_column("virtual_orders", "was_free_play")
    op.drop_column("virtual_accounts", "capital_unlocked")
    op.drop_column("virtual_accounts", "discipline_mode_enabled")
