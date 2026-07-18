"""
app/market/market_scheduler.py
───────────────────────────────
APScheduler job that fetches market data every 3 seconds
and broadcasts it to all connected WebSocket clients.

Only runs during market hours (09:15–15:30 IST, Mon–Fri).
In development mode: always runs regardless of market hours.

Started in main.py lifespan startup hook.
Stopped in main.py lifespan shutdown hook.
"""

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.core.utils import is_market_open
from app.market.provider_factory import get_market_provider
from app.market.websocket_manager import manager

logger = logging.getLogger(__name__)

# Instruments to broadcast
INSTRUMENTS = ["NIFTY", "BANKNIFTY", "SENSEX"]

# Scheduler instance (started/stopped in main.py)
scheduler = AsyncIOScheduler(timezone="Asia/Kolkata")


async def _tick():
    """
    Called every 3 seconds by the scheduler.
    Fetches option chain for each instrument and broadcasts to all clients.
    Skips if market is closed (unless in development) or no clients connected.
    """
    from app.config import settings

    # In development, always tick even outside market hours
    if not is_market_open() and not settings.is_development:
        return

    if manager.connection_count == 0:
        return

    provider = get_market_provider()

    for instrument in INSTRUMENTS:
        try:
            option_chain = provider.get_option_chain(instrument)

            await manager.broadcast({
                "type":       "option_chain",
                "instrument": instrument,
                "data":       option_chain,
            })

        except Exception as e:
            logger.error(f"Market data tick failed for {instrument}: {e}")


async def _mtm_tick():
    """
    Recompute unrealized P&L for every open strategy position, every 15s.

    Runs independently of WebSocket clients — the per-user MTM path is demand
    driven, so without this a strategy's live P&L would freeze whenever nobody
    had the desk open. Owns its own short-lived DB session.
    """
    from app.config import settings
    from app.database import SessionLocal
    from app.services.strategy_execution_service import mark_to_market_all

    if not is_market_open() and not settings.is_development:
        return

    db = SessionLocal()
    try:
        n = mark_to_market_all(db)
        db.commit()
        if n:
            logger.debug("MTM updated %d strategy position(s)", n)
    except Exception as e:
        db.rollback()
        logger.error("Strategy MTM tick failed: %s", e)
    finally:
        db.close()


async def _expiry_squareoff_tick():
    """
    On expiry day at EOD, cash-settle every open strategy whose leg expires today
    (index options are cash-settled). Runs once daily near market close.
    """
    from app.database import SessionLocal
    from app.services.strategy_execution_service import auto_square_off_expiry

    db = SessionLocal()
    try:
        n = auto_square_off_expiry(db)
        db.commit()
        if n:
            logger.info("Expiry auto square-off closed %d strategy position(s)", n)
    except Exception as e:
        db.rollback()
        logger.error("Expiry square-off failed: %s", e)
    finally:
        db.close()


def start_market_scheduler():
    """
    Start the market data scheduler.
    Call this in main.py lifespan startup.
    """
    scheduler.add_job(
        _tick,
        trigger="interval",
        seconds=3,
        id="market_data_tick",
        replace_existing=True,
        misfire_grace_time=5,
    )
    scheduler.add_job(
        _mtm_tick,
        trigger="interval",
        seconds=15,
        id="strategy_mtm_tick",
        replace_existing=True,
        misfire_grace_time=10,
    )
    from app.core.constants import EOD_SQUAREOFF_HOUR, EOD_SQUAREOFF_MINUTE
    scheduler.add_job(
        _expiry_squareoff_tick,
        trigger="cron",
        hour=EOD_SQUAREOFF_HOUR,
        minute=EOD_SQUAREOFF_MINUTE,
        id="strategy_expiry_squareoff",
        replace_existing=True,
        misfire_grace_time=60,
    )
    scheduler.start()
    logger.info("Market data scheduler started (3s data, 15s MTM, EOD expiry square-off)")


def stop_market_scheduler():
    """
    Stop the scheduler gracefully.
    Call this in main.py lifespan shutdown.
    """
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Market data scheduler stopped")
