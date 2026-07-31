---
title: Stop-loss, targets and setup tags
description: The three fields that turn an impulse into a plan.
status: stable
---

# Stop-loss, targets and setup tags

These three fields are the practical core of the discipline system. Two of them are mandatory by default, and that is not an accident.

## Stop-loss

### Why it is mandatory

An entry without a predefined exit is not a trade, it is a hope. The mandatory stop-loss rule exists because "I'll watch it and get out if it goes wrong" is the single most expensive sentence in retail trading — under pressure, nobody gets out.

### Direction rules

The stop must be on the losing side of your entry:

| Side | Requirement | Rejection if wrong |
|---|---|---|
| **BUY** | SL **below** current premium | `For a BUY order, SL (X) must be below LTP (Y).` |
| **SELL** | SL **above** current premium | `For a SELL order, SL (X) must be above LTP (Y).` |

Omitting it entirely gives:

> Stop Loss (SL) is mandatory. Set an SL before placing this order.

### How it executes

A sweep runs **every five seconds** during market hours. When the premium touches your stop, the position is closed automatically with exit reason `SL_HIT`.

Two knock-on effects worth knowing:

1. An `SL_HIT` close **arms the revenge cooldown** — you cannot place another order for the configured cooldown period.
2. The exit fill includes slippage, so your realised loss will usually be slightly worse than your stop price. This is realistic, not a bug.

### Changing it later

You can adjust the stop on an open position from **Positions → Modify**. With Discipline Mode on and the mandatory rule active, you can move it but **not remove it**.

## Targets

Targets are optional. Set one and the same five-second sweep closes the position at your price with exit reason `TARGET_HIT`.

If a stop-loss, target and exit limit could all trigger on the same tick, the priority is:

1. Stop-loss
2. Target
3. Exit limit

Stop-loss wins deliberately — protecting capital ranks above capturing profit.

## Setup tags

### Why they are mandatory

The tag forces you to name your thesis before entering. Trades that cannot be labelled tend to be the ones that should not have been taken.

| Tag | Meaning |
|---|---|
| `OI_BASED` | Driven by open interest positioning |
| `PRICE_ACTION` | Candles, structure, momentum |
| `LEVEL_TRADE` | A support, resistance or pivot |
| `EXPIRY_PLAY` | An expiry-day specific setup |
| `OTHER` | Anything that does not fit |

Missing tag rejection:

> Setup tag is required. What is your trade thesis? (OI_BASED, PRICE_ACTION, LEVEL_TRADE, EXPIRY_PLAY, OTHER)

### What they unlock later

Every tag is carried into the journal and into analytics, which produces a **breakdown of performance by setup**. After a few dozen trades this is genuinely revealing — most traders discover one tag is quietly funding the losses of another.

That report only exists because the tag was mandatory at entry. Optional metadata never gets filled in.
