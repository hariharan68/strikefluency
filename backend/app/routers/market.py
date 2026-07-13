"""
app/routers/market.py
──────────────────────
Market data endpoints:

  GET /market/option-chain?instrument=NIFTY    → snapshot (REST)
  GET /market/spot?instrument=NIFTY            → spot price only
  GET /market/status                           → open/closed + IST time
  WS  /market/ws                              → live stream (WebSocket)

The WebSocket endpoint streams option chain updates every 3 seconds.
The REST endpoints are for initial page load before WS connects.
"""

import logging

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect

from app.core.security_kernel import get_ws_user, require_dev_environment
from app.core.utils import get_ist_now, is_market_open
from app.dependencies import CurrentUser
from app.market.provider_factory import get_market_provider
from app.market.websocket_manager import manager
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/market", tags=["Market Data"])

VALID_INSTRUMENTS = ["NIFTY", "BANKNIFTY", "SENSEX"]


@router.get("/option-chain")
def get_option_chain(
    instrument: str = Query(default="NIFTY", enum=VALID_INSTRUMENTS),
    current_user: CurrentUser = None,
):
    """
    Get current option chain snapshot (REST).
    Used for initial page load before WebSocket connects.
    Returns canonical option chain format.
    """
    provider = get_market_provider()
    data = provider.get_option_chain(instrument)
    return {"success": True, "data": data}


@router.get("/spot")
def get_spot_price(
    instrument: str = Query(default="NIFTY", enum=VALID_INSTRUMENTS),
    current_user: CurrentUser = None,
):
    """Get spot price for an instrument."""
    provider = get_market_provider()
    spot = provider.get_spot_price(instrument)
    return {"instrument": instrument, "spot_price": spot}


@router.get("/status")
def get_market_status():
    """
    Returns whether market is open, current IST time,
    and which provider is active.
    """
    now_ist = get_ist_now()
    provider = get_market_provider()

    return {
        "is_open":     is_market_open(),
        "time_ist":    now_ist.strftime("%H:%M:%S"),
        "date_ist":    now_ist.strftime("%Y-%m-%d"),
        "provider":    type(provider).__name__,
        "connected":   provider.is_connected(),
        "market_open": "09:15",
        "market_close": "15:30",
    }


@router.websocket("/ws")
async def websocket_market(websocket: WebSocket, user: User = Depends(get_ws_user)):
    """
    WebSocket endpoint for live market data streaming.

    Connection flow:
      1. Client connects to ws://…/api/v1/market/ws?token=<access JWT>
         (browsers cannot send Authorization headers on WS upgrade,
         so the kernel's get_ws_user dependency authenticates the
         token from the query string BEFORE the connection is accepted)
      2. Server accepts + sends latest cached data immediately
      3. Every 3 seconds: scheduler broadcasts new option chain data
      4. Client disconnects → server removes from active connections

    Data format received by client:
      {
        "type": "option_chain",
        "instrument": "NIFTY",
        "data": { ...canonical option chain format... }
      }
    """
    await manager.connect(websocket)
    logger.info(f"Market WebSocket connected. Total: {manager.connection_count}")

    try:
        # Keep connection alive — wait for client messages (ping/pong)
        while True:
            # Receive any message from client (e.g. subscribe to specific instrument)
            data = await websocket.receive_text()
            # For now we just acknowledge — subscription filtering is Phase 2
            await websocket.send_json({"type": "ack", "message": "received"})

    except WebSocketDisconnect:
        manager.disconnect(websocket)
        logger.info(f"Market WebSocket disconnected. Total: {manager.connection_count}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)

@router.get("/debug/raw-fyers", dependencies=[Depends(require_dev_environment)])
def debug_raw_fyers(current_user: CurrentUser = None):
    """Temporary — see exactly what Fyers returns. Delete after debugging."""
    from app.config import settings
    from fyers_apiv3 import fyersModel

    fyers = fyersModel.FyersModel(
        client_id=settings.FYERS_APP_ID,
        is_async=False,
        token=settings.FYERS_ACCESS_TOKEN,
        log_path="",
    )

    payload = {
        "symbol": "NSE:NIFTY50-INDEX",
        "strikecount": 5,
        "timestamp": ""
    }

    response = fyers.optionchain(data=payload)
    return response   # returns the raw Fyers JSON
