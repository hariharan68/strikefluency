---
title: Your virtual account
description: Starting capital, the funds ledger, capital tiers and what the tier bar actually does.
status: partial
---

# Your virtual account

Every user gets exactly one virtual account, created at registration and funded with **₹1,00,000** of simulated capital.

## Where the money lives

Your balance is not a number that gets edited. It is the sum of an **append-only funds ledger** — every rupee movement is a row that is never deleted or altered:

| Ledger type | When it is written |
|---|---|
| `INITIAL_CREDIT` | Your opening ₹1,00,000 at registration |
| `TRADE_DEBIT` | Margin blocked when a position opens |
| `TRADE_CREDIT` | Margin released and P&L settled when a position closes |
| `CHARGE` | Brokerage, STT, exchange and other charges |
| `REFUND` | Margin released on a cancelled or expired order |
| `MANUAL_ADJUSTMENT` | Capital unlocked when Discipline Mode is switched off |
| `RESET` | Account reset |

The invariant is simply `balance = SUM(ledger)`. This is why your numbers always reconcile, and why nothing can silently go missing.

## Available vs blocked capital

At any moment your capital is in one of two states:

- **Blocked** — margin held against open positions and resting limit orders.
- **Available** — what is left to open new positions with.

The desk shows both. Margin is released the moment a position closes or a resting order is cancelled, expires or is rejected.

How much margin an order blocks depends on your leverage preference — see [Margin, charges and slippage](/docs/margin-charges-and-slippage).

## Capital tiers

There are three tiers:

| Tier | Capital |
|---|---|
| Tier 1 | ₹1,00,000 |
| Tier 2 | ₹5,00,000 |
| Tier 3 | ₹10,00,000 |

You start at Tier 1. The dashboard shows a tier badge and a progress bar reading *"N clean trades to next tier"*, counting toward a target of **15 consecutive disciplined trades**.

## What the tier bar actually does today

This is the honest version, because the app's own progress bar overstates it:

**The 15-trade streak counter and the tier progress bar are displays only. Reaching 15 does not currently promote your tier or credit ₹5,00,000.** No code in the platform performs that promotion.

Treat the streak as what it genuinely is — a measure of how many disciplined trades you have strung together, which is a useful scoreboard in its own right. Just do not wait for a capital reward at 15.

The one thing that *does* change your tier is switching **Discipline Mode off**, which jumps you straight to Tier 3 and unlocks the full ₹10,00,000 sandbox. That is covered in [Discipline Mode and free play](/docs/discipline-mode-and-free-play) — and it is a trade-off, not a reward.

## Resetting

There is no self-service account reset in the interface today. Your ledger and journal history are cumulative.
