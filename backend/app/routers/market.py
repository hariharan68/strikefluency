"""
app/routers/market.py
──────────────────────
Market data endpoints:

  GET /market/option-chain?instrument=NIFTY    → snapshot (REST)
  GET /market/spot?instrument=NIFTY            → spot price only
  GET /market/status                           → open/closed + IST time
  WS  /market/ws                              → live stream (WebSocket)

The WebSocket endpoint streams display-time option LTP updates every second.
The REST endpoints are for initial page load before WS connects.
"""

import logging
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.core.security_kernel import get_ws_user, require_dev_environment
from app.core.utils import get_ist_now, is_market_open
from app.dependencies import CurrentUser
from app.database import get_db
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
    snapshot = getattr(provider, "get_spot_snapshot", None)
    if callable(snapshot):
        return snapshot(instrument)
    spot = provider.get_spot_price(instrument)
    return {"instrument": instrument, "spot_price": spot}


@router.get("/status")
def get_market_status():
    """
    Returns whether market is open, current IST time,
    and which provider is active. Same payload the WS `market_status`
    frame carries — one source of truth in market_scheduler.
    """
    from app.market.market_scheduler import build_market_status
    return build_market_status()


def _kite_provider():
    provider = get_market_provider()
    if provider.__class__.__name__ != "KiteMarketDataProvider":
        raise HTTPException(status_code=409, detail="These market APIs require MARKET_DATA_PROVIDER=kite")
    return provider


def _parse_tokens(value: str) -> list[int]:
    try:
        tokens = list(dict.fromkeys(int(item.strip()) for item in value.split(",") if item.strip()))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="instrument_tokens must be comma-separated integers") from exc
    if not tokens or len(tokens) > 500:
        raise HTTPException(status_code=422, detail="Provide between 1 and 500 instrument tokens")
    return tokens


@router.get("/instruments/search")
def search_instruments(
    q: str = "",
    exchange: str | None = None,
    segment: str | None = None,
    instrument_type: str | None = None,
    expiry: date | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: CurrentUser = None,
):
    from app.services.kite_instrument_service import instrument_dict, search_instruments as search

    rows = search(
        db, q=q, exchange=exchange, segment=segment,
        instrument_type=instrument_type, expiry=expiry, limit=limit,
    )
    return {
        "data": [instrument_dict(row) for row in rows],
        "provider": "kite", "source": "kite_catalog",
        "as_of": datetime.now().astimezone().isoformat(), "age_ms": 0, "is_stale": False,
    }


@router.get("/quotes")
def get_quotes(
    instrument_tokens: str,
    current_user: CurrentUser = None,
):
    data = _kite_provider().quotes(_parse_tokens(instrument_tokens))
    meta = {key: data[0].get(key) for key in ("provider", "source", "as_of", "age_ms", "is_stale")} if data else {
        "provider": "kite", "source": "unavailable", "as_of": None, "age_ms": None, "is_stale": True,
    }
    return {"data": data, **meta}


@router.get("/ohlc")
def get_ohlc(
    instrument_tokens: str,
    current_user: CurrentUser = None,
):
    quotes = _kite_provider().quotes(_parse_tokens(instrument_tokens))
    data = [
        {
            "instrument_token": quote["instrument_token"],
            "ohlc": quote.get("ohlc") or {},
            **{key: quote.get(key) for key in ("provider", "source", "as_of", "age_ms", "is_stale")},
        }
        for quote in quotes
    ]
    meta = {key: quotes[0].get(key) for key in ("provider", "source", "as_of", "age_ms", "is_stale")} if quotes else {
        "provider": "kite", "source": "unavailable", "as_of": None, "age_ms": None, "is_stale": True,
    }
    return {"data": data, **meta}


@router.get("/depth")
def get_depth(
    instrument_tokens: str,
    current_user: CurrentUser = None,
):
    data = _kite_provider().depth(_parse_tokens(instrument_tokens))
    meta = {key: data[0].get(key) for key in ("provider", "source", "as_of", "age_ms", "is_stale")} if data else {
        "provider": "kite", "source": "unavailable", "as_of": None, "age_ms": None, "is_stale": True,
    }
    return {"data": data, **meta}


@router.get("/history/{instrument_token}")
def get_history(
    instrument_token: int,
    interval: str = Query(default="minute", pattern="^(minute|3minute|5minute|10minute|15minute|30minute|60minute|day)$"),
    from_: datetime = Query(alias="from"),
    to: datetime = Query(),
    continuous: bool = False,
    oi: bool = True,
    current_user: CurrentUser = None,
):
    if from_ >= to:
        raise HTTPException(status_code=422, detail="from must be earlier than to")
    try:
        return _kite_provider().historical(
            instrument_token, interval=interval, from_date=from_, to_date=to,
            continuous=continuous, oi=oi,
        )
    except RuntimeError as exc:
        code = 429 if "rate limit" in str(exc).lower() else 503
        raise HTTPException(status_code=code, detail=str(exc)) from exc


@router.get("/futures")
def get_futures(
    underlying: str = Query(pattern="^(NIFTY|BANKNIFTY|SENSEX)$"),
    expiry: date | None = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = None,
):
    payload = _kite_provider().get_futures(
        underlying, expiry.isoformat() if expiry else None,
    )
    return {"data": payload.pop("futures"), **payload}


@router.get("/expiries")
def get_expiries(
    underlying: str = Query(pattern="^(NIFTY|BANKNIFTY|SENSEX)$"),
    instrument_type: str = Query(default="OPT", pattern="^(OPT|FUT)$"),
    db: Session = Depends(get_db),
    current_user: CurrentUser = None,
):
    from app.services.kite_instrument_service import expiries

    return {
        "underlying": underlying,
        "instrument_type": instrument_type,
        "data": [value.isoformat() for value in expiries(db, underlying, instrument_type)],
        "provider": "kite", "source": "kite_catalog",
        "as_of": datetime.now().astimezone().isoformat(), "age_ms": 0, "is_stale": False,
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
      3. Every second: scheduler broadcasts new display-time option LTPs
      4. Client disconnects → server removes from active connections

    Data format received by client:
      {
        "type": "option_chain",
        "instrument": "NIFTY",
        "data": { ...canonical option chain format... }
      }
    """
    await manager.connect(websocket, user.id)
    logger.info(f"Market WebSocket connected. Total: {manager.connection_count}")

    try:
        # Keep connection alive — wait for client messages (ping/pong)
        while True:
            # Receive any message from client (e.g. subscribe to specific instrument)
            data = await websocket.receive_text()
            # For now we just acknowledge — subscription filtering is Phase 2
            await websocket.send_json({"type": "ack", "message": "received"})

    except WebSocketDisconnect:
        logger.info(f"Market WebSocket disconnected. Total: {manager.connection_count}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        manager.disconnect(websocket, user.id)

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
