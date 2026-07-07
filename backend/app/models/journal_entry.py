import uuid
from decimal import Decimal
from datetime import datetime, date
from typing import Optional
from sqlalchemy import String, Integer, Numeric, Boolean, Date, Text, ForeignKey, UniqueConstraint, Index, func, ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base

class JournalEntry(Base):
    __tablename__ = "journal_entries"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("virtual_orders.id"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    entry_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    exit_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    pnl: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    brokerage: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    setup_tag: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    exit_reason: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    is_discipline_compliant: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    violations_attempted = mapped_column(ARRAY(String), nullable=True)
    duration_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    trade_date: Mapped[date] = mapped_column(Date, server_default=func.current_date(), nullable=False)
    emotion_tag: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    mistake_category: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    pre_trade_thesis: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    post_trade_review: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_reviewed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now(), nullable=False)
    order: Mapped["VirtualOrder"] = relationship("VirtualOrder", back_populates="journal_entry")
    user: Mapped["User"] = relationship("User", back_populates="journal_entries")
    __table_args__ = (
        UniqueConstraint("order_id", name="uq_journal_entries_order_id"),
        Index("idx_journal_entries_user_date", "user_id", "trade_date"),
        Index("idx_journal_entries_tenant_id", "tenant_id"),
    )
