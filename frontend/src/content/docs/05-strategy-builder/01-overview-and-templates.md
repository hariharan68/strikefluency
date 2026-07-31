---
title: Overview and templates
description: The multi-leg builder and its 32 ready-made structures.
status: stable
---

# Overview and templates

The strategy builder is where you construct multi-leg positions — spreads, straddles, condors, butterflies and anything else up to ten legs.

You can build from scratch, but starting from a template is faster and less error-prone.

## The 32 templates

Organised into four category tabs:

### Bullish (9)

`buy_call` · `sell_put` · `long_synthetic_future` · `bull_call_spread` · `bull_put_spread` · `long_calendar_calls` · `bull_condor` · `bull_butterfly` · `range_forward`

### Bearish (9)

`buy_put` · `sell_call` · `short_synthetic_future` · `bear_call_spread` · `bear_put_spread` · `long_calendar_puts` · `bear_condor` · `bear_butterfly` · `risk_reversal`

### Neutral (8)

`short_straddle` · `short_strangle` · `short_iron_condor` · `short_iron_butterfly` · `batman` · `jade_lizard` · `reverse_jade_lizard` · `double_plateau`

### Other (6)

`long_straddle` · `long_strangle` · `long_iron_condor` · `long_iron_butterfly` · `call_ratio_spread` · `put_ratio_spread`

Picking a template populates the leg table with sensible strikes around the money. You then adjust from there.

> A couple of the neutral names — *Batman* and *Double Plateau* — are not standard industry terminology. They describe the shape of the payoff curve rather than a universally recognised structure.

## Underlyings and specifications

The same three indices as the desk:

| Underlying | Lot size | Strike interval |
|---|---|---|
| NIFTY | 65 | 50 |
| BANKNIFTY | 30 | 100 |
| SENSEX | 20 | 100 |

## Leg limit

**Maximum 10 legs.** In practice almost everything useful fits in four.

## What the builder is for

Two distinct uses, and it is worth being clear which one you are doing:

**Analysis.** Build a structure, look at the payoff curve, greeks and P&L table, and understand how it behaves before ever committing capital. You can do this outside market hours, and it costs nothing.

**Execution.** Take the structure you have analysed and open it as a real virtual position. This requires market hours and passes through discipline checks — see [Executing a strategy](/docs/executing-a-strategy).

Most of the value is in the first. Building twenty structures and studying their payoff curves will teach you more about options than twenty trades.

## What it is not

**There is no backtesting.** The simulator evaluates the price scenarios you supply — a target underlying price and a target date. It does not replay historical data, and there is no way to ask "how would this have performed last month".

This is a forward-looking analysis tool, not a research platform.
