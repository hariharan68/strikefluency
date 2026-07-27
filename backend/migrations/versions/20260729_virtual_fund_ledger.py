"""Append-only ledger for every virtual balance change

Revision ID: 20260729_virtual_fund_ledger
Revises: 20260728_order_entry_brokerage
Create Date: 2026-07-29 00:00:00.000000

The ledger is observational: balances continue to live in
virtual_accounts.balance and are never derived from this table, which is what
makes this migration safe to drop at any point. Do not later turn `balance`
into a view over the ledger — that would trade the reversibility away.

Existing accounts get a single INITIAL_CREDIT row reconciling to their current
balance. History is deliberately NOT reconstructed from virtual_orders: it
cannot be. margin_blocked is zeroed on close, the Discipline Mode capital
unlock leaves no trace, and strategy netting uses a different formula, so any
reconstruction would produce a ledger whose sum disagrees with the balance —
failing its own reconciliation invariant on day one.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260729_virtual_fund_ledger"
down_revision: Union[str, None] = "20260728_order_entry_brokerage"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "virtual_fund_ledger",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("seq", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id"), nullable=False),
        sa.Column("account_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("virtual_accounts.id"), nullable=False),
        sa.Column("transaction_type", sa.String(20), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("balance_before", sa.Numeric(12, 2), nullable=False),
        sa.Column("balance_after", sa.Numeric(12, 2), nullable=False),
        sa.Column("reference_type", sa.String(30), nullable=True),
        sa.Column("reference_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("description", sa.String(200), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        # A row that misstates its own arithmetic cannot be stored, whatever
        # the calling code believes.
        sa.CheckConstraint("balance_after = balance_before + amount",
                           name="ck_vfl_balance_arithmetic"),
        sa.CheckConstraint("amount <> 0", name="ck_vfl_amount_nonzero"),
        sa.CheckConstraint("balance_after >= 0", name="ck_vfl_balance_after_non_negative"),
        sa.CheckConstraint(
            "transaction_type IN ('INITIAL_CREDIT', 'TRADE_DEBIT', 'TRADE_CREDIT', "
            "'CHARGE', 'REFUND', 'MANUAL_ADJUSTMENT', 'RESET')",
            name="ck_vfl_transaction_type",
        ),
        sa.CheckConstraint(
            "reference_type IS NULL OR reference_type IN "
            "('VIRTUAL_ORDER', 'PENDING_ORDER', 'STRATEGY_POSITION', 'ACCOUNT', 'MANUAL')",
            name="ck_vfl_reference_type",
        ),
        sa.CheckConstraint(
            "(transaction_type IN ('INITIAL_CREDIT', 'TRADE_CREDIT', 'REFUND') AND amount > 0)"
            " OR (transaction_type IN ('TRADE_DEBIT', 'CHARGE') AND amount < 0)"
            " OR transaction_type IN ('MANUAL_ADJUSTMENT', 'RESET')",
            name="ck_vfl_type_sign",
        ),
        sa.UniqueConstraint("seq", name="uq_vfl_seq"),
    )
    op.create_index("idx_vfl_account_seq", "virtual_fund_ledger", ["account_id", "seq"])
    op.create_index("idx_vfl_user_created", "virtual_fund_ledger", ["user_id", "created_at"])
    op.create_index("idx_vfl_tenant_id", "virtual_fund_ledger", ["tenant_id"])
    op.create_index("idx_vfl_reference", "virtual_fund_ledger",
                    ["reference_type", "reference_id"])

    # UPDATE is blocked at the storage layer: the value of a ledger is that it
    # can be trusted without reading the code that wrote it. DELETE stays
    # allowed — test teardown and account deletion need it, and a delete fails
    # loudly as a gap in `seq` whereas an update corrupts history silently.
    op.execute("""
        CREATE OR REPLACE FUNCTION vfl_forbid_update() RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'virtual_fund_ledger is append-only (attempted UPDATE on row %)', OLD.id;
        END;
        $$ LANGUAGE plpgsql
    """)
    op.execute("""
        CREATE TRIGGER trg_vfl_forbid_update
            BEFORE UPDATE ON virtual_fund_ledger
            FOR EACH ROW EXECUTE FUNCTION vfl_forbid_update()
    """)

    # Opening row per existing account. `WHERE balance <> 0` because of
    # ck_vfl_amount_nonzero; an account sitting at exactly zero needs no row
    # and reconciles trivially as 0 == 0.
    op.execute("""
        INSERT INTO virtual_fund_ledger
            (id, tenant_id, user_id, account_id, transaction_type, amount,
             balance_before, balance_after, reference_type, reference_id,
             description, created_at)
        SELECT gen_random_uuid(), a.tenant_id, a.user_id, a.id,
               'INITIAL_CREDIT', a.balance, 0.00, a.balance,
               'ACCOUNT', a.id,
               'Opening balance carried forward at ledger introduction',
               a.created_at
        FROM virtual_accounts a
        WHERE a.balance <> 0
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_vfl_forbid_update ON virtual_fund_ledger")
    op.execute("DROP FUNCTION IF EXISTS vfl_forbid_update()")
    op.drop_index("idx_vfl_reference", table_name="virtual_fund_ledger")
    op.drop_index("idx_vfl_tenant_id", table_name="virtual_fund_ledger")
    op.drop_index("idx_vfl_user_created", table_name="virtual_fund_ledger")
    op.drop_index("idx_vfl_account_seq", table_name="virtual_fund_ledger")
    op.drop_table("virtual_fund_ledger")
