---
title: Your first trade
description: A complete walkthrough from opening the desk to journalling the closed trade.
status: stable
---

# Your first trade

This is the full loop, start to finish. It takes about five minutes during market hours.

## Before you start

Check the clock. Orders only execute between **09:15 and 15:30 IST on weekdays**. Outside those hours you can still explore the chain and build strategies, but nothing will fill.

## 1. Open the desk

From the sidebar, click **Trade**. You land on the option chain with your default instrument selected (NIFTY unless you changed it in Settings).

Across the top you will see four numbers: your **Discipline Score**, **Open P&L**, **Booked P&L**, and **Available Capital**. Those are your scoreboard for the session.

## 2. Pick an instrument and expiry

Use the ◀ ▶ arrows to cycle between **NIFTY**, **BANKNIFTY** and **SENSEX**, then choose an expiry from the dropdown. Each expiry is labelled with its date and how many days away it is, like `07 Aug (4d)`.

## 3. Find a strike

The chain is centred on the at-the-money strike, marked **ATM**. By default you see five strikes either side; use the **±5 / ±10 / ±15 / ±20 / All** buttons to widen the window.

Calls are on the left, puts on the right, strikes down the middle. See [Reading the option chain](/docs/reading-the-option-chain) for what every column means.

## 4. Open the order ticket

Hover over the **LTP** cell of the strike you want. Two small buttons appear: **B** to buy, **S** to sell. Click one and the order ticket opens.

## 5. Fill in the ticket

With Discipline Mode on, the ticket opens with its Advanced section already expanded, because two of those fields are mandatory:

| Field | Notes |
|---|---|
| **Quantity** | Type contracts; it rounds to whole lots. NIFTY trades in lots of 65, so 65, 130, 195 and so on |
| **Product** | *Intraday* squares off automatically at 15:29. *Positional* carries forward |
| **Order type** | *Market* fills at the live premium. *Limit* rests until your price is hit |
| **Stop Loss** ★ | **Required.** For a buy it must be *below* the current premium |
| **Target** | Optional |
| **Setup Tag** ★ | **Required.** Your reason for the trade |

The footer shows funds required, funds available, and estimated charges.

## 6. Submit

Click **SIMULATE BUY**. One of two things happens:

**It goes through** — you get a toast like `Paper BUY opened — NIFTY 24500 CE · 65 qty`, and the position appears under Positions.

**It gets blocked** — the discipline engine rejects it with a specific reason, for example:

> Stop Loss (SL) is mandatory. Set an SL before placing this order.

That is the system working. Read the message, fix what it names, and try again. Every block is recorded as a violation you can review later.

## 7. Manage the position

Go to **Positions**. Your open position shows entry price, live LTP, invested amount and open P&L, updating roughly every second.

From here you can:
- **Modify** — adjust your stop-loss or target
- **Exit** — close at market, or place a limit exit at your price

You do not have to babysit it. A sweep runs every five seconds during market hours and will exit automatically if your stop-loss or target is hit.

## 8. Journal it

When the position closes, a journal entry is created **automatically** with the entry, exit, P&L, charges, setup tag, duration and whether it was rule-compliant.

Open **Journal**, find the trade, and add the two things only you know:

- **Emotion tag** — were you Confident, Fearful, Greedy, Calm, Impatient, or acting on FOMO?
- **Mistake category** — exited early? Stop too tight? Ignored a level? FOMO entry? Oversized? Or none?

Then write a short review. This step is the entire point of the product — the trade taught you something, and this is where it gets captured.

## 9. Check the scoreboard

Back on the **Dashboard**, your discipline score has been recalculated over your last 20 completed trades, and your streak has either grown by one or reset to zero.

That number, not your P&L, is the one to watch early on.
