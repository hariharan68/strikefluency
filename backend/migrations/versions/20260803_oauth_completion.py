"""Complete the OAuth flow: OIDC nonce, link-challenge attempt cap, password-less accounts."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260803_oauth_completion"
down_revision = "20260802_order_exit_limit"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Nullable on purpose: a transaction started before this migration has no
    # nonce, and the verifier treats a missing nonce as a hard failure. Failing
    # closed beats a NOT NULL that would break in-flight sign-ins.
    op.add_column("oauth_transactions", sa.Column("nonce", sa.String(128), nullable=True))
    # Lets an /oauth/{provider}/start be bound to an existing link challenge so a
    # password-less account can prove ownership via a provider it already linked.
    op.add_column(
        "oauth_transactions",
        sa.Column(
            "link_challenge_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("link_challenges.id", ondelete="CASCADE"), nullable=True,
        ),
    )

    op.add_column("link_challenges", sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("link_challenges", sa.Column("verify_provider", sa.String(20), nullable=True))

    # hashed_password stays NOT NULL. A nullable password column would turn every
    # call site that hashes or verifies unconditionally into a 500 on the login
    # path (passlib raises TypeError on None rather than returning False), so the
    # OAuth-only marker is a separate boolean that defaults to the safe answer.
    op.add_column("users", sa.Column("has_usable_password", sa.Boolean(), nullable=False, server_default="true"))


def downgrade() -> None:
    op.drop_column("users", "has_usable_password")
    op.drop_column("link_challenges", "verify_provider")
    op.drop_column("link_challenges", "attempts")
    op.drop_column("oauth_transactions", "link_challenge_id")
    op.drop_column("oauth_transactions", "nonce")
