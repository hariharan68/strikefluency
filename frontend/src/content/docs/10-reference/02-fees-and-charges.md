---
title: Fees and charges
description: The simulated cost stack, and a worked example.
status: stable
---

# Fees and charges

Charges are modelled on the real Indian cost structure rather than invented, so the P&L you see reflects what a trade would actually net.

## The cost stack

| Charge | Rate | Applied to |
|---|---|---|
| **Brokerage** | ₹20 per leg | Every leg, entry and exit |
| **STT** | 0.05% | Sell-side turnover only |
| **Exchange charges** | 0.053% | Turnover |
| **SEBI charges** | ₹10 per crore | Turnover |
| **GST** | 18% | Brokerage + exchange charges |

STT applying only to the sell side is why closing a long position costs more than opening it.

## Worked example

Buy 1 lot of NIFTY 24500 CE at ₹120, sell at ₹150.

**Entry** — turnover `120 × 65 = ₹7,800`

| | |
|---|---|
| Brokerage | ₹20.00 |
| STT | ₹0 (buy side) |
| Exchange | ₹4.13 |
| SEBI | ₹0.01 |
| GST on ₹24.13 | ₹4.34 |
| **Entry total** | **₹28.48** |

**Exit** — turnover `150 × 65 = ₹9,750`

| | |
|---|---|
| Brokerage | ₹20.00 |
| STT (0.05% of sell) | ₹4.88 |
| Exchange | ₹5.17 |
| SEBI | ₹0.01 |
| GST on ₹25.17 | ₹4.53 |
| **Exit total** | **₹34.59** |

**Result**

| | |
|---|---|
| Gross P&L | `(150 − 120) × 65 = ₹1,950.00` |
| Total charges | ₹63.07 |
| **Net P&L** | **₹1,886.93** |

Roughly ₹63 of round-trip cost on one NIFTY lot. Figures here exclude slippage, which is applied separately to the fills themselves.

## The ticket estimate

Before submitting, the order ticket shows `max(₹20, turnover × 0.0006)` as a quick approximation. It is not the precise figure — the full stack above is computed at fill and at exit.

## When charges hit

- **Standalone orders** — entry brokerage debited immediately on fill; everything else at exit.
- **Strategies** — entry brokerage netted at close instead.

Same final P&L, different timing. A known inconsistency in the current implementation.

## Why this matters for practice

Costs are the reason high-frequency scalping does not work at retail scale, and a simulator that ignores them teaches a strategy that cannot survive contact with reality.

Do the arithmetic on your own style: at ~₹63 round trip per NIFTY lot, a strategy targeting 5-point moves is spending most of its edge on charges before slippage is even counted.

## What is not modelled

- Stamp duty
- Physical settlement charges
- Any brokerage plan other than the flat ₹20 per leg
- Interest on margin
