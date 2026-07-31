---
title: FAQ
description: Common questions, and the answers to the ones people actually ask.
status: stable
---

# FAQ

## Is any real money involved?

No. Every trade is virtual. The broker connection, if you set one up, is market data inbound only — StrikeFluency has no ability to place orders on your broker account, and that boundary is enforced in code.

## Why was my order rejected?

The message names the rule. The seven possibilities and their exact wording are in [The seven rules](/docs/the-seven-rules). The engine stops at the first failure, so fix what it names and try again.

## Why can't I trade right now?

Almost certainly market hours. Execution only happens **09:15–15:30 IST on weekdays**. Mock data keeps producing prices outside those hours, which makes the app look tradable when it is not.

## My limit order is at the market price but hasn't filled

The fill scanner runs **every five seconds**. A marketable limit fills on the next scan, not instantly. If it has been longer than that, check whether discipline rules changed since you placed it — limit orders are re-checked at fill time and can be rejected.

## Why did my position close on its own?

Four possibilities: your stop-loss hit, your target hit, an exit limit triggered, or it was an Intraday position squared off at 15:29. The **Logs** tab shows the reason.

## Can I close half a position?

No. Positions close whole. There are no partial fills and no partial closes.

## Can I add to a winning position?

Not while the **no averaging down** rule is active — it blocks a second buy in the same contract regardless of whether you are up or down. Disable that rule individually if scaling in matters to you.

## Why did my NIFTY position block a BANKNIFTY trade?

The **no direction flip** rule compares option type only, not instrument. An open CE anywhere blocks a PE buy anywhere. If you run positions across indices, turn that rule off.

## What happens if I turn Discipline Mode off?

Rules are bypassed, your balance is topped up to ₹10,00,000, your tier jumps to Tier 3, and every subsequent trade is flagged as free play and excluded from your discipline score.

Turning it back on restores the rules but **does not reverse the capital or the tier**. It is a one-way door. See [Discipline Mode and free play](/docs/discipline-mode-and-free-play).

## Do free-play trades count for anything?

They appear in positions, tradebook and journal with real P&L. They do not count toward your discipline score, streak or tier progress. Their performance is reported separately on the Progress tab.

## When do I get Tier 2?

Currently you do not. The 15-trade streak and its progress bar are displays only — no capital is awarded. See [What is not available yet](/docs/what-is-not-available-yet).

## Do I need a broker account?

No. Mock data is the default and works at any hour. Nothing is gated behind a broker connection.

## Why does my Zerodha connection break every day?

Kite tokens expire daily by Zerodha's design. You need to complete the login each trading day. Steps 1 and 2 of the wizard are one-time; only the login recurs.

## Why does VIX show a dash?

India VIX is not supplied by the data layer with any provider. Known gap, not a loading state.

## Why is my P&L worse than I calculated?

Two reasons, both intentional: **slippage** on fills (0.5–1.5% near the money, 2–4% further out, always against you), and **charges** (about ₹63 round trip on one NIFTY lot). See [Fees and charges](/docs/fees-and-charges).

## Can I backtest a strategy?

No. There is no historical replay and no backtesting engine. The strategy builder evaluates the price and date scenarios you specify, forward-looking only.

## Where did my journal entry come from?

It was created automatically when the position closed. Everything mechanical is filled in for you — you add the emotion tag, mistake category and review.

## Can I export my data?

Yes, as CSV. The journal exports trade records; the positions workspace exports whichever tab is active. Written thesis and review text are not included in the journal export.

## Why is my theme different on my other computer?

Theme and layout are stored per device, not on your account. Trading preferences and notifications are server-side and do follow you.

## Is there a mobile app?

No, but the web app is responsive and works on a phone browser. The option chain and strategy builder are genuinely better on a wide screen.

## What is the fastest way to improve?

Get your discipline score above 80 and keep it there for a month before caring about P&L. Then check the mistake breakdown in analytics, pick the single most common one, and fix only that. One change at a time.
