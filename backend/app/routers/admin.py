"""
app/routers/admin.py
────────────────────
Read-only operator surface.

Deliberately read-only. Every mutating operation an admin might want already
exists behind a user-facing endpoint or belongs in psql, and a half-built
"adjust this user's balance" button is a far bigger liability than its absence.
If a write is ever added here it must post to virtual_fund_ledger and
audit_logs like anything else.

**Scoping is the security-critical part.** A tenant_admin sees only their own
tenant; only a super_admin sees across tenants. The scope is derived from the
authenticated admin's own row — never from a query parameter — so there is no
input that can widen it. This is the first place in the codebase where
`tenant_id` is actually used for read isolation rather than only being written.

Every route here carries CurrentAdmin. The Security Kernel audits routes at
import time, so an unauthenticated route added to this file does not fail a
test — it stops the application from booting at all.
"""

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.config import settings
from app.core.constants import PendingOrderStatus, UserRole
from app.core.utils import current_trading_day, is_market_open
from app.database import get_db
from app.dependencies import CurrentAdmin
from app.models.audit_log import AuditLog
from app.models.pending_order import PendingOrder
from app.models.portfolio_snapshot import PortfolioSnapshot
from app.models.trading_session import TradingSession
from app.models.user import User
from app.models.virtual_account import VirtualAccount
from app.models.virtual_fund_ledger import VirtualFundLedger
from app.models.virtual_position import VirtualPosition
from app.schemas.admin import (
    AdminOverview,
    AdminUserPage,
    AdminUserRow,
    AuditLogEntry,
    AuditLogPage,
    LedgerEntry,
    LedgerPage,
    SnapshotRow,
    SystemHealth,
)

router = APIRouter(prefix="/admin", tags=["Admin"])

_ZERO = Decimal("0.00")


# ── scoping ───────────────────────────────────────────────────

def _is_global(admin: User) -> bool:
    return admin.role == UserRole.SUPER_ADMIN


def _scoped(query, admin: User, model):
    """
    Restrict a query to what this admin may see.

    A tenant_admin is limited to their own tenant. The tenant comes from the
    admin's own row, so no request input can widen it.
    """
    if _is_global(admin):
        return query
    return query.filter(model.tenant_id == admin.tenant_id)


def _visible_user_ids(db: Session, admin: User) -> Optional[list[uuid.UUID]]:
    """The users in scope, or None meaning 'all' for a super_admin."""
    if _is_global(admin):
        return None
    return [
        row[0] for row in
        db.query(User.id).filter(User.tenant_id == admin.tenant_id).all()
    ]


def _restrict(query, model, user_ids: Optional[list[uuid.UUID]]):
    if user_ids is None:
        return query
    if not user_ids:
        # An empty tenant must return nothing, not everything.
        return query.filter(model.user_id.is_(None))
    return query.filter(model.user_id.in_(user_ids))


# ── overview ──────────────────────────────────────────────────

@router.get("/overview", response_model=AdminOverview)
def overview(current_admin: CurrentAdmin, db: Session = Depends(get_db)):
    """Counts across everything this admin can see."""
    user_ids = _visible_user_ids(db, current_admin)
    today = current_trading_day()
    since = datetime.now(timezone.utc) - timedelta(hours=24)

    users_q = _scoped(db.query(User), current_admin, User)
    accounts_q = _scoped(db.query(VirtualAccount), current_admin, VirtualAccount)

    positions = _restrict(
        db.query(VirtualPosition).filter(VirtualPosition.is_open == True),  # noqa: E712
        VirtualPosition, user_ids,
    ).all()
    limits = _restrict(
        db.query(PendingOrder).filter(
            PendingOrder.status == PendingOrderStatus.PENDING),
        PendingOrder, user_ids,
    ).count()

    accounts = accounts_q.all()
    blocked = sum((Decimal(str(p.margin_blocked)) for p in positions), _ZERO)
    unrealized = sum((Decimal(str(p.unrealized_pnl)) for p in positions), _ZERO)
    balance = sum((Decimal(str(a.balance)) for a in accounts), _ZERO)

    sessions = _restrict(
        db.query(TradingSession).filter(TradingSession.session_date == today),
        TradingSession, user_ids,
    ).all()

    audits = _restrict(
        db.query(AuditLog).filter(AuditLog.created_at >= since),
        AuditLog, user_ids,
    )

    return AdminOverview(
        scope="global" if _is_global(current_admin) else "tenant",
        tenant_id=None if _is_global(current_admin) else current_admin.tenant_id,
        users=users_q.count(),
        active_users=users_q.filter(User.is_active == True).count(),  # noqa: E712
        accounts=len(accounts),
        open_positions=len(positions),
        resting_limits=limits,
        trades_today=sum(s.trades_count for s in sessions),
        realized_pnl_today=sum(
            (Decimal(str(s.realized_pnl)) for s in sessions), _ZERO),
        total_equity=balance + blocked + unrealized,
        discipline_mode_off=sum(
            1 for a in accounts if not a.discipline_mode_enabled),
        # Failed logins carry no user_id when the email is unknown, so they are
        # only visible globally — a tenant admin cannot attribute them anyway.
        failed_logins_24h=audits.filter(AuditLog.action == "LOGIN_FAILED").count(),
        rejected_orders_24h=audits.filter(AuditLog.action == "ORDER_REJECTED").count(),
    )


# ── audit trail ───────────────────────────────────────────────

@router.get("/audit", response_model=AuditLogPage)
def audit_trail(
    current_admin: CurrentAdmin,
    db: Session = Depends(get_db),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    action: Optional[str] = Query(default=None),
    outcome: Optional[str] = Query(default=None, pattern="^(SUCCESS|FAILURE)$"),
    user_id: Optional[uuid.UUID] = Query(default=None),
):
    """
    The read surface for audit_logs, which until now was queryable only in psql.

    Newest first. A tenant_admin sees only rows attributable to their tenant,
    which excludes unattributable failed logins — those are a global concern.
    """
    query = _scoped(db.query(AuditLog), current_admin, AuditLog)
    if action:
        query = query.filter(AuditLog.action == action)
    if outcome:
        query = query.filter(AuditLog.outcome == outcome)
    if user_id:
        query = query.filter(AuditLog.user_id == user_id)

    total = query.count()
    rows = (
        query.order_by(AuditLog.seq.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return AuditLogPage(
        entries=[AuditLogEntry.model_validate(r) for r in rows],
        total=total, page=page, page_size=page_size,
    )


# ── users ─────────────────────────────────────────────────────

@router.get("/users", response_model=AdminUserPage)
def users(
    current_admin: CurrentAdmin,
    db: Session = Depends(get_db),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    search: Optional[str] = Query(default=None, max_length=200),
):
    """Users in scope, with their account state."""
    query = _scoped(db.query(User), current_admin, User)
    if search:
        pattern = f"%{search.strip().lower()}%"
        query = query.filter(
            func.lower(User.email).like(pattern)
            | func.lower(User.full_name).like(pattern)
        )

    total = query.count()
    rows = (
        query.order_by(User.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    ids = [u.id for u in rows]
    accounts = {
        a.user_id: a for a in
        db.query(VirtualAccount).filter(VirtualAccount.user_id.in_(ids)).all()
    } if ids else {}
    open_counts = dict(
        db.query(VirtualPosition.user_id, func.count(VirtualPosition.id))
        .filter(VirtualPosition.user_id.in_(ids),
                VirtualPosition.is_open == True)  # noqa: E712
        .group_by(VirtualPosition.user_id).all()
    ) if ids else {}

    out = []
    for user in rows:
        account = accounts.get(user.id)
        out.append(AdminUserRow(
            id=user.id, email=user.email, full_name=user.full_name,
            role=user.role, is_active=user.is_active, created_at=user.created_at,
            balance=account.balance if account else None,
            tier=account.tier if account else None,
            discipline_score=account.discipline_score if account else None,
            discipline_mode_enabled=(
                account.discipline_mode_enabled if account else None),
            open_positions=open_counts.get(user.id, 0),
        ))
    return AdminUserPage(users=out, total=total, page=page, page_size=page_size)


# ── ledger ────────────────────────────────────────────────────

@router.get("/ledger", response_model=LedgerPage)
def ledger(
    current_admin: CurrentAdmin,
    db: Session = Depends(get_db),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    user_id: Optional[uuid.UUID] = Query(default=None),
):
    """
    The funds ledger, newest first.

    When scoped to a single user, `reconciles` reports whether that account's
    balance still equals the sum of its ledger rows — the invariant the whole
    table exists to make checkable.
    """
    query = _scoped(db.query(VirtualFundLedger), current_admin, VirtualFundLedger)
    if user_id:
        query = query.filter(VirtualFundLedger.user_id == user_id)

    total = query.count()
    rows = (
        query.order_by(VirtualFundLedger.seq.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    reconciles = None
    if user_id:
        account = _scoped(
            db.query(VirtualAccount).filter(VirtualAccount.user_id == user_id),
            current_admin, VirtualAccount,
        ).first()
        if account is None:
            raise HTTPException(status_code=404, detail="Account not found")
        summed = db.query(
            func.coalesce(func.sum(VirtualFundLedger.amount), 0)
        ).filter(VirtualFundLedger.account_id == account.id).scalar()
        reconciles = Decimal(str(account.balance)) == Decimal(str(summed))

    return LedgerPage(
        entries=[LedgerEntry.model_validate(r) for r in rows],
        total=total, page=page, page_size=page_size, reconciles=reconciles,
    )


# ── snapshots ─────────────────────────────────────────────────

@router.get("/snapshots", response_model=list[SnapshotRow])
def snapshots(
    current_admin: CurrentAdmin,
    db: Session = Depends(get_db),
    user_id: Optional[uuid.UUID] = Query(default=None),
    days: int = Query(default=30, ge=1, le=365),
):
    """Daily portfolio snapshots — the equity curve, oldest first."""
    query = _scoped(db.query(PortfolioSnapshot), current_admin, PortfolioSnapshot)
    if user_id:
        query = query.filter(PortfolioSnapshot.user_id == user_id)
    rows = (
        query.order_by(PortfolioSnapshot.snapshot_date.desc())
        .limit(days if user_id else days * 20)
        .all()
    )
    return [SnapshotRow.model_validate(r) for r in reversed(rows)]


# ── system health ─────────────────────────────────────────────

@router.get("/health", response_model=SystemHealth)
def system_health(current_admin: CurrentAdmin, db: Session = Depends(get_db)):
    """Operational state: provider, scheduler leadership, sockets, migration."""
    from app.market.market_scheduler import state_job_leadership
    from app.market.provider_factory import get_market_provider
    from app.market.websocket_manager import manager

    provider = get_market_provider()
    try:
        connected = bool(provider.is_connected())
    except Exception:  # noqa: BLE001 — health must not 500 on a broker hiccup
        connected = False

    try:
        head = db.execute(text("SELECT version_num FROM alembic_version")).scalar()
    except Exception:  # noqa: BLE001
        head = None

    return SystemHealth(
        environment=settings.ENVIRONMENT,
        market_provider=settings.MARKET_DATA_PROVIDER,
        provider_connected=connected,
        market_open=is_market_open(),
        redis_configured=bool(settings.REDIS_URL),
        scheduler_leader=state_job_leadership.is_leader(),
        websocket_connections=manager.connection_count,
        alembic_head=head,
    )
