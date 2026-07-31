---
title: Executing a strategy
description: Opening a structure as a real virtual position, and which rules apply.
status: stable
---

# Executing a strategy

Analysis is free. Execution opens actual virtual positions and commits margin.

## The execution dialog

Click **Execute** and you are asked for two things:

- **Setup tag** — the same five options as a standalone order
- **Product type** — Intraday or Positional

Confirming runs a preview, then executes. On success you get *"Paper strategy executed"* and land on the positions screen.

## Which discipline rules apply

This is the part that differs most from standalone trading. Strategies are checked against **three** of the seven rules only:

| Rule | Applies to strategies? |
|---|---|
| Max trades per day | **Yes** |
| Max daily loss | **Yes** |
| Mandatory setup tag | **Yes** |
| Mandatory stop-loss | No |
| Revenge cooldown | No |
| No averaging down | No |
| No direction flip | No |

The four excluded rules are excluded because they are meaningless or actively harmful for multi-leg structures. A stop-loss on an individual leg of an iron condor would dismantle the hedge. "No direction flip" would block every structure containing both a call and a put — which is most of them.

**One strategy counts as one trade** against your daily limit, regardless of how many legs it has. A four-leg condor uses one of your three daily trades, not four.

### What this means in practice

Strategies are a genuine gap in your protection. There is no mandatory stop-loss and no revenge cooldown on them. If you have just stopped out of a position and the cooldown is blocking you, you can still execute a strategy.

Be aware of that. The rules are not going to save you here — you have to.

## Market hours

Strategy execution respects the 09:15–15:30 IST window like everything else. You can build and save outside hours; you cannot execute.

## Rejection reasons

| Error | Meaning |
|---|---|
| `EMPTY` | Add at least one leg |
| `NOT_A_DRAFT` | Only draft strategies can be edited |
| `UNPRICEABLE` | One or more legs has no valid quote — the message names them |
| `InsufficientBalanceError` | Margin required exceeds available funds; the message gives both figures |
| `NO_EXPIRY` | A leg has no expiry set |
| `LEG_NOT_FOUND` / `LEG_NOT_OPEN` | Stale reference to a leg |
| `NOT_EXECUTED` | Action requires an executed strategy |

`UNPRICEABLE` is the most common. It usually means a leg is at a strike so far out of the money that it has no quote. Move the strike closer to the money.

## After execution

The strategy appears in positions as a single **MULTI** row with its legs indented beneath.

- Legs cannot be exited individually — **Exit** closes the whole structure.
- Legs have no individual stop-loss; they show *"Strategy level / No per-leg SL"*.
- **Modify** on a strategy takes you back to the builder with that strategy loaded.
- Open strategies are marked to market roughly every 15 seconds.

## A billing quirk

Entry brokerage on a strategy is **netted at close** rather than debited when it opens, unlike standalone orders where it comes out immediately.

Your final P&L is the same either way. It only means a freshly opened strategy shows a slightly better position than a standalone trade would at the same moment. It is a known inconsistency in the current implementation.
