---
title: Margin, charges and slippage
description: What an order costs to hold and what it costs to trade.
status: stable
---

# Margin, charges and slippage

## Margin

The capital blocked when you open a position depends on your leverage preference in **Settings → Trading Preferences**:

| Leverage | Margin blocked |
|---|---|
| **ON** (default) | Contract value ÷ 5 |
| **OFF** | Full contract value |

Contract value is `premium × quantity`. On a NIFTY option at ₹120 with one lot of 65, that is ₹7,800 of contract value — so ₹1,560 blocked with leverage on, or the full ₹7,800 with it off.

Leverage off is the more conservative practice mode: you hold fewer positions on the same capital, which is closer to how cash-settled risk actually feels.

Margin is released when the position closes.

## Charges

Charges are modelled on the real Indian cost stack rather than being invented:

| Charge | Rate |
|---|---|
| **Brokerage** | ₹20 per leg |
| **STT** | 0.05% of sell-side turnover |
| **Exchange charges** | 0.053% of turnover |
| **SEBI charges** | ₹10 per crore of turnover |
| **GST** | 18% on brokerage + exchange charges |

STT applies to the **sell side only**, which is why exiting a long costs more than entering it.

### The ticket's estimate

Before you submit, the ticket shows an estimate calculated as `max(₹20, turnover × 0.0006)`. It is a quick approximation of the full stack above, not the exact figure — the precise charges are computed at fill and again at exit.

### When charges are debited

- **Standalone orders** — entry brokerage is debited immediately on fill; the rest settles at exit.
- **Strategies** — entry brokerage is netted at close rather than debited up front.

That inconsistency between the two paths is a known quirk of the current implementation. It does not change your final P&L, only when the deduction appears.

## Slippage

Real fills are never exactly at the last traded price. StrikeFluency simulates this:

| Distance from ATM | Slippage |
|---|---|
| Within 5 strike steps | 0.5% – 1.5% |
| Beyond 5 strike steps | 2% – 4% |

Direction always works against you: **buys fill higher**, **sells fill lower**.

The far-strike penalty reflects reality — deep out-of-the-money options have wide spreads and thin books, and a market order there is expensive. If you consistently trade far strikes, slippage will show up in your results, which is the lesson.

### Slippage and stops

Because slippage applies to exits too, a stop-loss fill is usually slightly worse than your stop price. Budget for it.

One exception: on a **limit exit**, slippage may improve your fill but will never make it worse than the limit you set.

## Quote freshness

If the last tick is stale when you try to open a position, the order is refused rather than filled at an unreliable price.

The rule is applied where it matters and relaxed where it would be harmful:

- **Entry** — refused on a stale quote.
- **Scheduled triggers** (the stop-loss sweep) — skipped quietly and retried on the next pass.
- **Manual exits and end-of-day square-off** — no freshness gate, because being unable to close a position is worse than closing it on a slightly old price.
