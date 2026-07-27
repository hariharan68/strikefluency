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

from app.config import settings
from app.core.utils import get_ist_now, is_market_open
from app.market.provider_factory import get_market_provider
from app.market.websocket_manager import manager
from app.services.scheduler_leadership import SchedulerLeadership

logger = logging.getLogger(__name__)

# Instruments to broadcast
INSTRUMENTS = ["NIFTY", "BANKNIFTY", "SENSEX"]

# Scheduler instance (started/stopped in main.py)
scheduler = AsyncIOScheduler(timezone="Asia/Kolkata")
state_job_leadership = SchedulerLeadership(
    settings.REDIS_URL,
    ttl_seconds=settings.SCHEDULER_LEADER_TTL_SECONDS,
    # Local mock/Fyers/Nuvama development normally runs one Uvicorn worker.
    # Keep scheduled paper-trading state healthy when Docker/Redis is offline,
    # while production and Kite remain fail-closed.
    allow_local_fallback=(
        settings.is_development
        and settings.MARKET_DATA_PROVIDER != "kite"
    ),
)


def build_market_status() -> dict:
    """
    The market-status payload. Single source of truth: served by
    GET /market/status AND broadcast as the WS `market_status` frame,
    so REST and WS can never drift.
    """
    now_ist = get_ist_now()
    provider = get_market_provider()
    status = {
        "is_open":      is_market_open(),
        "time_ist":     now_ist.strftime("%H:%M:%S"),
        "date_ist":     now_ist.strftime("%Y-%m-%d"),
        "provider":     type(provider).__name__,
        "connected":    provider.is_connected(),
        "market_open":  "09:15",
        "market_close": "15:30",
    }
    provider_status = getattr(provider, "provider_status", None)
    if callable(provider_status):
        status.update(provider_status())
    return status


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
        status = build_market_status()
        await manager.broadcast({"type": "market_status", "data": status})
        if status.get("selected_provider") == "kite":
            await manager.broadcast({"type": "broker_status", "data": status})
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


async def _limit_fill_tick():
    """
    Fill resting LIMIT orders whose premium has reached the limit, every 5s.

    A limit order is a promise about a price the user is not watching for — this
    is what honours it. Runs independently of connected WebSocket clients, for
    the same reason the auto-exit scanner does.

    Unlike the other state jobs, scan_and_fill owns its own transaction and
    commits per order, so a rejection at trigger persists without discarding the
    fills that already succeeded in the same sweep.
    """
    from datetime import datetime, timezone

    from app.config import settings
    from app.database import SessionLocal
    from app.services.pending_order_service import scan_and_fill

    if not is_market_open() and not settings.is_development:
        return

    fill_events: list[tuple] = []
    db = SessionLocal()
    try:
        n = scan_and_fill(db, on_fill=lambda uid, reason: fill_events.append((uid, reason)))
        if n:
            logger.info("Limit scanner filled %d resting order(s)", n)
    except Exception as e:
        db.rollback()
        fill_events.clear()   # nothing committed — don't announce phantom fills
        logger.error("Limit fill tick failed: %s", e)
    finally:
        db.close()

    # scan_and_fill commits as it goes, so these are already durable.
    for uid, reason in fill_events:
        manager.push_user_event(uid, {
            "type": "trading_update",
            "reason": reason,
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
    from app.services.pending_order_service import expire_pending_orders

    db = SessionLocal()
    try:
        n = square_off_intraday(db)
        m = settle_expiring_options(db)
        # Limit orders are DAY validity — nothing rests overnight.
        p = expire_pending_orders(db)
        db.commit()
        if n or m or p:
            logger.info(
                "EOD square-off: %d intraday position(s), %d expiring option(s), "
                "%d unfilled limit order(s) expired", n, m, p,
            )
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
    from app.core.utils import current_trading_day
    from app.database import SessionLocal
    from app.services.eod_service import premarket_reset
    from app.services.pending_order_service import expire_pending_orders

    db = SessionLocal()
    try:
        n = premarket_reset(db)
        # Safety net for limit orders stranded by a missed EOD run. Scoped to
        # earlier trading days so a fresh morning's orders are never touched.
        p = expire_pending_orders(db, before_trading_day=current_trading_day())
        db.commit()
        if n or p:
            logger.info(
                "Pre-market reset: closed %d stale intraday position(s), "
                "expired %d stale limit order(s)", n, p,
            )
    except Exception as e:
        db.rollback()
        logger.error("Pre-market reset failed: %s", e)
    finally:
        db.close()


async def _kite_instrument_sync_tick():
    """Refresh the daily catalog at 08:30 only when Kite has a valid token."""
    from app.config import settings
    if settings.MARKET_DATA_PROVIDER != "kite":
        return
    from app.database import SessionLocal
    from app.services import kite_auth_service as auth
    from app.services.kite_instrument_service import sync_instruments

    token = auth.get_saved_access_token()
    if not token:
        return
    db = SessionLocal()
    try:
        result = await asyncio.to_thread(sync_instruments, db, auth._kite(token))
        logger.info("Kite instrument catalog synced: %d rows", result["synced"])
    except Exception as exc:
        db.rollback()
        logger.error("Kite instrument sync failed; previous catalog retained: %s", exc)
    finally:
        db.close()


async def _daily_snapshot_tick():
    """
    Capture each account's closing portfolio and per-position marks.

    Scheduled after the 15:29 square-off so intraday positions are already
    settled and what remains is genuine carry-forward. Leader-gated like every
    other state job — two workers writing this would race on the unique
    constraint rather than duplicating, but only one should be doing the work.
    """
    from app.database import SessionLocal
    from app.services.snapshot_service import capture_daily_snapshots

    db = SessionLocal()
    try:
        n = capture_daily_snapshots(db)
        db.commit()
        if n:
            logger.info("Daily snapshot captured for %d account(s)", n)
    except Exception as e:
        db.rollback()
        logger.error("Daily snapshot failed: %s", e)
    finally:
        db.close()


async def _run_state_job(job, name: str):
    """Run a database-mutating job only in the elected API process."""
    if not state_job_leadership.is_leader():
        logger.debug("Skipping %s in non-leader scheduler process", name)
        return
    await job()


async def _leader_mtm_tick():
    await _run_state_job(_mtm_tick, "strategy_mtm_tick")


async def _leader_auto_exit_tick():
    await _run_state_job(_auto_exit_tick, "auto_exit_tick")


async def _leader_limit_fill_tick():
    await _run_state_job(_limit_fill_tick, "limit_fill_tick")


async def _leader_expiry_squareoff_tick():
    await _run_state_job(_expiry_squareoff_tick, "strategy_expiry_squareoff")


async def _leader_intraday_squareoff_tick():
    await _run_state_job(_intraday_squareoff_tick, "intraday_squareoff")


async def _leader_daily_snapshot_tick():
    await _run_state_job(_daily_snapshot_tick, "daily_snapshot")


async def _leader_premarket_reset_tick():
    await _run_state_job(_premarket_reset_tick, "premarket_reset")


async def _leader_kite_instrument_sync_tick():
    await _run_state_job(_kite_instrument_sync_tick, "kite_instrument_sync")


def start_market_scheduler():
    """
    Start the market data scheduler.
    Call this in main.py lifespan startup.
    """
    if scheduler.running:
        return

    state_job_leadership.start()

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
        _leader_mtm_tick,
        trigger="interval",
        seconds=15,
        id="strategy_mtm_tick",
        replace_existing=True,
        misfire_grace_time=10,
    )
    scheduler.add_job(
        _leader_auto_exit_tick,
        trigger="interval",
        seconds=5,
        id="auto_exit_tick",
        replace_existing=True,
        misfire_grace_time=5,
    )
    scheduler.add_job(
        _leader_limit_fill_tick,
        trigger="interval",
        seconds=5,
        id="limit_fill_tick",
        replace_existing=True,
        misfire_grace_time=5,
    )
    from app.core.constants import (
        EOD_SQUAREOFF_HOUR, EOD_SQUAREOFF_MINUTE,
        PRE_MARKET_RESET_HOUR, PRE_MARKET_RESET_MINUTE,
    )
    scheduler.add_job(
        _leader_expiry_squareoff_tick,
        trigger="cron",
        hour=EOD_SQUAREOFF_HOUR,
        minute=EOD_SQUAREOFF_MINUTE,
        id="strategy_expiry_squareoff",
        replace_existing=True,
        misfire_grace_time=60,
    )
    scheduler.add_job(
        _leader_intraday_squareoff_tick,
        trigger="cron",
        hour=EOD_SQUAREOFF_HOUR,
        minute=EOD_SQUAREOFF_MINUTE,
        id="intraday_squareoff",
        replace_existing=True,
        misfire_grace_time=60,
    )
    # Six minutes after the 15:29 square-off, so intraday positions are settled
    # and only genuine carry-forward is marked.
    scheduler.add_job(
        _leader_daily_snapshot_tick,
        trigger="cron",
        hour=EOD_SQUAREOFF_HOUR,
        minute=EOD_SQUAREOFF_MINUTE + 6,
        id="daily_snapshot",
        replace_existing=True,
        misfire_grace_time=600,
    )
    scheduler.add_job(
        _leader_premarket_reset_tick,
        trigger="cron",
        hour=PRE_MARKET_RESET_HOUR,
        minute=PRE_MARKET_RESET_MINUTE,
        id="premarket_reset",
        replace_existing=True,
        misfire_grace_time=300,
    )
    scheduler.add_job(
        _leader_kite_instrument_sync_tick,
        trigger="cron",
        hour=8,
        minute=30,
        id="kite_instrument_sync",
        replace_existing=True,
        misfire_grace_time=900,
    )
    scheduler.start()
    logger.info(
        "Market data scheduler started (3s data, 15s MTM, 5s auto-exit, "
        "5s limit fill, 15:29 EOD square-off [expiry + intraday + limit expiry], "
        "08:30 pre-market reset)"
    )


def stop_market_scheduler():
    """
    Stop the scheduler gracefully.
    Call this in main.py lifespan shutdown.
    """
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Market data scheduler stopped")
    state_job_leadership.stop()
