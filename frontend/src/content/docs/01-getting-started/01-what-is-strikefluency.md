---
title: What is StrikeFluency?
description: A virtual options trading desk that blocks undisciplined orders before they are placed.
status: stable
---

# What is StrikeFluency?

StrikeFluency is a virtual options trading simulator for Indian retail traders. You practice NIFTY, BANKNIFTY and SENSEX options on a desk that looks and behaves like a real terminal — but every order is checked against your own trading rules *before* it is accepted, and no real money is ever involved.

## The problem it solves

Most retail traders do not lose money because they lack knowledge. They lose it because of a handful of repeated behaviours: entering without a stop-loss, doubling down on a losing position, flipping direction out of frustration, taking a fourth trade after three losses, and revenge-trading straight after a stop-out.

Reading about those mistakes does not fix them. StrikeFluency makes them *impossible* — the order simply does not go through — so the habit is trained by repetition rather than willpower.

## How it works

1. You get a virtual account funded with ₹1,00,000 of simulated capital.
2. You place options orders from a live option chain, exactly as you would on a broker terminal.
3. Before each order is accepted, the **discipline engine** runs seven rules against it. If one fails, the order is rejected with a specific reason.
4. When a position closes, a **journal entry** is created automatically. You add the emotion behind the trade and any mistake you made.
5. **Analytics** track your discipline score, streak, win rate and P&L over time — so you can see the process improving, not just the money.

## What StrikeFluency is not

This matters, so it is worth being blunt:

- **It is not a broker.** No order ever reaches an exchange. Nothing you do here buys or sells a real contract.
- **It is not advisory.** There are no tips, no calls, no recommendations, and no SEBI-registered advice of any kind.
- **It is not a backtester.** There is no historical replay and no strategy backtesting engine. You practise forward, in live market conditions.
- **It does not touch your broker account.** When you connect Fyers or Zerodha, the connection is **market data inbound only** — the app has no ability to place orders on your behalf, by design.

## Who it is for

Traders who already understand the basics of options and keep breaking their own rules. If you have ever finished a session thinking *"I knew better than that"*, this is built for you.

It is also a safe first environment if you are new to options: you can misprice a spread, blow up a position, and hit your daily loss cap without any of it costing anything.

## What you need

Nothing but a browser. The app ships with a **mock market data provider** that produces realistic NIFTY-style prices, so you can explore the interface at any hour.

Connecting a broker for real live data is optional — see [Mock vs live data](/docs/mock-vs-live-data).

> Trading only executes between **09:15 and 15:30 IST on weekdays**, even in mock mode. Outside those hours you can browse, plan and journal, but orders will not fill.
