"""
app/market/websocket_manager.py
────────────────────────────────
Manages all active WebSocket connections. Global market data (chains, status,
metrics) is broadcast to every client; per-user trading events are sent only to
that user's sockets.

One manager instance is shared across the app (module-level singleton).
The market_scheduler calls manager.broadcast() on its ticks; routers and
scheduler jobs call manager.push_user_event() after a state change commits.

Connection lifecycle:
  Client connects → connect(ws, user_id)  → registered globally + per-user
  Client leaves   → disconnect(ws, user_id) → removed from all registries
  Dead connection → pruned silently on next send

Replay cache: the last frame of each (type, instrument) pair is kept so a
freshly connected client gets the current picture immediately instead of
waiting for the next tick. Only steady-state frame types are cached —
one-shot events like trading_update are never replayed.
"""

import asyncio
import logging
import uuid
from typing import Optional, Set

from fastapi import WebSocket

logger = logging.getLogger(__name__)

# Frame types cached for connect-replay. Keyed by (type, instrument) so a
# metrics frame can never clobber the cached chain for the same instrument.
REPLAY_TYPES = {"option_chain", "market_status", "option_metrics", "option_analytics"}

# Replay order: status first (cheap, orients the UI), then chains, then the
# heavier derived frames.
_REPLAY_ORDER = ["market_status", "option_chain", "option_metrics", "option_analytics"]


class ConnectionManager:

    def __init__(self):
        # All currently connected WebSocket clients (global broadcasts)
        self.active_connections: Set[WebSocket] = set()
        # Per-user registry (targeted trading events); a user may have many tabs
        self.user_connections: dict[uuid.UUID, Set[WebSocket]] = {}
        # Reverse map so pruning inside broadcast() can clean the user registry
        self._ws_user: dict[WebSocket, uuid.UUID] = {}
        # (type, instrument) -> last frame, for connect-replay
        self._replay_cache: dict[tuple, dict] = {}
        # Main event loop, captured at scheduler start — lets sync threadpool
        # code schedule sends without ever blocking on them.
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        """Capture the main event loop (call once from lifespan startup)."""
        self._loop = loop

    async def connect(self, websocket: WebSocket, user_id: uuid.UUID):
        """Accept a new connection, register it, and replay the latest frames."""
        await websocket.accept()
        self.active_connections.add(websocket)
        self.user_connections.setdefault(user_id, set()).add(websocket)
        self._ws_user[websocket] = user_id
        logger.info(f"WebSocket connected. Active: {len(self.active_connections)}")

        # Send cached frames immediately so the client doesn't wait for a tick.
        for frame_type in _REPLAY_ORDER:
            for (cached_type, _instrument), frame in list(self._replay_cache.items()):
                if cached_type != frame_type:
                    continue
                try:
                    await websocket.send_json(frame)
                except Exception:
                    pass

    def disconnect(self, websocket: WebSocket, user_id: Optional[uuid.UUID] = None):
        """Remove a client from every registry (safe to call repeatedly)."""
        self.active_connections.discard(websocket)
        uid = user_id or self._ws_user.pop(websocket, None)
        if user_id is not None:
            self._ws_user.pop(websocket, None)
        if uid is not None:
            sockets = self.user_connections.get(uid)
            if sockets is not None:
                sockets.discard(websocket)
                if not sockets:
                    del self.user_connections[uid]
        logger.info(f"WebSocket disconnected. Active: {len(self.active_connections)}")

    async def broadcast(self, data: dict):
        """
        Send a frame to all connected clients; cache replayable types.
        Dead connections are pruned from every registry.
        """
        frame_type = data.get("type", "")
        if frame_type in REPLAY_TYPES:
            self._replay_cache[(frame_type, data.get("instrument", ""))] = data

        if not self.active_connections:
            return

        dead: Set[WebSocket] = set()
        for websocket in self.active_connections.copy():
            try:
                await websocket.send_json(data)
            except Exception:
                dead.add(websocket)

        for websocket in dead:
            self.disconnect(websocket)
        if dead:
            logger.info(f"Removed {len(dead)} dead connections")

    async def send_to_user(self, user_id: uuid.UUID, event: dict):
        """Send an event to every socket the user has open (all tabs)."""
        sockets = self.user_connections.get(user_id)
        if not sockets:
            return
        dead: Set[WebSocket] = set()
        for websocket in sockets.copy():
            try:
                await websocket.send_json(event)
            except Exception:
                dead.add(websocket)
        for websocket in dead:
            self.disconnect(websocket, user_id)

    def push_user_event(self, user_id: uuid.UUID, event: dict) -> None:
        """
        Fire-and-forget a per-user event from ANY context — threadpool (sync
        routers) or the event loop itself. Never blocks, never raises: a push
        failure must not break the order flow that triggered it. No-ops when
        the loop isn't captured yet (tests) or the user has no open sockets.
        """
        loop = self._loop
        if loop is None or loop.is_closed():
            return
        if user_id not in self.user_connections:
            return
        try:
            # Safe from the loop thread too: schedules via call_soon_threadsafe
            # and we never await/inspect the returned Future.
            asyncio.run_coroutine_threadsafe(self.send_to_user(user_id, event), loop)
        except Exception:
            logger.debug("push_user_event dropped", exc_info=True)

    @property
    def connection_count(self) -> int:
        return len(self.active_connections)


# ── Module-level singleton ────────────────────────────────────
# Import this everywhere:  from app.market.websocket_manager import manager
manager = ConnectionManager()


def notify_trading_update(user_id: uuid.UUID, reason: str) -> None:
    """
    Tell a user's open tabs that their trading state changed (order placed or
    closed, strategy executed, …). Notify-then-refetch: no payload — clients
    re-run their REST loaders, which stay the single source of truth.
    Fire-and-forget; safe from sync routers and scheduler jobs alike.
    """
    from datetime import datetime, timezone
    manager.push_user_event(user_id, {
        "type": "trading_update",
        "reason": reason,
        "ts": datetime.now(timezone.utc).isoformat(),
    })
