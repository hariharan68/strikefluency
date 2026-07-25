import uuid
from decimal import Decimal
from datetime import datetime, date
from typing import Optional
from sqlalchemy import (
    String, Integer, Numeric, Boolean, Date, Text, ForeignKey,
    CheckConstraint, UniqueConstraint, Index, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class Strategy(Base):
    """
    A multi-leg options strategy — the thing VirtualOrder/VirtualPosition could
    not represent (they enforce one-order-one-position via UniqueConstraint).

    Lives in DRAFT (editable, no capital) until executed, mirroring the in-memory
    app.strategy.domain.Strategy. On execution a StrategyPosition is created and
    the individual legs are also mirrored to VirtualOrder rows (tagged with
    strategy_id) so existing analytics/journal keep working.
    """
    __tablename__ = "strategies"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    account_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("virtual_accounts.id"), nullable=False)

    underlying: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    template_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="DRAFT", nullable=False)
    allow_calendar: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # INTRADAY strategies are auto-squared-off at EOD; NRML carry forward. Mirrored
    # to each leg's VirtualOrder so the EOD job treats legs consistently.
    product_type: Mapped[str] = mapped_column(String(10), default="INTRADAY", nullable=False)

    # Required at execution (discipline: MANDATORY_SETUP_TAG); null while a draft.
    setup_tag: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Snapshot of the payoff analytics at execution, for display without recompute.
    # NULL max_profit / max_loss means UNLIMITED (matches PayoffResult's None).
    net_premium: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    max_profit: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    max_loss: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)

    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now(), nullable=False)

    user: Mapped["User"] = relationship("User", back_populates="strategies")
    legs: Mapped[list["StrategyLeg"]] = relationship(
        "StrategyLeg", back_populates="strategy", order_by="StrategyLeg.created_at"
    )
    position: Mapped[Optional["StrategyPosition"]] = relationship(
        "StrategyPosition", back_populates="strategy", uselist=False
    )
    mirrored_orders: Mapped[list["VirtualOrder"]] = relationship(
        "VirtualOrder", back_populates="strategy"
    )

    __table_args__ = (
        CheckConstraint("status IN ('DRAFT', 'EXECUTED', 'CLOSED')", name="ck_strategies_status"),
        CheckConstraint("product_type IN ('INTRADAY', 'NRML')", name="ck_strategies_product_type"),
        Index("idx_strategies_user_id", "user_id"),
        Index("idx_strategies_tenant_id", "tenant_id"),
        Index("idx_strategies_user_status", "user_id", "status"),
    )


class StrategyLeg(Base):
    """
    One leg of a Strategy. Carries its own lot_size (snapshotted at creation) so
    historical P&L never re-values when a lot size is revised. strike_price is
    NULL for FUT legs.
    """
    __tablename__ = "strategy_legs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    strategy_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("strategies.id"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)

    instrument: Mapped[str] = mapped_column(String(20), nullable=False)
    expiry_date: Mapped[date] = mapped_column(Date, nullable=False)
    strike_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    instrument_type: Mapped[str] = mapped_column(String(3), nullable=False)
    action: Mapped[str] = mapped_column(String(4), nullable=False)
    lots: Mapped[int] = mapped_column(Integer, nullable=False)
    lot_size: Mapped[int] = mapped_column(Integer, nullable=False)

    entry_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    exit_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    status: Mapped[str] = mapped_column(String(10), default="PENDING", nullable=False)
    realized_pnl: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)

    opened_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    closed_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)

    strategy: Mapped["Strategy"] = relationship("Strategy", back_populates="legs")

    __table_args__ = (
        CheckConstraint("instrument_type IN ('CE', 'PE', 'FUT')", name="ck_strategy_legs_instrument_type"),
        CheckConstraint("action IN ('BUY', 'SELL')", name="ck_strategy_legs_action"),
        CheckConstraint("status IN ('PENDING', 'OPEN', 'CLOSED')", name="ck_strategy_legs_status"),
        CheckConstraint("lots > 0", name="ck_strategy_legs_lots_positive"),
        # An option leg must have a strike; a FUT leg must not.
        CheckConstraint(
            "(instrument_type = 'FUT' AND strike_price IS NULL) "
            "OR (instrument_type IN ('CE','PE') AND strike_price IS NOT NULL)",
            name="ck_strategy_legs_strike_matches_type",
        ),
        Index("idx_strategy_legs_strategy_id", "strategy_id"),
        Index("idx_strategy_legs_user_status", "user_id", "status"),
    )


class StrategyPosition(Base):
    """
    An executed Strategy with money attached — mirrors the in-memory
    app.strategy.domain.PaperPosition. One per executed strategy (UniqueConstraint).
    """
    __tablename__ = "strategy_positions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    strategy_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("strategies.id"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    account_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("virtual_accounts.id"), nullable=False)

    margin_blocked: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    realized_pnl: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    unrealized_pnl: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    brokerage: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)

    is_open: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    opened_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)
    closed_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)

    strategy: Mapped["Strategy"] = relationship("Strategy", back_populates="position")

    __table_args__ = (
        UniqueConstraint("strategy_id", name="uq_strategy_positions_strategy_id"),
        Index("idx_strategy_positions_user_open", "user_id", "is_open"),
        Index("idx_strategy_positions_tenant_id", "tenant_id"),
    )
