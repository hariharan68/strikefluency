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

import asyncio
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.core.utils import get_ist_now, is_market_open
from app.market.provider_factory import get_market_provider
from app.market.websocket_manager import manager

logger = logging.getLogger(__name__)

# Instruments to broadcast
INSTRUMENTS = ["NIFTY", "BANKNIFTY", "SENSEX"]

# Scheduler instance (started/stopped in main.py)
scheduler = AsyncIOScheduler(timezone="Asia/Kolkata")


def build_market_status() -> dict:
    """
    The market-status payload. Single source of truth: served by
    GET /market/status AND broadcast as the WS `market_status` frame,
    so REST and WS can never drift.
    """
    now_ist = get_ist_now()
    provider = get_market_provider()
    return {
        "is_open":      is_market_open(),
        "time_ist":     now_ist.strftime("%H:%M:%S"),
        "date_ist":     now_ist.strftime("%Y-%m-%d"),
        "provider":     type(provider).__name__,
        "connected":    provider.is_connected(),
        "market_open":  "09:15",
        "market_close": "15:30",
    }


async def _tick():
    """
    Called every 3 seconds by the scheduler.
    Broadcasts market status (always — the closed/open badge must stay live
    off-hours), then option chains for each instrument during market hours
    (or always in development). Skips entirely when no clients are connected.
    """
    from app.config import settings

    if manager.connection_count == 0:
        return

    try:
        await manager.broadcast({"type": "market_status", "data": build_market_status()})
    except Exception as e:
        logger.error(f"Market status broadcast failed: {e}")

    # In development, always tick even outside market hours
    if not is_market_open() and not settings.is_development:
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


async def _metrics_tick():
    """
    Every 15 seconds: compute the option intelligence (metrics + per-leg
    analytics chain) for each instrument's default expiry and broadcast both.
    One chain build feeds both frames; the per-strike IV inversion runs in a
    worker thread so it never blocks the event loop that carries the 3s tick.
    """
    from app.config import settings
    from fastapi.encoders import jsonable_encoder
    from app.services.options_service import get_snapshot

    if manager.connection_count == 0:
        return
    if not is_market_open() and not settings.is_development:
        return

    for instrument in INSTRUMENTS:
        try:
            metrics, chain = await asyncio.to_thread(get_snapshot, instrument)
            await manager.broadcast({
                "type": "option_metrics",
                "instrument": instrument,
                "data": jsonable_encoder(metrics),
            })
            await manager.broadcast({
                "type": "option_analytics",
                "instrument": instrument,
                "data": jsonable_encoder(chain),
            })
        except Exception as e:
            logger.error(f"Metrics tick failed for {instrument}: {e}")


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


async def _auto_exit_tick():
    """
    Enforce stop-loss / target on open single-leg virtual orders, every 5s.

    A user's SL is only a promise until something honours it — this closes any
    order whose premium has crossed its level, whether or not the desk is open.
    Runs independently of connected WebSocket clients for exactly that reason.
    Owns its own short-lived DB session.
    """
    from datetime import datetime, timezone

    from app.config import settings
    from app.database import SessionLocal
    from app.services.auto_exit_service import scan_and_exit

    if not is_market_open() and not settings.is_development:
        return

    closed_events: list[tuple] = []
    db = SessionLocal()
    try:
        n = scan_and_exit(db, on_close=lambda uid, reason: closed_events.append((uid, reason)))
        db.commit()
        if n:
            logger.info("Auto-exit closed %d order(s) on SL/target", n)
    except Exception as e:
        db.rollback()
        closed_events.clear()   # nothing committed — don't announce phantom exits
        logger.error("Auto-exit tick failed: %s", e)
    finally:
        db.close()

    # Notify affected users only AFTER the commit — fire-and-forget.
    for uid, _reason in closed_events:
        manager.push_user_event(uid, {
            "type": "trading_update",
            "reason": "auto_exit",
            "ts": datetime.now(timezone.utc).isoformat(),
        })


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


async def _intraday_squareoff_tick():
    """
    At EOD (15:29 IST), close every OPEN INTRADAY position at the live price and
    cash-settle standalone options that expire today. NRML positions carry
    forward. Runs once daily near market close.
    """
    from app.database import SessionLocal
    from app.services.eod_service import square_off_intraday, settle_expiring_options

    db = SessionLocal()
    try:
        n = square_off_intraday(db)
        m = settle_expiring_options(db)
        db.commit()
        if n or m:
            logger.info("EOD square-off: %d intraday position(s), %d expiring option(s)", n, m)
    except Exception as e:
        db.rollback()
        logger.error("Intraday square-off failed: %s", e)
    finally:
        db.close()


async def _premarket_reset_tick():
    """
    At 08:30 IST (before the 09:15 open), a safety net: force-close any INTRADAY
    position still OPEN from a prior trading day using the last stored price.
    Also marks the logical start of the new trading day.
    """
    from app.database import SessionLocal
    from app.services.eod_service import premarket_reset

    db = SessionLocal()
    try:
        n = premarket_reset(db)
        db.commit()
        if n:
            logger.info("Pre-market reset: closed %d stale intraday position(s)", n)
    except Exception as e:
        db.rollback()
        logger.error("Pre-market reset failed: %s", e)
    finally:
        db.close()


def start_market_scheduler():
    """
    Start the market data scheduler.
    Call this in main.py lifespan startup.
    """
    # Called from the async lifespan, so a loop is running. Capturing it here
    # lets sync threadpool code (routers) fire-and-forget per-user WS events.
    try:
        manager.set_loop(asyncio.get_running_loop())
    except RuntimeError:
        # No running loop (bare sync caller, e.g. some test setups) — per-user
        # pushes silently no-op, everything else works.
        pass

    scheduler.add_job(
        _tick,
        trigger="interval",
        seconds=3,
        id="market_data_tick",
        replace_existing=True,
        misfire_grace_time=5,
    )
    scheduler.add_job(
        _metrics_tick,
        trigger="interval",
        seconds=15,
        id="option_metrics_tick",
        replace_existing=True,
        misfire_grace_time=10,
    )
    scheduler.add_job(
        _mtm_tick,
        trigger="interval",
        seconds=15,
        id="strategy_mtm_tick",
        replace_existing=True,
        misfire_grace_time=10,
    )
    scheduler.add_job(
        _auto_exit_tick,
        trigger="interval",
        seconds=5,
        id="auto_exit_tick",
        replace_existing=True,
        misfire_grace_time=5,
    )
    from app.core.constants import (
        EOD_SQUAREOFF_HOUR, EOD_SQUAREOFF_MINUTE,
        PRE_MARKET_RESET_HOUR, PRE_MARKET_RESET_MINUTE,
    )
    scheduler.add_job(
        _expiry_squareoff_tick,
        trigger="cron",
        hour=EOD_SQUAREOFF_HOUR,
        minute=EOD_SQUAREOFF_MINUTE,
        id="strategy_expiry_squareoff",
        replace_existing=True,
        misfire_grace_time=60,
    )
    scheduler.add_job(
        _intraday_squareoff_tick,
        trigger="cron",
        hour=EOD_SQUAREOFF_HOUR,
        minute=EOD_SQUAREOFF_MINUTE,
        id="intraday_squareoff",
        replace_existing=True,
        misfire_grace_time=60,
    )
    scheduler.add_job(
        _premarket_reset_tick,
        trigger="cron",
        hour=PRE_MARKET_RESET_HOUR,
        minute=PRE_MARKET_RESET_MINUTE,
        id="premarket_reset",
        replace_existing=True,
        misfire_grace_time=300,
    )
    scheduler.start()
    logger.info(
        "Market data scheduler started (3s data, 15s MTM, 5s auto-exit, "
        "15:29 EOD square-off [expiry + intraday], 08:30 pre-market reset)"
    )


def stop_market_scheduler():
    """
    Stop the scheduler gracefully.
    Call this in main.py lifespan shutdown.
    """
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Market data scheduler stopped")
