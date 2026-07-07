import uuid
from decimal import Decimal
from datetime import datetime, date
from typing import Optional
from sqlalchemy import String, Integer, Numeric, Boolean, Date, ForeignKey, UniqueConstraint, Index, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base

class VirtualPosition(Base):
    __tablename__ = "virtual_positions"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("virtual_orders.id"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    account_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("virtual_accounts.id"), nullable=False)
    instrument: Mapped[str] = mapped_column(String(20), nullable=False)
    expiry_date: Mapped[date] = mapped_column(Date, nullable=False)
    strike_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    option_type: Mapped[str] = mapped_column(String(2), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    avg_entry_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    current_ltp: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    unrealized_pnl: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"), nullable=False)
    margin_blocked: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    is_open: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    opened_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    closed_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    order: Mapped["VirtualOrder"] = relationship("VirtualOrder", back_populates="position")
    account: Mapped["VirtualAccount"] = relationship("VirtualAccount", back_populates="virtual_positions")
    __table_args__ = (
        UniqueConstraint("order_id", name="uq_virtual_positions_order_id"),
        Index("idx_virtual_positions_user_open", "user_id", "is_open"),
        Index("idx_virtual_positions_tenant_id", "tenant_id"),
    )
