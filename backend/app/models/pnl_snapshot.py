import uuid
from decimal import Decimal
from datetime import date, datetime
from typing import Optional
from sqlalchemy import (
    String, Numeric, Integer, Date, ForeignKey, CheckConstraint, Index,
    UniqueConstraint, func,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class PnlSnapshot(Base):
    """
    One row per still-open position per trading day: what each holding was
    marked at when the book closed.

    Distinct from PortfolioSnapshot, which records the account total. This is
    the breakdown — which position actually drove a day's move. That attribution
    is destroyed the moment a position closes, because `virtual_positions` keeps
    only the latest `current_ltp` and then the final exit price overwrites it.

    Only open positions are captured. A position closed during the day already
    has a permanent record: its VirtualOrder row, with entry, exit and realised
    P&L.

    Like PortfolioSnapshot, idempotent rather than append-only — re-running a
    day must not duplicate.
    """

    __tablename__ = "pnl_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    snapshot_date: Mapped[date] = mapped_column(Date, nullable=False)

    # The position being marked. No FK, and deliberately so: this row must
    # outlive the position it describes, exactly as the ledger's reference does.
    position_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    order_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)

    # Denormalised contract identity, so a statement reads without joins to
    # rows that may since have been deleted.
    instrument: Mapped[str] = mapped_column(String(20), nullable=False)
    strike_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    option_type: Mapped[str] = mapped_column(String(2), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)

    avg_entry_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    mark_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    unrealized_pnl: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    margin_blocked: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("position_id", "snapshot_date", name="uq_pnl_snapshots_position_date"),
        CheckConstraint("option_type IN ('CE', 'PE')", name="ck_pnl_snapshots_option_type"),
        Index("idx_pnl_snapshots_user_date", "user_id", "snapshot_date"),
        Index("idx_pnl_snapshots_tenant_id", "tenant_id"),
    )
