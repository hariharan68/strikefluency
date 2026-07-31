---
title: Advanced dashboard
description: The deeper performance view, its breakdowns and where its equity curve comes from.
status: stable
---

# Advanced dashboard

The second tab on the dashboard, for when the calm view is not enough detail.

## What counts as a trade

Throughout the advanced metrics, one "trade" is either:

- One completed standalone order, **or**
- One complete strategy

A four-leg condor is one trade, not four. This keeps frequency metrics honest.

## Core metrics

| Metric | Definition |
|---|---|
| **Total trades** | Completed trade units |
| **Winning / losing / breakeven** | Counts by outcome |
| **Net P&L** | Total after all charges |
| **Gross profit / gross loss** | Winners and losers summed separately |
| **Win rate** | Percentage, one decimal place |
| **Profit factor** | Gross profit ÷ gross loss. Blank when you have no losses |
| **Expectancy** | Net P&L ÷ trade count — average outcome per trade |
| **Avg win / avg loss** | Mean size of each |
| **Payoff ratio** | Average win ÷ average loss |
| **Best / worst trade** | Your extremes |
| **Max drawdown** | Largest peak-to-trough fall, in rupees and as a percentage of initial balance |
| **Avg holding minutes** | How long you hold |
| **Avg discipline score** | Over the window |
| **Violation count** | Rules broken |

### The two that matter most

**Expectancy** is the honest summary of whether your approach works. A positive expectancy with a 40% win rate is a perfectly good trading system; a negative one with a 70% win rate is not.

**Max drawdown** is the number that tells you whether you could actually have traded this. A strategy with good returns and a 40% drawdown is one most people would abandon at the bottom.

## Breakdowns

Performance sliced five ways:

- **By setup tag** — which of your theses actually work
- **By instrument** — NIFTY vs BANKNIFTY vs SENSEX
- **By weekday** — Monday through Friday
- **By rule violated**
- **By mistake category**

**By setup tag** is the most valuable. Most traders find one setup carries the account and another quietly drains it. That is only visible because setup tags are mandatory at entry.

**By weekday** sounds like superstition but often is not — expiry-day behaviour differs genuinely from a Monday, and if you trade both without acknowledging the difference it shows up here.

## The equity curve

Two sources, depending on what data exists:

1. **Portfolio snapshots** — written daily at 15:35. Used once at least two exist.
2. **Realised P&L fallback** — a curve derived from closed trades, used before then.

If your equity curve looks coarse in your first days, that is the fallback. It refines as snapshots accumulate.

## Window and timezone

Default window is **30 days**, and all dates are in **Asia/Kolkata**.

## A note on P&L arithmetic

For standalone trades, net P&L subtracts entry brokerage separately, because entry brokerage is debited at fill rather than being folded into the trade's P&L figure. Strategy net P&L subtracts total brokerage at close.

The end numbers are correct and comparable; the two paths just arrive there differently. This is the same quirk described in [Executing a strategy](/docs/executing-a-strategy).
