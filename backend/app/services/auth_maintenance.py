from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.database import SessionLocal
from app.services.token_service import cleanup_refresh_tokens

_scheduler = AsyncIOScheduler(timezone="UTC")


def _cleanup_job() -> None:
    db = SessionLocal()
    try:
        cleanup_refresh_tokens(db)
        db.commit()
    finally:
        db.close()


def start_auth_maintenance() -> None:
    if _scheduler.running:
        return
    _scheduler.add_job(_cleanup_job, CronTrigger(hour=3, minute=15), id="refresh-token-cleanup", replace_existing=True)
    _scheduler.start()


def stop_auth_maintenance() -> None:
    if _scheduler.running:
        _scheduler.shutdown(wait=False)
