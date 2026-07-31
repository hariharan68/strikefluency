---
title: Live positions
description: The positions workspace, its five tabs and what each metric means.
status: stable
---

# Live positions

The positions workspace is available two ways: from **Positions** in the sidebar, or as the **Positions** tab on the trading desk. They are the same screen.

## Metric cards

Four numbers across the top:

| Card | Meaning |
|---|---|
| **Open P&L** | Unrealised profit on open positions. Flagged `Live · 1s` when the feed is fresh, `Last price` otherwise |
| **Booked P&L (Today)** | Realised profit from positions closed today |
| **Capital Used** | Margin currently blocked, and what percentage of your capital that is |
| **Risk at Stop** | What you lose if every stop-loss hits. Flagged `Protected`, `Review` or `No exposure` |

**Risk at Stop** is the most underused number here. It answers "if everything goes wrong right now, what does it cost me?" — which is the question position sizing is supposed to answer and rarely does.

A `Review` flag means some position lacks a stop or has one that leaves more risk than it should.

## The five tabs

| Tab | Contents |
|---|---|
| **Live Positions** | Everything currently open |
| **Tradebook** | Completed trades |
| **Orderbook** | Orders placed |
| **Open Pending** | Resting limit orders — see [The pending order book](/docs/the-pending-order-book) |
| **Logs** | A merged activity stream |

Each tab shows a count badge.

## Filters

- **Instrument** — All, NIFTY, BANKNIFTY or SENSEX
- **Product** — All, Intraday or Carry-forward
- **Scope** — fixed to today
- **Refresh** — manual refresh

The view refreshes automatically every 30 seconds, and immediately when something happens (a fill, an exit, a cancellation).

Remember that "today" begins at **08:30 IST**, not midnight.

## Reading a position row

| Column | Notes |
|---|---|
| Instrument | Contract name |
| Side | Buy or sell |
| Quantity | In **contracts**; hover to see lots × lot size |
| Avg price | Your fill price, including slippage |
| LTP | Live premium |
| Invested | Capital committed |
| Open P&L | Unrealised, updating roughly every second |
| SL / Target | Your protection levels, and any resting exit limit |
| Status | Position state |
| Actions | **Modify** and **Exit** |

## Strategy positions

An executed multi-leg strategy appears as a single **MULTI** summary row with its legs indented underneath.

The legs behave differently from standalone positions:

- Each leg is labelled `LEG` instead of having its own action buttons.
- Legs show *"Strategy level / No per-leg SL"* — protection is managed for the structure, not the individual leg.
- **You cannot exit a single leg from this screen.** The **Exit** action on the summary row squares off the entire strategy.

This is intentional. A four-leg iron condor with one leg closed is not a hedged position any more, it is an accident.

## The Logs tab

Logs merge three streams into one timeline:

- Order entries
- Exits, with their reason — `CLOSED`, `TARGET_HIT`, `SL_HIT`, `CANCELLED`
- Discipline blocks, like *"Blocked by max trades per day"*

Having blocks interleaved with fills is useful — it shows the shape of your session including the trades that did not happen.

## Exporting

**Export CSV** downloads whichever tab is currently active, named `strikefluency-{tab}-YYYY-MM-DD.csv`.
