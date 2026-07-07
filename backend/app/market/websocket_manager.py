"""
app/market/websocket_manager.py
────────────────────────────────
Manages all active WebSocket connections and broadcasts
market data to every connected client simultaneously.

One manager instance is shared across the app (module-level singleton).
The market_scheduler calls manager.broadcast() every 3 seconds.
Each connected React client receives the update instantly.

Connection lifecycle:
  Client connects → ws.connect()  → added to active_connections
  Client leaves   → ws.disconnect() → removed from active_connections
  Dead connection → removed silently on next broadcast
"""

import json
import logging
from typing import Set

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:

    def __init__(self):
        # All currently connected WebSocket clients
        self.active_connections: Set[WebSocket] = set()

        # Cache last broadcast so new clients get data immediately on connect
        self._latest_nifty:     dict | None = None
        self._latest_banknifty: dict | None = None
        self._latest_sensex:    dict | None = None

    async def connect(self, websocket: WebSocket):
        """Accept a new WebSocket connection and send latest data immediately."""
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info(f"WebSocket connected. Active: {len(self.active_connections)}")

        # Send cached data immediately so the client doesn't wait for next tick
        for cached in [self._latest_nifty, self._latest_banknifty, self._latest_sensex]:
            if cached:
                try:
                    await websocket.send_json(cached)
                except Exception:
                    pass

    def disconnect(self, websocket: WebSocket):
        """Remove a disconnected client."""
        self.active_connections.discard(websocket)
        logger.info(f"WebSocket disconnected. Active: {len(self.active_connections)}")

    async def broadcast(self, data: dict):
        """
        Send data to all connected clients.
        Dead connections are silently removed.

        Args:
            data : dict with keys: type, instrument, data (option chain)
        """
        # Cache by instrument
        instrument = data.get("instrument", "")
        if instrument == "NIFTY":
            self._latest_nifty = data
        elif instrument == "BANKNIFTY":
            self._latest_banknifty = data
        elif instrument == "SENSEX":
            self._latest_sensex = data

        if not self.active_connections:
            return

        dead_connections: Set[WebSocket] = set()

        for websocket in self.active_connections.copy():
            try:
                await websocket.send_json(data)
            except Exception:
                # Client disconnected without proper close handshake
                dead_connections.add(websocket)

        # Remove dead connections
        self.active_connections -= dead_connections
        if dead_connections:
            logger.info(f"Removed {len(dead_connections)} dead connections")

    @property
    def connection_count(self) -> int:
        return len(self.active_connections)


# ── Module-level singleton ────────────────────────────────────
# Import this everywhere:  from app.market.websocket_manager import manager
manager = ConnectionManager()