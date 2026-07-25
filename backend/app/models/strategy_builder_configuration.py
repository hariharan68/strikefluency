"""Persisted Strategy Builder workspaces.

These rows are deliberately separate from ``strategies``.  A saved setup is a
reusable editor snapshot; executing it must create a new operational Strategy
instead of consuming the saved definition.
"""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, Index, Integer, String, ForeignKey, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class StrategyBuilderConfiguration(Base):
    __tablename__ = "strategy_builder_configurations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False
    )
    kind: Mapped[str] = mapped_column(String(12), nullable=False)
    name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    underlying: Mapped[str] = mapped_column(String(20), nullable=False)
    schema_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    state: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        CheckConstraint(
            "kind IN ('SAVED','DRAFT')",
            name="ck_strategy_builder_configurations_kind",
        ),
        CheckConstraint(
            "underlying IN ('NIFTY','BANKNIFTY','SENSEX')",
            name="ck_strategy_builder_configurations_underlying",
        ),
        Index(
            "idx_strategy_builder_configs_user_kind_updated",
            "user_id",
            "kind",
            "updated_at",
        ),
        Index(
            "idx_strategy_builder_configs_tenant",
            "tenant_id",
        ),
    )
