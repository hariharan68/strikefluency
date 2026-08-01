"""Profile photo: users.avatar_url

Revision ID: 20260805_user_avatar
Revises: 20260804_user_phone
Create Date: 2026-08-05 00:00:00.000000

Holds a small `data:image/...;base64,...` URI (client center-crops to 256×256).
Stored on the user row and delivered inside UserProfile rather than served as a
file, because API auth is a bearer token — an <img src=endpoint> can't carry it.
Nullable; existing rows get NULL (they fall back to an initials avatar).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260805_user_avatar"
down_revision: Union[str, None] = "20260804_user_phone"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("avatar_url", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "avatar_url")
