import uuid
from decimal import Decimal
from datetime import date, datetime
from sqlalchemy import (
    String, Numeric, Integer, Date, ForeignKey, CheckConstraint, Index,
    UniqueConstraint, func,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class PortfolioSnapshot(Base):
    """
    One row per user per trading day: the account as it stood at the close.

    Most of an equity curve is reconstructible from closed orders
    (`virtual_orders.exit_time` + `pnl`), which is why this is a convenience
    rather than a necessity — with one exception that is NOT reconstructible:
    the *unrealised* mark on positions still open at the close. An NRML position
    carried over three days has no record of what it was worth on each of those
    days once it finally closes, so the day-by-day equity curve is permanently
    unrecoverable without this row.

    Written after the 15:29 square-off, so intraday positions are already
    settled and `open_positions` counts only genuine carry-forward.

    Not append-only, unlike the ledger and audit log: a snapshot is a derived
    observation, so re-running the job for a day must be idempotent rather than
    duplicating. The unique constraint enforces that.
    """

    __tablename__ = "portfolio_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    account_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("virtual_accounts.id"), nullable=False)

    snapshot_date: Mapped[date] = mapped_column(Date, nullable=False)

    # Free cash, i.e. virtual_accounts.balance at the close.
    balance: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    # Cash reserved against open positions and resting limits. Already excluded
    # from `balance`, so equity has to add it back.
    margin_blocked: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    unrealized_pnl: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    realized_pnl_today: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    # balance + margin_blocked + unrealized_pnl — what the account is worth if
    # everything were closed at the marks recorded here.
    equity: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    open_positions: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    trades_today: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    tier: Mapped[str] = mapped_column(String(10), nullable=False)
    discipline_score: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)

    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("user_id", "snapshot_date", name="uq_portfolio_snapshots_user_date"),
        CheckConstraint(
            "equity = balance + margin_blocked + unrealized_pnl",
            name="ck_portfolio_snapshots_equity",
        ),
        Index("idx_portfolio_snapshots_user_date", "user_id", "snapshot_date"),
        Index("idx_portfolio_snapshots_tenant_id", "tenant_id"),
    )
