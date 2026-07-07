import uuid
from datetime import datetime, date
from sqlalchemy import String, Boolean, Date, ForeignKey, Index, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.database import Base

class DisciplineViolation(Base):
    __tablename__ = "discipline_violations"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    rule_code: Mapped[str] = mapped_column(String(50), nullable=False)
    attempted_action: Mapped[dict] = mapped_column(JSONB, nullable=False)
    was_blocked: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    session_date: Mapped[date] = mapped_column(Date, server_default=func.current_date(), nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    user: Mapped["User"] = relationship("User", back_populates="discipline_violations")
    __table_args__ = (Index("idx_violations_user_date", "user_id", "session_date"),)
