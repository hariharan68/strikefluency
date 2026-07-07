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
    sl_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    target_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="OPEN", nullable=False)
    entry_time: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    exit_time: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    pnl: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    brokerage: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"), nullable=False)
    slippage_points: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"), nullable=False)
    setup_tag: Mapped[str] = mapped_column(String(30), nullable=False)
    exit_reason: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    is_discipline_compliant: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    user: Mapped["User"] = relationship("User", back_populates="virtual_orders")
    account: Mapped["VirtualAccount"] = relationship("VirtualAccount", back_populates="virtual_orders")
    position: Mapped[Optional["VirtualPosition"]] = relationship("VirtualPosition", back_populates="order", uselist=False)
    journal_entry: Mapped[Optional["JournalEntry"]] = relationship("JournalEntry", back_populates="order", uselist=False)
    __table_args__ = (
        CheckConstraint("option_type IN ('CE', 'PE')", name="ck_virtual_orders_option_type"),
        CheckConstraint("action IN ('BUY', 'SELL')", name="ck_virtual_orders_action"),
        CheckConstraint("status IN ('OPEN', 'CLOSED', 'CANCELLED', 'SL_HIT', 'TARGET_HIT')", name="ck_virtual_orders_status"),
        CheckConstraint("quantity > 0", name="ck_virtual_orders_quantity_positive"),
        Index("idx_virtual_orders_user_id", "user_id"),
        Index("idx_virtual_orders_tenant_id", "tenant_id"),
        Index("idx_virtual_orders_status", "status"),
        Index("idx_virtual_orders_user_status", "user_id", "status"),
    )
