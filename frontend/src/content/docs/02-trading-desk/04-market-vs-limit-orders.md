---
title: Market vs limit orders
description: How each order type fills, and why a limit order is checked for discipline twice.
status: stable
---

# Market vs limit orders

## Market orders

A market order fills immediately at the live premium, with simulated slippage applied.

Sequence:

1. The discipline engine checks the order.
2. Margin is blocked.
3. The order fills at the live premium adjusted for slippage.
4. Entry brokerage is debited straight away.
5. A position opens.

If the quote is stale at the moment you submit, the order is refused with a *quote unavailable* error rather than filling at a price nobody can vouch for.

## Limit orders

A limit order does **not** fill on submission. It **rests** in the pending order book until the premium reaches your price.

Trigger conditions:

| Side | Fills when |
|---|---|
| **BUY** | Premium falls **to or below** your limit |
| **SELL** | Premium rises **to or above** your limit |

Sequence:

1. The discipline engine checks the order.
2. Margin is blocked and held — priced off your limit.
3. The order rests with status `PENDING`.
4. A scanner runs **every five seconds**, checking whether the premium has reached your limit.
5. When it has, the discipline engine runs **again**, and if it still passes, the order fills and a position opens.

### Why discipline runs twice

This is the important subtlety. Time passes between placing a limit order and it filling, and your situation can change in that gap. You might have hit your daily trade limit, breached your loss cap, or triggered a revenge cooldown by stopping out of something else.

So the rules are re-evaluated at fill time. If they now fail, the order does not fill — it becomes `REJECTED` with the reason, and your margin is released.

This is deliberate. A limit order placed at 09:30 should not be able to sneak past a loss cap you hit at 11:00.

### A limit that is already at market

If you set a buy limit above the current premium, it is immediately marketable. The ticket warns you, and the order will fill on the next scan — which means **up to five seconds later**, not instantly. It is still a resting order that happens to trigger straight away.

### Validity

All limit orders are **DAY** orders. Anything unfilled at the close is expired by the pre-market cleanup at 08:30 the next trading day, and its margin released.

## Which to use

**Market** when you want in now and are willing to pay the spread and slippage.

**Limit** when you have a level in mind and are willing to miss the trade rather than chase it. For practising discipline, limit orders are the better teacher — they force you to decide your price in advance rather than reacting to a moving number.

See [The pending order book](/docs/the-pending-order-book) for managing resting orders.
