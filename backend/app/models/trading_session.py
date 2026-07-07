import uuid
from decimal import Decimal
from datetime import datetime, date
from typing import Optional
from sqlalchemy import Integer, Numeric, Boolean, Date, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base

class TradingSession(Base):
    __tablename__ = "trading_sessions"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    session_date: Mapped[date] = mapped_column(Date, server_default=func.current_date(), nullable=False)
    trades_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    realized_pnl: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"), nullable=False)
    is_cooldown_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    cooldown_until: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    last_sl_hit_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    user: Mapped["User"] = relationship("User", back_populates="trading_sessions")
    __table_args__ = (UniqueConstraint("user_id", "session_date", name="uq_trading_sessions_user_date"),)
