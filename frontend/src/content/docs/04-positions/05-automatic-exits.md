---
title: Automatic exits
description: The four ways a position can close without you clicking anything.
status: stable
---

# Automatic exits

Positions can close on their own. Knowing the four mechanisms explains most "why did that close?" moments.

## 1. The five-second sweep

During market hours a sweep runs **every five seconds** checking every open position against its:

- Stop-loss → closes with reason `SL_HIT`
- Target → closes with reason `TARGET_HIT`
- Exit limit → closes with reason `CLOSED`

Priority when several could fire on the same tick: **stop-loss, then target, then exit limit.**

### The five-second granularity

The sweep is not tick-by-tick. A price that touches your stop and rebounds within five seconds may not trigger it.

This cuts both ways and is realistic — real fills are not guaranteed on a momentary touch either. Do not treat your stop as a precise line; treat it as a level that will be acted on promptly.

### Stale quotes

If the quote is stale when the sweep runs, it skips that position and retries on the next pass rather than acting on unreliable data.

## 2. Intraday square-off at 15:29

Every position opened with product type **Intraday** is closed automatically one minute before the market closes, at the prevailing premium.

You cannot carry an intraday position. If you want it overnight, open it as **Positional** in the first place — you cannot convert it afterwards.

## 3. Expiry settlement

On expiry day, contracts are **cash-settled** at 15:29 regardless of product type. A positional position in an expiring contract will not carry forward, because there is nothing left to carry.

## 4. Pre-market cleanup at 08:30

This one does not close positions but does affect orders: unfilled DAY limit orders from the previous session are **expired** and their margin released.

It also draws the trading-day boundary, which is why the "today" scope on the orderbook and tradebook resets at 08:30 rather than midnight.

## What carries forward

**Positional (NRML)** positions in non-expiring contracts carry to the next session. Their margin stays blocked overnight, and their P&L continues to move with the market when it reopens.

## No partial closes

A position closes as a whole. There is no way to exit half a position, and there are no partial fills — one order maps to at most one position, and that position closes entirely or not at all.

If you want to scale out, you need to open separate positions in the first place. Note that the **no averaging down** rule will block a second buy in the same contract while the first is open, so scaling in is not available while that rule is active.

## Seeing why something closed

The **Logs** tab in the positions workspace shows every exit with its reason. The **Tradebook** and your **journal entries** both carry the exit reason too, so you can always reconstruct what happened after the fact.
