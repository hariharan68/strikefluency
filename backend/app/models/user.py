import uuid
from datetime import datetime
from sqlalchemy import String, Boolean, ForeignKey, UniqueConstraint, Index, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(100), nullable=False)
    role: Mapped[str] = mapped_column(String(20), default="trader", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    token_version: Mapped[int] = mapped_column(default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now(), nullable=False
    )

    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="users")
    virtual_account: Mapped["VirtualAccount"] = relationship(
        "VirtualAccount", back_populates="user", uselist=False
    )
    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(
        "RefreshToken", back_populates="user"
    )
    virtual_orders: Mapped[list["VirtualOrder"]] = relationship(
        "VirtualOrder", back_populates="user"
    )
    discipline_rules: Mapped[list["DisciplineRule"]] = relationship(
        "DisciplineRule", back_populates="user"
    )
    discipline_violations: Mapped[list["DisciplineViolation"]] = relationship(
        "DisciplineViolation", back_populates="user"
    )
    discipline_scores: Mapped[list["DisciplineScore"]] = relationship(
        "DisciplineScore", back_populates="user"
    )
    trading_sessions: Mapped[list["TradingSession"]] = relationship(
        "TradingSession", back_populates="user"
    )
    journal_entries: Mapped[list["JournalEntry"]] = relationship(
        "JournalEntry", back_populates="user"
    )

    __table_args__ = (
        # Email is globally unique: one email = one account across all tenants.
        # Login and OAuth both look users up by email alone, so a per-tenant
        # constraint would let colliding emails make logins non-deterministic.
        UniqueConstraint("email", name="uq_users_email"),
        Index("idx_users_tenant_id", "tenant_id"),
    )
