import uuid
from datetime import datetime
from sqlalchemy import ForeignKey, UniqueConstraint, Index, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.database import Base


class UserSettings(Base):
    """
    Per-user app preferences (trading defaults + notification toggles).

    Stored as a single JSONB blob so new preferences never need a migration —
    the router merges the blob over typed defaults (see schemas/user_settings.py),
    mirroring how DisciplineRule keeps its values in a JSON `rule_value`.
    """
    __tablename__ = "user_settings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    data: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now(), nullable=False)

    user: Mapped["User"] = relationship("User", back_populates="settings")

    __table_args__ = (
        UniqueConstraint("user_id", name="uq_user_settings_user_id"),
        Index("idx_user_settings_tenant_id", "tenant_id"),
    )
