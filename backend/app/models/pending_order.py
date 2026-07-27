import uuid
from decimal import Decimal
from datetime import datetime, date
from typing import Optional
from sqlalchemy import String, Integer, Numeric, Date, ForeignKey, CheckConstraint, Index, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class PendingOrder(Base):
    """
    A resting LIMIT order — the intent to trade, not the trade itself.

    A MARKET order becomes a VirtualOrder immediately. A LIMIT order lands here
    first and waits until the option premium reaches `limit_price`; only then
    does the fill scanner create the real VirtualOrder + VirtualPosition. That
    separation is deliberate: every downstream system (orderbook, auto-exit,
    EOD square-off, journal, analytics) keeps working on VirtualOrder untouched,
    because a pending order is not yet a position.

    Funds are blocked at placement (margin_blocked) and released on fill,
    cancel, expiry or rejection, so a resting order can never promise capital
    the account does not have.
    """

    __tablename__ = "pending_orders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    account_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("virtual_accounts.id"), nullable=False)
    # Supplied by the client for retry-safe placement, and reused as the filled
    # order's client_order_id so a fill is idempotent end to end.
    client_order_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)

    instrument: Mapped[str] = mapped_column(String(20), default="NIFTY", nullable=False)
    expiry_date: Mapped[date] = mapped_column(Date, nullable=False)
    strike_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    option_type: Mapped[str] = mapped_column(String(2), nullable=False)
    action: Mapped[str] = mapped_column(String(4), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    lot_size: Mapped[int] = mapped_column(Integer, default=50, nullable=False)
    product_type: Mapped[str] = mapped_column(String(10), default="INTRADAY", nullable=False)

    # The price this order is waiting for, and the premium when it was placed
    # (kept for display: "placed at 107.85, waiting for 95.00").
    limit_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    placed_ltp: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    sl_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    target_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    setup_tag: Mapped[str] = mapped_column(String(30), nullable=False)

    status: Mapped[str] = mapped_column(String(20), default="PENDING", nullable=False)
    # Funds reserved while this order rests; zeroed the moment it leaves PENDING.
    margin_blocked: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    # The trading day this order belongs to — limit orders are DAY validity and
    # are expired at EOD, mirroring the orderbook's 08:30 IST reset boundary.
    trading_day: Mapped[date] = mapped_column(Date, nullable=False)

    # Set once the limit triggers and the real order is created.
    filled_order_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("virtual_orders.id"), nullable=True
    )
    fill_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    filled_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    closed_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    # Why a triggered order could not be placed (discipline rule, funds, quote).
    reject_reason: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)

    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)

    user: Mapped["User"] = relationship("User")
    account: Mapped["VirtualAccount"] = relationship("VirtualAccount")
    filled_order: Mapped[Optional["VirtualOrder"]] = relationship("VirtualOrder")

    __table_args__ = (
        CheckConstraint("option_type IN ('CE', 'PE')", name="ck_pending_orders_option_type"),
        CheckConstraint("action IN ('BUY', 'SELL')", name="ck_pending_orders_action"),
        CheckConstraint(
            "status IN ('PENDING', 'FILLED', 'CANCELLED', 'EXPIRED', 'REJECTED')",
            name="ck_pending_orders_status",
        ),
        CheckConstraint("product_type IN ('INTRADAY', 'NRML')", name="ck_pending_orders_product_type"),
        CheckConstraint("quantity > 0", name="ck_pending_orders_quantity_positive"),
        CheckConstraint("limit_price > 0", name="ck_pending_orders_limit_positive"),
        UniqueConstraint("user_id", "client_order_id", name="uq_pending_orders_user_client_order"),
        Index("idx_pending_orders_user_id", "user_id"),
        Index("idx_pending_orders_status", "status"),
        Index("idx_pending_orders_user_status", "user_id", "status"),
        Index("idx_pending_orders_user_trading_day", "user_id", "trading_day"),
    )
