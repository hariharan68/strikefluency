---
title: Instruments and lot sizes
description: Contract specifications at a glance.
status: stable
---

# Instruments and lot sizes

## Contract specifications

| Underlying | Exchange | Lot size | Strike interval | Weekly | Monthly | Expiry day |
|---|---|---|---|---|---|---|
| **NIFTY** | NSE | 65 | 50 | Yes | Yes | Tuesday |
| **BANKNIFTY** | NSE | 30 | 100 | No | Yes | Tuesday |
| **SENSEX** | BSE | 20 | 100 | Yes | Yes | Thursday |

## Quantity arithmetic

| Lots | NIFTY | BANKNIFTY | SENSEX |
|---|---|---|---|
| 1 | 65 | 30 | 20 |
| 2 | 130 | 60 | 40 |
| 3 | 195 | 90 | 60 |
| 5 | 325 | 150 | 100 |
| 10 | 650 | 300 | 200 |

You type contracts into the order ticket; it rounds down to whole lots. Typing 100 for NIFTY gives you one lot of 65, not one and a half.

## Contract value

`contract value = premium × quantity`

A NIFTY option at ₹120 for one lot: `120 × 65 = ₹7,800`.

## Margin required

| Leverage | Margin |
|---|---|
| On (default, 5x) | contract value ÷ 5 |
| Off (1x) | full contract value |

That same ₹7,800 contract blocks ₹1,560 with leverage on, ₹7,800 with it off.

## Slippage bands

| Distance from ATM | Slippage |
|---|---|
| Within 5 strike steps | 0.5% – 1.5% |
| Beyond 5 strike steps | 2% – 4% |

Buys fill higher, sells fill lower. For NIFTY, "5 strike steps" is 250 points either side of ATM.

## Product types

| Product | Code | Behaviour |
|---|---|---|
| Intraday | `INTRADAY` | Auto square-off at 15:29 IST |
| Positional | `NRML` | Carries forward, except on expiry |

## Setup tags

`OI_BASED` · `PRICE_ACTION` · `LEVEL_TRADE` · `EXPIRY_PLAY` · `OTHER`

## Emotion tags

`CONFIDENT` · `CALM` · `FEARFUL` · `GREEDY` · `IMPATIENT` · `FOMO`

## Mistake categories

`NONE` · `EARLY_EXIT` · `SL_TOO_TIGHT` · `IGNORED_LEVEL` · `FOMO_ENTRY` · `OVERSIZE`

## Order statuses

`PENDING` · `FILLED` · `CANCELLED` · `EXPIRED` · `REJECTED`

## Exit reasons

`CLOSED` · `SL_HIT` · `TARGET_HIT` · `CANCELLED` · `EOD_SQUAREOFF`

## Capital tiers

| Tier | Capital |
|---|---|
| Tier 1 | ₹1,00,000 |
| Tier 2 | ₹5,00,000 |
| Tier 3 | ₹10,00,000 |

Streak target for the next tier is 15 consecutive disciplined trades — but see [Your virtual account](/docs/your-virtual-account) for what that does and does not currently award.

## Timings

| Time (IST) | Event |
|---|---|
| 08:30 | Pre-market cleanup, trading day rollover |
| 09:15 | Market opens |
| 15:29 | Intraday square-off, expiry settlement |
| 15:30 | Market closes |
| 15:35 | Portfolio snapshots |
| Every 5s | Limit fill scanner, auto-exit sweep |
| Every 15s | Strategy mark-to-market, OI and greeks refresh |
| Every 1s | Option chain premiums (live feed) |
