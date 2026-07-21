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
"""

import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.constants import ExitReason, OrderStatus
from app.core.exceptions import OrderNotFoundError
from app.core.instruments import get_spec
from app.core.utils import current_trading_day
from app.database import get_db
from app.dependencies import CurrentUser
from app.market.websocket_manager import notify_trading_update
from app.models.virtual_account import VirtualAccount
from app.models.virtual_order import VirtualOrder
from app.models.virtual_position import VirtualPosition
from app.schemas.virtual_account import AccountSummaryResponse, VirtualAccountResponse
from app.schemas.virtual_order import (
    CloseOrderResponse,
    OrderListResponse,
    OrderResponse,
    PlaceOrderRequest,
)
from app.schemas.virtual_position import PositionListResponse, PositionResponse
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
    db: Session = Depends(get_db),
):
    """
    Place a new virtual order.

    Runs through the discipline engine before accepting.
    If any rule is violated → 400 with rule_code and message.

    Lot sizes: NIFTY=65, BANKNIFTY=30, SENSEX=20

    Example request:
    {
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

    order = place_order(db, current_user, order_dict)
    db.commit()
    db.refresh(order)

    notify_trading_update(current_user.id, "order_placed")
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
    db.commit()
    db.refresh(order)

    notify_trading_update(current_user.id, "order_closed")
    return CloseOrderResponse(
        order=OrderResponse.model_validate(order),
        net_pnl=order.pnl or Decimal("0"),
        message=f"Position closed. Net P&L: ₹{order.pnl}",
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