"""Subscription seam: users.plan

Revision ID: 20260801_user_plan
Revises: 20260731_snapshots
Create Date: 2026-08-01 00:00:00.000000

The app is free and there is nothing to sell, so this adds a column and
nothing else — no subscriptions table, no payments table, no provider. The
point is that introducing a paid tier later becomes a policy change rather than
a migration against a live users table.

Every existing user becomes "free", which is what they already are.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260801_user_plan"
down_revision: Union[str, None] = "20260731_snapshots"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("plan", sa.String(20), nullable=False, server_default="free"),
    )
    op.create_check_constraint(
        "ck_users_plan", "users", "plan IN ('free', 'pro')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_users_plan", "users", type_="check")
    op.drop_column("users", "plan")
