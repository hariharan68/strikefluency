---
title: The seven rules
description: Complete reference for every rule, its default, what it checks and the exact message it produces.
status: stable
---

# The seven rules

All seven are active by default from the moment you register. Each can be adjusted or switched off individually — see [Editing rules and presets](/docs/editing-rules-and-presets).

## Quick reference

| Rule | Default | Category | Severity |
|---|---|---|---|
| Mandatory stop-loss | On | Execution | High |
| Mandatory setup tag | On | Behaviour | Medium |
| Max trades per day | 3 | Risk | High |
| Max daily loss | 2% | Risk | Critical |
| Revenge cooldown | 15 minutes | Behaviour | Medium |
| No averaging down | On | Behaviour | Medium |
| No direction flip | On | Behaviour | Medium |

## Mandatory stop-loss

Requires a stop-loss on every order, on the correct side of the current premium.

**Messages**

> Stop Loss (SL) is mandatory. Set an SL before placing this order.

> For a BUY order, SL (95.00) must be below LTP (120.00).

> For a SELL order, SL (140.00) must be above LTP (120.00).

**Why it exists.** Entering without a predefined exit is the most common and most expensive retail mistake. Under pressure, discretionary exits do not happen.

## Mandatory setup tag

Requires a non-empty setup tag on every order.

**Message**

> Setup tag is required. What is your trade thesis? (OI_BASED, PRICE_ACTION, LEVEL_TRADE, EXPIRY_PLAY, OTHER)

**Why it exists.** It forces you to name your reason before entering, and it produces the per-setup performance breakdown in analytics.

## Max trades per day

**Default: 3.** Blocks a new order once today's session has reached the limit.

**Message**

> Daily trade limit reached. You have placed 3/3 trades today. Come back tomorrow.

**Why it exists.** Overtrading is how a bad morning becomes a bad month. A hard cap converts "just one more" into a closed door.

## Max daily loss

**Default: 2%** of your account's initial balance. Blocks new orders once today's realised P&L is below the negative threshold.

**Message**

> Daily loss limit reached (₹2,000.00). Today's P&L: ₹-2,145.00. Stop trading and review your journal.

**Why it exists.** This is the circuit breaker, and it is rated critical. It is the rule most likely to save an account.

Note that the percentage is applied to your **initial balance**, not your current balance — so the cap does not shrink as you lose.

## Revenge cooldown

**Default: 15 minutes.** Armed automatically when a position closes via `SL_HIT`. Blocks new orders until it expires.

**Message**

> Revenge trading cooldown active. Wait 12m 30s before placing a new order. Use this time to review your last trade.

**Why it exists.** The minutes right after a stop-out are statistically the worst time a retail trader ever places an order. This rule simply removes that window.

## No averaging down

Blocks a **BUY** order when you already hold an open position in the same instrument, strike and option type.

**Message**

> Averaging down is not allowed. You already have an open position in NIFTY 24500 CE. Close it first.

**Why it exists.** Adding to a loser feels like conviction and behaves like a doubling of risk on a thesis the market is already rejecting.

## No direction flip

Blocks a **BUY** order when you hold any open position of the opposite option type.

**Message**

> Direction flip not allowed. You have an open CE position. Close it before opening a PE.

**Why it exists.** Flipping direction mid-session is usually frustration wearing the costume of a strategy.

## Two important caveats

These are behaviours of the current implementation you should know before relying on the rules:

**1. Averaging down and direction flip apply to BUY orders only.** A SELL entry bypasses both checks entirely. If you practise short options, those two rules are not protecting you.

**2. Direction flip ignores the instrument.** It compares option type only. An open **NIFTY CE** will block a **BANKNIFTY PE** buy, even though the two are unrelated positions. If you deliberately run positions across indices, expect this and consider turning that rule off.

## Rules and strategies

Multi-leg strategies are checked against **three** of the seven rules only — max trades per day, max daily loss, and mandatory setup tag. See [Executing a strategy](/docs/executing-a-strategy).
