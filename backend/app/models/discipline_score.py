import uuid
from decimal import Decimal
from datetime import datetime, date
from sqlalchemy import Integer, Numeric, Date, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base

class DisciplineScore(Base):
    __tablename__ = "discipline_scores"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    score_date: Mapped[date] = mapped_column(Date, server_default=func.current_date(), nullable=False)
    score: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    trades_analyzed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    violations_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    consecutive_disciplined_streak: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    user: Mapped["User"] = relationship("User", back_populates="discipline_scores")
    __table_args__ = (UniqueConstraint("user_id", "score_date", name="uq_discipline_scores_user_date"),)
