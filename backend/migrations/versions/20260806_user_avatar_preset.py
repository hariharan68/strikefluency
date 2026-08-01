"""Preset avatar choice: users.avatar_preset

Revision ID: 20260806_user_avatar_preset
Revises: 20260805_user_avatar
Create Date: 2026-08-06 00:00:00.000000

Stores a preset illustration key (e.g. "men_3"); the images themselves live in
the frontend. Independent of the uploaded photo (avatar_url) — when both are set
the UI alternates between them. Nullable; existing rows get NULL.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260806_user_avatar_preset"
down_revision: Union[str, None] = "20260805_user_avatar"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("avatar_preset", sa.String(20), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "avatar_preset")
