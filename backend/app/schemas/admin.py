"""Response models for the read-only admin surface."""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict


class AdminOverview(BaseModel):
    """Counts across the admin's visible scope."""
    scope: str                  # "tenant" or "global"
    tenant_id: Optional[uuid.UUID] = None

    users: int
    active_users: int
    accounts: int
    open_positions: int
    resting_limits: int

    trades_today: int
    realized_pnl_today: Decimal
    total_equity: Decimal

    discipline_mode_off: int    # accounts running free-play
    failed_logins_24h: int
    rejected_orders_24h: int


class AuditLogEntry(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    seq: int
    user_id: Optional[uuid.UUID] = None
    action: str
    outcome: str
    reference_type: Optional[str] = None
    reference_id: Optional[uuid.UUID] = None
    detail: dict
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    created_at: datetime


class AuditLogPage(BaseModel):
    entries: list[AuditLogEntry]
    total: int
    page: int
    page_size: int


class AdminUserRow(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: str
    is_active: bool
    created_at: datetime

    balance: Optional[Decimal] = None
    tier: Optional[str] = None
    discipline_score: Optional[Decimal] = None
    discipline_mode_enabled: Optional[bool] = None
    open_positions: int = 0


class AdminUserPage(BaseModel):
    users: list[AdminUserRow]
    total: int
    page: int
    page_size: int


class LedgerEntry(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    seq: int
    user_id: uuid.UUID
    transaction_type: str
    amount: Decimal
    balance_before: Decimal
    balance_after: Decimal
    reference_type: Optional[str] = None
    reference_id: Optional[uuid.UUID] = None
    description: str
    created_at: datetime


class LedgerPage(BaseModel):
    entries: list[LedgerEntry]
    total: int
    page: int
    page_size: int
    reconciles: Optional[bool] = None   # only set when scoped to one user


class SnapshotRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: uuid.UUID
    snapshot_date: date
    balance: Decimal
    margin_blocked: Decimal
    unrealized_pnl: Decimal
    realized_pnl_today: Decimal
    equity: Decimal
    open_positions: int
    trades_today: int


class SystemHealth(BaseModel):
    environment: str
    market_provider: str
    provider_connected: bool
    market_open: bool
    redis_configured: bool
    scheduler_leader: bool
    websocket_connections: int
    alembic_head: Optional[str] = None
