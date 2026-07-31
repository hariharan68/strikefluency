---
title: Instruments and expiries
description: The three tradable underlyings, their lot sizes, strike intervals and expiry cycles.
status: stable
---

# Instruments and expiries

StrikeFluency supports three index options. There are no stock options, no commodities and no currency pairs.

## Contract specifications

| Underlying | Exchange | Lot size | Strike interval | Weekly expiry | Monthly expiry | Expiry day |
|---|---|---|---|---|---|---|
| **NIFTY** | NSE | 65 | 50 | Yes | Yes | Tuesday |
| **BANKNIFTY** | NSE | 30 | 100 | **No** | Yes | Tuesday |
| **SENSEX** | BSE | 20 | 100 | Yes | Yes | Thursday |

Two things to note:

- **BANKNIFTY has no weekly expiries.** Only monthly contracts are available, which is a deliberate reflection of the current contract landscape.
- **SENSEX expires on Thursday**, unlike the two NSE indices.

## Lots versus contracts

This trips people up, so it is worth being precise.

You **type contracts** into the order ticket, and the ticket rounds down to whole lots. A NIFTY order of 65 contracts is one lot. 130 is two. Typing 100 gives you one lot, not one and a half.

The ticket always shows what it resolved to, as `N lots × 65`.

Internally the lot size is snapshotted onto the order at placement, so a later change to contract specifications never retroactively alters your history.

## Switching instrument

Use the ◀ ▶ arrows beside the instrument name on the desk. Your **default instrument** — the one selected when you open the desk — is set in **Settings → Trading Preferences**.

## Choosing an expiry

The expiry dropdown lists available expiries with their distance from today, like `07 Aug (4d)`.

Shorter-dated options decay faster and move more violently. If you are practising, the nearest weekly expiry will teach you about theta very quickly.

## Strike intervals

Strikes are spaced by the interval in the table above. This matters for two reasons:

1. The **strike window** buttons on the chain move in these steps.
2. **Slippage** is calculated relative to how far a strike is from the money, measured in strike steps — see [Margin, charges and slippage](/docs/margin-charges-and-slippage).
