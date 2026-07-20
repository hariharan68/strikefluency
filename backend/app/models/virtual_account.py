import uuid
from decimal import Decimal
from datetime import datetime
from sqlalchemy import Numeric, String, Integer, Boolean, ForeignKey, CheckConstraint, UniqueConstraint, Index, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base

class VirtualAccount(Base):
    __tablename__ = "virtual_accounts"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    balance: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("100000.00"), nullable=False)
    initial_balance: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("100000.00"), nullable=False)
    tier: Mapped[str] = mapped_column(String(10), default="TIER_1", nullable=False)
    consecutive_disciplined_trades: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    discipline_score: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("100.00"), nullable=False)
    # Master Discipline Mode switch. ON (default) → the 7 rules gate every order.
    # OFF → free-play sandbox: rules bypassed and full capital unlocked.
    discipline_mode_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Set True once full sandbox capital has been granted (discipline turned OFF).
    capital_unlocked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now(), nullable=False)
    user: Mapped["User"] = relationship("User", back_populates="virtual_account")
    virtual_orders: Mapped[list["VirtualOrder"]] = relationship("VirtualOrder", back_populates="account")
    virtual_positions: Mapped[list["VirtualPosition"]] = relationship("VirtualPosition", back_populates="account")
    __table_args__ = (
        CheckConstraint("balance >= 0", name="ck_virtual_accounts_balance_non_negative"),
        CheckConstraint("tier IN ('TIER_1', 'TIER_2', 'TIER_3')", name="ck_virtual_accounts_valid_tier"),
        UniqueConstraint("user_id", name="uq_virtual_accounts_user_id"),
        Index("idx_virtual_accounts_tenant_id", "tenant_id"),
    )
