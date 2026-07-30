"""
app/events/
───────────
A named home for the trading events pushed to connected clients.

Deliberately small. Publisher and consumer are the same process, and
`notify_trading_update` was already a one-line indirection over the WebSocket
manager, so a dispatcher here would be ceremony rather than decoupling. What
this package actually buys:

  - typed event names instead of free-text strings scattered across two
    routers, a service and the scheduler
  - one named implementation of the collect-then-emit-after-commit pattern that
    market_scheduler was hand-rolling twice
  - a seam for a second transport (Redis pub/sub fan-out) if multiple workers
    ever arrive

There is deliberately no consumer.py and no dispatcher. Add one when a second
subscriber exists, not before.
"""

from app.events.event_types import TradingEvent
from app.events.publisher import DeferredPublisher, publish

__all__ = ["TradingEvent", "DeferredPublisher", "publish"]
