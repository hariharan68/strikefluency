---
title: The pending order book
description: Watching, cancelling and understanding resting limit orders.
status: stable
---

# The pending order book

Resting limit orders live under **Positions → Open Pending**, which has two sub-tabs.

## Open

Orders still waiting for their price.

| Column | Meaning |
|---|---|
| **Placed** | When you submitted it |
| **Instrument / Side / Product / Lots** | What you asked for |
| **Limit** | Your trigger price |
| **LTP** | The live premium right now |
| **To go** | Distance between LTP and your limit. Shows **Triggering** once reached |
| **Funds Held** | Margin blocked while it rests |
| **Status** | `PENDING` |
| **Cancel** | Cancels the order and releases the funds |

The **To go** column is the one to watch — it tells you how close you are without doing the arithmetic yourself.

## Executed

Everything that has left the pending state, with an **Outcome** column explaining why:

| Outcome | Meaning |
|---|---|
| `Limit reached — position opened` | It filled normally |
| `Unfilled at close` | The day ended before your price arrived |
| `Cancelled by you` | You cancelled it |
| A discipline reason | The rules failed on re-check at fill time |

## Order statuses

| Status | Meaning |
|---|---|
| `PENDING` | Resting, waiting for the trigger |
| `FILLED` | Triggered and opened a position |
| `CANCELLED` | You cancelled it |
| `EXPIRED` | Unfilled when the day ended |
| `REJECTED` | Failed the discipline re-check at fill time |

## Cancelling

Click **Cancel** on any open row. If *Confirm Before Closing* is enabled in Settings — it is on by default — you get a confirmation:

> Cancel this resting limit order? The blocked funds are released immediately.

Confirming releases the margin at once and you will see the toast *"Limit order cancelled — funds released"*.

## Funds are held, not spent

While an order rests, its margin is **blocked** and unavailable for other trades. This is the same as a real broker, and it is easy to forget: three resting orders can quietly consume most of your available capital without a single position being open.

Margin is released the moment an order fills, is cancelled, expires, or is rejected.

## The five-second scanner

The fill scanner runs every five seconds during market hours. Consequences worth internalising:

- A limit that becomes marketable fills on the **next scan**, not the same instant.
- A fast spike that touches your price and reverses within five seconds may not fill you. This mirrors real-world fill uncertainty rather than assuming a perfect touch-fill.
- Nothing fills outside 09:15–15:30 IST.
