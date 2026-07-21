import uuid
from decimal import Decimal
from datetime import datetime, date
from typing import Optional
from sqlalchemy import String, Integer, Numeric, Boolean, Date, ForeignKey, CheckConstraint, Index, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base

class VirtualOrder(Base):
    __tablename__ = "virtual_orders"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    account_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("virtual_accounts.id"), nullable=False)
    instrument: Mapped[str] = mapped_column(String(20), default="NIFTY", nullable=False)
    expiry_date: Mapped[date] = mapped_column(Date, nullable=False)
    strike_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    option_type: Mapped[str] = mapped_column(String(2), nullable=False)
    action: Mapped[str] = mapped_column(String(4), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    lot_size: Mapped[int] = mapped_column(Integer, default=50, nullable=False)
    entry_ltp: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    entry_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    exit_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    # Nullable since Phase 5: single orders always set it, but a leg mirrored from
    # a multi-leg Strategy has no per-leg stop — risk is managed at strategy level.
    sl_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    target_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="OPEN", nullable=False)
    # INTRADAY orders are auto-squared-off at EOD (15:29 IST); NRML carry forward.
    product_type: Mapped[str] = mapped_column(String(10), default="INTRADAY", nullable=False)
    # The trading day (08:30 IST boundary) this order belongs to. Orderbook and
    # tradebook views scope to the current trading day so they reset each morning.
    trading_day: Mapped[date] = mapped_column(Date, nullable=False)
    entry_time: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    exit_time: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    pnl: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    brokerage: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"), nullable=False)
    slippage_points: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"), nullable=False)
    setup_tag: Mapped[str] = mapped_column(String(30), nullable=False)
    exit_reason: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    is_discipline_compliant: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # True when placed while Discipline Mode was OFF (free-play). Such trades are
    # excluded from the discipline score/streak and never trigger a cooldown.
    was_free_play: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Set when this order is a leg mirrored from a multi-leg Strategy (Phase 5+);
    # NULL for ordinary single-leg orders. Lets existing analytics/journal treat
    # strategy legs as normal orders while still being groupable by strategy.
    strategy_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("strategies.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    user: Mapped["User"] = relationship("User", back_populates="virtual_orders")
    strategy: Mapped[Optional["Strategy"]] = relationship("Strategy", back_populates="mirrored_orders")
    account: Mapped["VirtualAccount"] = relationship("VirtualAccount", back_populates="virtual_orders")
    position: Mapped[Optional["VirtualPosition"]] = relationship("VirtualPosition", back_populates="order", uselist=False)
    journal_entry: Mapped[Optional["JournalEntry"]] = relationship("JournalEntry", back_populates="order", uselist=False)
    __table_args__ = (
        CheckConstraint("option_type IN ('CE', 'PE')", name="ck_virtual_orders_option_type"),
        CheckConstraint("action IN ('BUY', 'SELL')", name="ck_virtual_orders_action"),
        CheckConstraint("status IN ('OPEN', 'CLOSED', 'CANCELLED', 'SL_HIT', 'TARGET_HIT')", name="ck_virtual_orders_status"),
        CheckConstraint("product_type IN ('INTRADAY', 'NRML')", name="ck_virtual_orders_product_type"),
        CheckConstraint("quantity > 0", name="ck_virtual_orders_quantity_positive"),
        Index("idx_virtual_orders_user_id", "user_id"),
        Index("idx_virtual_orders_tenant_id", "tenant_id"),
        Index("idx_virtual_orders_status", "status"),
        Index("idx_virtual_orders_user_status", "user_id", "status"),
        Index("idx_virtual_orders_user_trading_day", "user_id", "trading_day"),
    )
