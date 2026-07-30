"""
The trading events a client can be told about.

These were bare strings written inline at their call sites. A typo in any one
of them produced a frame the frontend silently ignored — no error, just a desk
that quietly stopped refreshing.

**The values are a wire contract.** `useMarketWebSocket.js` dispatches on
`msg.reason` and `tradingStore.bumpEvent(reason)` records it, so changing a
value here changes what the browser receives. Add members freely; do not rename
existing ones without changing the frontend in the same commit.

StrEnum rather than Enum so the members ARE strings: json.dumps serialises them
to their value with no encoder changes, and any lingering comparison against a
raw string still works.
"""

from enum import StrEnum


class TradingEvent(StrEnum):
    # Single orders — app/routers/trading.py
    ORDER_PLACED = "order_placed"
    ORDER_PROTECTION_UPDATED = "order_protection_updated"
    ORDER_CLOSED = "order_closed"
    LIMIT_PLACED = "limit_placed"
    LIMIT_CANCELLED = "limit_cancelled"

    # Scheduler sweeps — app/market/market_scheduler.py
    AUTO_EXIT = "auto_exit"
    LIMIT_FILLED = "limit_filled"
    LIMIT_REJECTED = "limit_rejected"

    # Multi-leg strategies — app/routers/strategy.py
    STRATEGY_EXECUTED = "strategy_executed"
    LEG_CLOSED = "leg_closed"
    STRATEGY_SQUAREOFF = "strategy_squareoff"
