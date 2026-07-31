---
title: Mock vs live data
description: The default simulated feed, what connecting a broker changes, and what it never does.
status: stable
---

# Mock vs live data

## The default: mock data

Out of the box, StrikeFluency runs on a **mock market data provider** that generates realistic NIFTY-style prices — spot, option premiums, open interest and greeks.

This is a real feature, not a degraded state:

- It works at any hour, including weekends
- It requires no broker account
- It lets you learn the interface without wondering whether a data issue is your fault

The one thing it does not do is override market hours. Prices move at 9pm; orders still will not fill.

## What connecting a broker gives you

**Real market data.** Actual NIFTY, BANKNIFTY and SENSEX prices, real option chains, real open interest, streaming live.

Two providers are supported:

- **Fyers** — see [Connect Fyers](/docs/connect-fyers)
- **Zerodha (Kite Connect)** — see [Connect Zerodha](/docs/connect-zerodha)

## What connecting a broker never gives you

This is the most important paragraph on this page.

**The broker connection is inbound market data only.** StrikeFluency has no capability to place, modify or cancel orders on your broker account. It cannot read your real positions, holdings or funds. This is enforced in the code as a policy boundary, not merely left unimplemented.

Connecting your broker does not put a single rupee of real money at risk. Every trade you place here remains virtual.

## One provider at a time

Exactly one data provider is active at any moment — mock, Fyers, or Kite.

**Connecting one broker automatically disconnects the other.** This is by design, not a limitation to work around. When you connect Zerodha, the Fyers row will flip to "Not connected" immediately.

## Fail-closed behaviour

The two brokers behave differently when something breaks:

- **Kite is deliberately fail-closed.** If the connection degrades, it does *not* silently fall back to mock data. You get a visible warning instead, because a chart quietly switching from real prices to simulated ones without telling you would be genuinely dangerous.
- A degraded Kite feed shows an amber **Reconnect Zerodha** pill in the top bar.

## Which should you use?

**Start with mock.** Learn the interface, place a few dozen trades, get your discipline score above 80. None of that needs real prices.

**Move to live** when you want your practice to reflect actual market conditions — real spreads, real open interest, real volatility.

If you do not have a Fyers or Zerodha account, mock mode is a complete product. Nothing is gated behind a broker connection.

## Feature coverage differences

The two providers do not expose identical data:

- **Fyers** — historical data and futures return *not implemented*
- **Kite** — additionally supports instrument search, quotes, OHLC, market depth, history, futures, expiries and catalog sync

If you have both accounts, Kite currently provides the fuller feed.
