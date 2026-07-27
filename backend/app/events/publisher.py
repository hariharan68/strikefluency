"""
app/events/publisher.py
───────────────────────
Emitting trading events to connected clients.

Two rules the codebase already followed by convention, made explicit here:

**1. Post-commit only.** An event announces something durable. Emitting from
inside a transaction risks telling a user their order filled and then rolling
it back. Every existing call site already published after `db.commit()`; this
module keeps that a rule rather than a habit — see DeferredPublisher for the
scheduler case, where the commit happens far from the notification.

**2. No payload.** `publish(user_id, event)` takes no third argument, so there
is nowhere to put one. Clients re-run their REST loaders on notification, which
keeps REST the single source of truth and avoids two divergent representations
of a position. This is why the signature is shaped the way it is, and the
constraint is worth preserving.
"""

import logging
import uuid
from datetime import datetime, timezone

from app.events.event_types import TradingEvent
from app.market.websocket_manager import manager, notify_trading_update

logger = logging.getLogger(__name__)

__all__ = ["publish", "DeferredPublisher", "notify_trading_update"]


def publish(user_id: uuid.UUID, event: TradingEvent) -> None:
    """
    Tell one user something happened. Fire-and-forget; never raises.

    Call only after the transaction that made it true has committed.
    """
    notify_trading_update(user_id, str(event))


class DeferredPublisher:
    """
    Collect events during work, emit them only once the work is durable.

    The scheduler sweeps cannot publish inline: `scan_and_exit` runs inside a
    transaction the caller commits afterwards, so an inline push would announce
    exits that a later exception rolls back. Both sweeps were hand-rolling the
    same list-then-drain-or-clear dance; this names it.

        events = DeferredPublisher()
        try:
            scan_and_exit(db, on_close=lambda uid, _: events.collect(uid, TradingEvent.AUTO_EXIT))
            db.commit()
        except Exception:
            db.rollback()
            events.discard()     # nothing committed — announce nothing
        finally:
            db.close()
        events.flush()           # safe: discard() left it empty

    `flush()` after `discard()` is a no-op, so the ordering above is safe even
    when the exception path runs.
    """

    def __init__(self) -> None:
        self._pending: list[tuple[uuid.UUID, TradingEvent]] = []

    def collect(self, user_id: uuid.UUID, event: TradingEvent) -> None:
        self._pending.append((user_id, event))

    def discard(self) -> None:
        """Drop everything — the transaction did not commit."""
        self._pending.clear()

    def flush(self) -> None:
        """Emit and clear. Individual failures never block the rest."""
        pending, self._pending = self._pending, []
        now = datetime.now(timezone.utc).isoformat()
        for user_id, event in pending:
            try:
                manager.push_user_event(user_id, {
                    "type": "trading_update",
                    "reason": str(event),
                    "ts": now,
                })
            except Exception:  # noqa: BLE001 — notification must never break a sweep
                logger.debug("Dropped %s for user %s", event, user_id, exc_info=True)

    def __len__(self) -> int:
        return len(self._pending)
