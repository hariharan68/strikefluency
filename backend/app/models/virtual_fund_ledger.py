import uuid
from decimal import Decimal
from datetime import datetime
from typing import Optional
from sqlalchemy import (
    String, Numeric, BigInteger, Identity, ForeignKey, CheckConstraint,
    Index, UniqueConstraint, func,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base
from app.models.append_only import AppendOnlyViolation, attach_append_only_guard


class VirtualFundLedger(Base):
    """
    The append-only record of every change to virtual_accounts.balance.

    `balance` is a single scalar column, so before this table existed the only
    way to answer "why is my balance this number?" was to re-derive it from
    orders, positions and pending reservations — which is not actually
    possible, because margin_blocked is zeroed on close and the discipline
    capital top-up leaves no trace at all.

    Every row states the balance before, the signed delta, and the balance
    after. The CHECK constraints below make an internally inconsistent row
    physically impossible to store, and `seq` gives a total order, so
    `balance == SUM(amount)` is provable rather than merely asserted. That
    invariant is enforced in tests by assert_ledger_reconciles().

    Note the invariant uses `balance`, NOT `initial_balance + SUM(amount)`:
    initial_balance is a discipline-rule denominator that
    discipline_mode_service mutates when capital is unlocked, so it is not a
    money anchor.

    This table is observational. Balances live in virtual_accounts and are
    never derived from it, which is what makes the migration safe to drop at
    any time. Do not later "optimise" balance into a view over the ledger —
    that trades the reversibility away.
    """

    __tablename__ = "virtual_fund_ledger"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Total order. created_at ties for rows written in the same transaction,
    # so without seq a balance cannot be deterministically replayed.
    seq: Mapped[int] = mapped_column(BigInteger, Identity(always=True), nullable=False)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    # Denormalised from the account (the account/user relation is 1:1 via
    # uq_virtual_accounts_user_id). Lets a per-user statement be read without a
    # join, and keeps test teardown to a single delete.
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    account_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("virtual_accounts.id"), nullable=False)

    transaction_type: Mapped[str] = mapped_column(String(20), nullable=False)
    # Signed. Wider than balance's Numeric(12,2) so a legitimate large
    # adjustment overflows the balance before it overflows its own audit row.
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    balance_before: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    balance_after: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    # Deliberately polymorphic and deliberately without a foreign key: an FK
    # would need three nullable columns, and would make ledger rows die with
    # the order they describe — which is exactly what an audit trail must not do.
    reference_type: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    reference_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)

    description: Mapped[str] = mapped_column(String(200), nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)

    __table_args__ = (
        # The load-bearing one: a row that misstates its own arithmetic cannot
        # be written, whatever the calling code believes.
        CheckConstraint(
            "balance_after = balance_before + amount",
            name="ck_vfl_balance_arithmetic",
        ),
        CheckConstraint("amount <> 0", name="ck_vfl_amount_nonzero"),
        CheckConstraint("balance_after >= 0", name="ck_vfl_balance_after_non_negative"),
        CheckConstraint(
            "transaction_type IN ('INITIAL_CREDIT', 'TRADE_DEBIT', 'TRADE_CREDIT', "
            "'CHARGE', 'REFUND', 'MANUAL_ADJUSTMENT', 'RESET')",
            name="ck_vfl_transaction_type",
        ),
        CheckConstraint(
            "reference_type IS NULL OR reference_type IN "
            "('VIRTUAL_ORDER', 'PENDING_ORDER', 'STRATEGY_POSITION', 'ACCOUNT', 'MANUAL')",
            name="ck_vfl_reference_type",
        ),
        # Credits credit and debits debit. MANUAL_ADJUSTMENT and RESET are
        # genuinely bidirectional, so they are exempt.
        CheckConstraint(
            "(transaction_type IN ('INITIAL_CREDIT', 'TRADE_CREDIT', 'REFUND') AND amount > 0)"
            " OR (transaction_type IN ('TRADE_DEBIT', 'CHARGE') AND amount < 0)"
            " OR transaction_type IN ('MANUAL_ADJUSTMENT', 'RESET')",
            name="ck_vfl_type_sign",
        ),
        UniqueConstraint("seq", name="uq_vfl_seq"),
        Index("idx_vfl_account_seq", "account_id", "seq"),
        Index("idx_vfl_user_created", "user_id", "created_at"),
        Index("idx_vfl_tenant_id", "tenant_id"),
        Index("idx_vfl_reference", "reference_type", "reference_id"),
    )


# ── Immutability ──────────────────────────────────────────────────
# See app/models/append_only.py: a Postgres trigger blocks UPDATE (DELETE stays
# allowed on purpose), plus an ORM listener so a stray write fails at the
# offending line rather than opaquely at flush time. To correct a row, post a
# compensating MANUAL_ADJUSTMENT.
attach_append_only_guard(VirtualFundLedger, name="vfl")

# Kept as an alias: tests and callers refer to the ledger-specific name.
LedgerImmutableError = AppendOnlyViolation
