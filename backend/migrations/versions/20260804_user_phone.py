"""Profile contact number: users.phone

Revision ID: 20260804_user_phone
Revises: 20260803_oauth_completion
Create Date: 2026-08-04 00:00:00.000000

Adds an optional, free-form contact number for the Profile page. It is never
used for authentication, so the column is nullable with no format constraint —
light validation lives in the ProfileUpdate schema. Existing rows get NULL.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260804_user_phone"
down_revision: Union[str, None] = "20260803_oauth_completion"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("phone", sa.String(20), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "phone")
