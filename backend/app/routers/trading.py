"""
app/routers/trading.py
───────────────────────
Virtual trading endpoints:

  GET  /trading/account           → account balance + discipline summary
  POST /trading/orders            → place a new virtual order
  GET  /trading/orders            → orderbook (today by default; ?scope=all)
  GET  /trading/tradebook         → today's executed trades (?scope=all)
  GET  /trading/orders/{id}       → single order detail
  POST /trading/orders/{id}/close → close an open position manually
  GET  /trading/positions         → all open positions with live P&L
  GET  /trading/sessions/today    → today's trading session state

  POST /trading/pending             → park a LIMIT order in the pending book
  GET  /trading/pending             → the pending book (?view=open|executed|all)
  POST /trading/pending/{id}/cancel → withdraw a resting limit order
"""

import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.orm import Session

from app.core.constants import ExitReason, OrderStatus, PendingOrderStatus
from app.core.exceptions import (
    DisciplineViolationError,
    InsufficientBalanceError,
    OrderNotFoundError,
)
from app.core.instruments import get_spec
from app.core.utils import current_trading_day
from app.database import get_db
from app.dependencies import CurrentUser
from app.events import TradingEvent, publish
from app.models.pending_order import PendingOrder
from app.models.virtual_account import VirtualAccount
from app.models.virtual_order import VirtualOrder
from app.models.virtual_position import VirtualPosition
from app.schemas.pending_order import (
    CancelPendingOrderResponse,
    PendingOrderListResponse,
    PendingOrderResponse,
    PlacePendingOrderRequest,
)
from app.schemas.virtual_account import AccountSummaryResponse, VirtualAccountResponse
from app.schemas.virtual_order import (
    CloseOrderResponse,
    OrderListResponse,
    OrderResponse,
    PlaceOrderRequest,
)
from app.schemas.virtual_position import PositionListResponse, PositionResponse
from app.services import audit_service
from app.services.audit_service import AuditAction, AuditRef
from app.services.pending_order_service import (
    cancel_pending_order,
    place_pending_order,
)
from app.services.trading_session_service import (
    get_cooldown_remaining,
    get_or_create_today,
    check_and_reset_cooldown,
)
from app.services.virtual_order_service import (
    close_position,
    get_open_positions,
    place_order,
)

router = APIRouter(prefix="/trading", tags=["Virtual Trading"])


# ── Account ───────────────────────────────────────────────────

@router.get("/account", response_model=AccountSummaryResponse)
def get_account(
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Get virtual account summary including balance, tier,
    discipline score, and today's session state.
    """
    account = db.query(VirtualAccount).filter(
        VirtualAccount.user_id == current_user.id
    ).first()

    session = get_or_create_today(db, current_user)
    db.commit()

    # Calculate total unrealized P&L across open positions
    open_positions = get_open_positions(db, current_user)
    total_unrealized = sum(p.unrealized_pnl for p in open_positions)

    cooldown_remaining = get_cooldown_remaining(session) if session.is_cooldown_active else 0

    return AccountSummaryResponse(
        account=VirtualAccountResponse.model_validate(account),
        today_trades=session.trades_count,
        today_realized_pnl=session.realized_pnl,
        total_unrealized_pnl=Decimal(str(total_unrealized)),
        is_cooldown_active=session.is_cooldown_active,
        cooldown_remaining_seconds=cooldown_remaining,
    )


# ── Orders ────────────────────────────────────────────────────

@router.post("/orders", response_model=OrderResponse, status_code=201)
def place_new_order(
    data: PlaceOrderRequest,
    current_user: CurrentUser,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """
    Place a new virtual order.

    Runs through the discipline engine before accepting.
    If any rule is violated → 400 with rule_code and message.

    Lot sizes: NIFTY=65, BANKNIFTY=30, SENSEX=20

    Example request:
    {
        "client_order_id": "62a1b0dd-2287-44c4-8cc5-9310720d0d6f",
        "instrument":   "NIFTY",
        "expiry_date":  "2026-07-10",
        "strike_price": 22150,
        "option_type":  "CE",
        "action":       "BUY",
        "quantity":     1,
        "sl_price":     130.00,
        "target_price": 200.00,
        "setup_tag":    "OI_BASED"
    }
    """
    order_dict = {
        "client_order_id": data.client_order_id,
        "instrument":   data.instrument,
        "expiry_date":  data.expiry_date,
        "strike_price": data.strike_price,
        "option_type":  data.option_type,
        "action":       data.action,
        "quantity":     data.quantity,
        # Snapshotted onto the order row, never re-read afterwards: a trade
        # placed today keeps its lot size even after SEBI revises it.
        "lot_size":     get_spec(data.instrument).lot_size,
        "product_type": data.product_type,
        "sl_price":     data.sl_price,
        "target_price": data.target_price,
        "setup_tag":    data.setup_tag,
    }

    try:
        order = place_order(db, current_user, order_dict)
    except (DisciplineViolationError, InsufficientBalanceError) as exc:
        # record_now, not record: the router is about to roll back, and a
        # blocked trade is worth more in the trail than a successful one.
        audit_service.record_now(
            action=AuditAction.ORDER_REJECTED,
            user_id=current_user.id, tenant_id=current_user.tenant_id,
            detail={
                "reason": type(exc).__name__,
                "message": str(exc)[:300],
                "rule_code": getattr(exc, "rule_code", None),
                "instrument": data.instrument,
                "strike": data.strike_price,
                "option_type": data.option_type,
                "action": data.action,
            },
            ip_address=audit_service.client_ip(request), user_agent=request.headers.get("user-agent"),
        )
        raise

    was_replayed = getattr(order, "_idempotent_replay", False)
    if not was_replayed:
        audit_service.record(
            db, action=AuditAction.ORDER_PLACED,
            user_id=current_user.id, tenant_id=current_user.tenant_id,
            reference_type=AuditRef.VIRTUAL_ORDER, reference_id=order.id,
            detail={
                "instrument": order.instrument,
                "strike": str(order.strike_price),
                "option_type": order.option_type,
                "side": order.action,
                "quantity": order.quantity,
                "fill_price": str(order.entry_price),
                "entry_brokerage": str(order.entry_brokerage),
            },
            ip_address=audit_service.client_ip(request), user_agent=request.headers.get("user-agent"),
        )
    db.commit()
    db.refresh(order)

    if was_replayed:
        response.status_code = 200
    else:
        publish(current_user.id, TradingEvent.ORDER_PLACED)
    return OrderResponse.model_validate(order)


@router.get("/orders", response_model=OrderListResponse)
def list_orders(
    current_user: CurrentUser,
    db: Session = Depends(get_db),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    status: str = Query(default=None),
    scope: str = Query(default="today", pattern="^(today|all)$"),
):
    """
    The orderbook. Lists orders for the current user, newest first.

    scope=today (default) → only the current trading day's orders, so the
    orderbook resets each morning at the 08:30 IST boundary. scope=all returns
    the full history (used for analytics-style views). Filter by status:
    OPEN | CLOSED | SL_HIT | TARGET_HIT | CANCELLED.
    """
    query = db.query(VirtualOrder).filter(
        VirtualOrder.user_id == current_user.id
    )

    if scope == "today":
        query = query.filter(VirtualOrder.trading_day == current_trading_day())

    if status:
        query = query.filter(VirtualOrder.status == status.upper())

    total = query.count()
    orders = (
        query.order_by(VirtualOrder.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return OrderListResponse(
        orders=[OrderResponse.model_validate(o) for o in orders],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/tradebook", response_model=OrderListResponse)
def list_tradebook(
    current_user: CurrentUser,
    db: Session = Depends(get_db),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    scope: str = Query(default="today", pattern="^(today|all)$"),
):
    """
    The tradebook — executed (no longer OPEN) orders, newest first.

    scope=today (default) shows only the current trading day's fills, so it
    resets each morning like the orderbook; scope=all returns full trade history.
    """
    query = db.query(VirtualOrder).filter(
        VirtualOrder.user_id == current_user.id,
        VirtualOrder.status != OrderStatus.OPEN,
    )

    if scope == "today":
        query = query.filter(VirtualOrder.trading_day == current_trading_day())

    total = query.count()
    orders = (
        query.order_by(VirtualOrder.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return OrderListResponse(
        orders=[OrderResponse.model_validate(o) for o in orders],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/orders/{order_id}", response_model=OrderResponse)
def get_order(
    order_id: uuid.UUID,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Get a single order by ID."""
    order = db.query(VirtualOrder).filter(
        VirtualOrder.id == order_id,
        VirtualOrder.user_id == current_user.id,
    ).first()

    if not order:
        raise OrderNotFoundError(f"Order {order_id} not found")

    return OrderResponse.model_validate(order)


@router.post("/orders/{order_id}/close", response_model=CloseOrderResponse)
def close_order(
    order_id: uuid.UUID,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Manually close an open position.
    Fetches current LTP, applies slippage, calculates P&L,
    releases margin, and creates journal entry automatically.
    """
    order = close_position(
        db=db,
        user=current_user,
        order_id=order_id,
        exit_reason=ExitReason.MANUAL,
    )
    audit_service.record(
        db, action=AuditAction.ORDER_CLOSED,
        user_id=current_user.id, tenant_id=current_user.tenant_id,
        reference_type=AuditRef.VIRTUAL_ORDER, reference_id=order.id,
        detail={
            "exit_price": str(order.exit_price),
            "pnl": str(order.pnl),
            "exit_reason": order.exit_reason,
        },
    )
    db.commit()
    db.refresh(order)

    publish(current_user.id, TradingEvent.ORDER_CLOSED)
    return CloseOrderResponse(
        order=OrderResponse.model_validate(order),
        net_pnl=order.pnl or Decimal("0"),
        message=f"Position closed. Net P&L: ₹{order.pnl}",
    )


# ── Pending (resting LIMIT) orders ────────────────────────────

@router.post("/pending", response_model=PendingOrderResponse, status_code=201)
def place_new_pending_order(
    data: PlacePendingOrderRequest,
    current_user: CurrentUser,
    response: Response,
    db: Session = Depends(get_db),
):
    """
    Park a LIMIT order in the pending book.

    Unlike POST /orders, this does NOT open a position. The order rests until
    the option premium reaches `limit_price` — a BUY fills at the limit or
    cheaper, a SELL at the limit or richer — at which point the fill scanner
    creates the real order and position. Margin is blocked now and released if
    the order is cancelled, expires at EOD, or is rejected at trigger.

    Discipline rules run here and again at the fill.
    """
    order_dict = {
        "client_order_id": data.client_order_id,
        "instrument":   data.instrument,
        "expiry_date":  data.expiry_date,
        "strike_price": data.strike_price,
        "option_type":  data.option_type,
        "action":       data.action,
        "quantity":     data.quantity,
        # Snapshotted onto the row, never re-read: a limit placed today keeps
        # its lot size even if SEBI revises it before the order fills.
        "lot_size":     get_spec(data.instrument).lot_size,
        "product_type": data.product_type,
        "limit_price":  data.limit_price,
        "sl_price":     data.sl_price,
        "target_price": data.target_price,
        "setup_tag":    data.setup_tag,
    }

    pending = place_pending_order(db, current_user, order_dict)
    was_replayed = getattr(pending, "_idempotent_replay", False)
    if not was_replayed:
        audit_service.record(
            db, action=AuditAction.LIMIT_PLACED,
            user_id=current_user.id, tenant_id=current_user.tenant_id,
            reference_type=AuditRef.PENDING_ORDER, reference_id=pending.id,
            detail={
                "instrument": pending.instrument,
                "strike": str(pending.strike_price),
                "option_type": pending.option_type,
                "side": pending.action,
                "quantity": pending.quantity,
                "limit_price": str(pending.limit_price),
            },
        )
    db.commit()
    db.refresh(pending)

    if was_replayed:
        response.status_code = 200
    else:
        publish(current_user.id, TradingEvent.LIMIT_PLACED)
    return PendingOrderResponse.model_validate(pending)


@router.get("/pending", response_model=PendingOrderListResponse)
def list_pending_orders(
    current_user: CurrentUser,
    db: Session = Depends(get_db),
    view: str = Query(default="all", pattern="^(open|executed|all)$"),
    scope: str = Query(default="today", pattern="^(today|all)$"),
):
    """
    The pending book, newest first.

    view=open     → still resting, waiting for the limit
    view=executed → everything that has left the book (filled, cancelled,
                    expired, rejected)
    view=all      → both, with counts for each

    scope=today (default) matches the orderbook's 08:30 IST reset boundary.
    """
    base = db.query(PendingOrder).filter(PendingOrder.user_id == current_user.id)
    if scope == "today":
        base = base.filter(PendingOrder.trading_day == current_trading_day())

    open_count = base.filter(PendingOrder.status == PendingOrderStatus.PENDING).count()
    executed_count = base.filter(
        PendingOrder.status.in_(PendingOrderStatus.CLOSED_STATES)
    ).count()

    query = base
    if view == "open":
        query = query.filter(PendingOrder.status == PendingOrderStatus.PENDING)
    elif view == "executed":
        query = query.filter(PendingOrder.status.in_(PendingOrderStatus.CLOSED_STATES))

    rows = query.order_by(PendingOrder.created_at.desc()).all()

    return PendingOrderListResponse(
        pending_orders=[PendingOrderResponse.model_validate(r) for r in rows],
        total=len(rows),
        open_count=open_count,
        executed_count=executed_count,
    )


@router.post("/pending/{pending_id}/cancel", response_model=CancelPendingOrderResponse)
def cancel_resting_order(
    pending_id: uuid.UUID,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Withdraw a resting limit order before it triggers and release its margin."""
    pending = cancel_pending_order(db, current_user, pending_id)
    # The row's reservation is zeroed by the cancel, so read the amount the
    # service carried out-of-band before db.refresh() drops the attribute.
    released = Decimal(str(getattr(pending, "_released_margin", 0) or 0))
    audit_service.record(
        db, action=AuditAction.LIMIT_CANCELLED,
        user_id=current_user.id, tenant_id=current_user.tenant_id,
        reference_type=AuditRef.PENDING_ORDER, reference_id=pending.id,
        detail={"margin_released": str(released)},
    )
    db.commit()
    db.refresh(pending)

    publish(current_user.id, TradingEvent.LIMIT_CANCELLED)
    return CancelPendingOrderResponse(
        pending_order=PendingOrderResponse.model_validate(pending),
        margin_released=released,
        message="Limit order cancelled. Blocked funds released.",
    )


# ── Positions ─────────────────────────────────────────────────

@router.get("/positions", response_model=PositionListResponse)
def get_positions(
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Get all currently open positions with live unrealized P&L.
    """
    positions = get_open_positions(db, current_user)

    total_unrealized = sum(p.unrealized_pnl for p in positions)
    total_margin     = sum(p.margin_blocked for p in positions)

    return PositionListResponse(
        positions=[PositionResponse.model_validate(p) for p in positions],
        total_unrealized_pnl=Decimal(str(total_unrealized)),
        total_margin_blocked=Decimal(str(total_margin)),
    )


# ── Session ───────────────────────────────────────────────────

@router.get("/sessions/today")
def get_today_session(
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Get today's trading session — trade count, P&L, cooldown state.
    Used by the frontend to show discipline status in real time.
    """
    session = get_or_create_today(db, current_user)
    check_and_reset_cooldown(session)
    db.commit()

    cooldown_remaining = get_cooldown_remaining(session)

    return {
        "session_date":              str(session.session_date),
        "trades_count":              session.trades_count,
        "realized_pnl":              str(session.realized_pnl),
        "is_cooldown_active":        session.is_cooldown_active,
        "cooldown_until":            session.cooldown_until.isoformat() if session.cooldown_until else None,
        "cooldown_remaining_seconds": cooldown_remaining,
        "last_sl_hit_at":            session.last_sl_hit_at.isoformat() if session.last_sl_hit_at else None,
    }
