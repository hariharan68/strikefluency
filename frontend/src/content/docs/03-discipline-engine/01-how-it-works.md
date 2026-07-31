---
title: How the discipline engine works
description: Where the rules run, what happens when one fails, and what gets recorded.
status: stable
---

# How the discipline engine works

The discipline engine is the thing that makes StrikeFluency different from every other paper trading app. It sits **in front of** order placement, not beside it.

## Where it runs

Every path that can open a position passes through the engine first:

- Market order entry
- Limit order placement
- Limit order fill (checked a **second** time — see below)
- Strategy execution (a reduced rule set — see [Executing a strategy](/docs/executing-a-strategy))

There is no route around it while Discipline Mode is on.

## Evaluation order

Rules are checked in a specific sequence, and the engine **stops at the first failure**:

1. Mandatory stop-loss
2. Mandatory setup tag
3. Max trades per day
4. Max daily loss
5. Revenge cooldown
6. No averaging down
7. No direction flip

Note this is not the order they are numbered in the interface. The cheap, obvious checks run first so you get the most actionable message.

Because it short-circuits, you see **one** reason at a time. Fix it, resubmit, and you may hit the next one. That is intentional — a wall of seven errors teaches nothing.

## What you see when blocked

The order is refused and the specific rule's message is shown. Every message names the rule, the actual numbers, and what to do:

> Daily trade limit reached. You have placed 3/3 trades today. Come back tomorrow.

> Revenge trading cooldown active. Wait 12m 30s before placing a new order. Use this time to review your last trade.

The full list is in [The seven rules](/docs/the-seven-rules).

## What gets recorded

A blocked order is not discarded silently. The engine writes a **violation record** containing:

- Which rule failed
- That it was blocked (rather than merely warned)
- The full order you attempted

This is what powers the violations list on the Discipline Mode page and the mistake breakdown in analytics. Your near-misses are data — arguably more useful than your trades, because they show what you *wanted* to do.

## The double check on limit orders

A limit order is checked when you place it and **again when it fills**.

The gap between those two moments can be hours, and your circumstances change. Between placing and filling you may have used up your daily trades, breached your loss cap, or stopped out of another position and armed the revenge cooldown.

If the rules fail on re-check, the order does not fill. It becomes `REJECTED` with the reason, and the margin is released.

Without this, a limit order placed in the morning would be a loophole through every session-based rule.

## Market hours are not a rule

Worth stating clearly: the 09:15–15:30 trading window is **not** one of the seven rules. It is a separate boundary that applies whether Discipline Mode is on or off. Turning discipline off does not let you trade at midnight.

## When it does not run

The engine is bypassed entirely when **Discipline Mode is off**. That mode has significant consequences beyond just skipping the checks — see [Discipline Mode and free play](/docs/discipline-mode-and-free-play).
