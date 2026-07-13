"""Make user email globally unique instead of per-tenant.

Login and OAuth resolve users by email alone, so the old
(tenant_id, email) constraint allowed colliding emails across tenants
and made logins non-deterministic. Enforce one email = one account.
"""

from alembic import op

revision = "20260713_global_unique_email"
down_revision = "20260711_oauth_hardening"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("uq_users_tenant_email", "users", type_="unique")
    op.create_unique_constraint("uq_users_email", "users", ["email"])


def downgrade() -> None:
    op.drop_constraint("uq_users_email", "users", type_="unique")
    op.create_unique_constraint("uq_users_tenant_email", "users", ["tenant_id", "email"])
