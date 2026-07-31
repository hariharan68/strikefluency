---
title: Glossary
description: Options terms and StrikeFluency-specific vocabulary.
status: stable
---

# Glossary

## StrikeFluency terms

**Discipline engine** — The rule checker that runs before every order is accepted.

**Discipline Mode** — The master switch over all rules. On by default.

**Discipline score** — Percentage of your last 20 completed trades that were rule-compliant.

**Free play** — Trading with Discipline Mode off. Rules bypassed, full capital unlocked, trades excluded from scoring.

**Streak** — Consecutive rule-compliant closed trades. Resets to zero on any non-compliant close.

**Setup tag** — Mandatory label naming your reason for a trade.

**Violation** — A record written when a rule stops an order.

**Capital tier** — Tier 1 (₹1L), Tier 2 (₹5L) or Tier 3 (₹10L).

**Funds ledger** — Append-only record of every rupee movement. Your balance is its sum.

**Risk at Stop** — Total loss if every open position's stop-loss hits.

**Trade unit** — In analytics, one standalone order or one complete strategy.

## Options terms

**Call (CE)** — Right to buy the underlying at the strike price.

**Put (PE)** — Right to sell the underlying at the strike price.

**Strike** — The price at which an option can be exercised.

**Premium** — The option's price. What you pay to buy, receive to sell.

**LTP** — Last traded price.

**Spot** — Current price of the underlying index.

**ATM** — At the money. Strike nearest the spot price.

**ITM** — In the money. A call below spot, or a put above it. Has intrinsic value.

**OTM** — Out of the money. No intrinsic value, only time value.

**Expiry** — The date a contract ceases to exist.

**Lot size** — Minimum tradable quantity. NIFTY 65, BANKNIFTY 30, SENSEX 20.

**Open interest (OI)** — Total outstanding contracts. Rising OI means new positions; falling means positions closing.

**PCR** — Put-call ratio. Above 1.2 is put-heavy, below 0.8 call-heavy.

**Max pain** — The strike at which the largest value of options expires worthless.

**IV** — Implied volatility. The market's expectation of future movement, embedded in the premium.

**Intrinsic value** — How much an option is in the money right now.

**Time value** — Everything in the premium above intrinsic value. Decays to zero at expiry.

## Greeks

**Delta** — How much the premium moves per one-point move in the underlying.

**Gamma** — How fast delta changes. High near expiry and near the money.

**Theta** — Time decay per day. Negative for buyers, positive for sellers, and it accelerates into expiry.

**Vega** — Sensitivity to a change in implied volatility.

## Order and execution terms

**Market order** — Fills immediately at the prevailing premium.

**Limit order** — Rests until the premium reaches your price.

**Slippage** — Difference between expected and actual fill price. Always works against you here, except on limit exits.

**Margin** — Capital blocked against a position.

**Leverage** — 5x when on, meaning a fifth of contract value is blocked.

**Square-off** — Closing a position.

**Intraday (MIS)** — Closed automatically at 15:29.

**Positional (NRML)** — Carries to the next session.

**Mark to market** — Revaluing an open position at current prices.

## Strategy terms

**Leg** — One contract within a multi-leg structure.

**Spread** — Buying one option and selling another of the same type.

**Straddle** — A call and a put at the same strike.

**Strangle** — A call and a put at different strikes.

**Iron condor** — Four legs; profits when the underlying stays in a range.

**Butterfly** — Three strikes; peak profit at the middle one.

**Calendar spread** — Same strike, different expiries.

**Payoff graph** — Profit and loss plotted against the underlying's price.

**Breakeven** — Where the payoff crosses zero.

## Performance terms

**Win rate** — Percentage of trades that were profitable. Nearly meaningless alone.

**Profit factor** — Gross profit ÷ gross loss. Above 1.5 is solid.

**Expectancy** — Average outcome per trade. The honest summary.

**Payoff ratio** — Average win ÷ average loss.

**Max drawdown** — Largest peak-to-trough decline in equity.

**Equity curve** — Cumulative P&L over time. Its shape matters more than its endpoint.
