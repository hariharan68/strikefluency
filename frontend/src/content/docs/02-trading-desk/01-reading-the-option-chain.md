---
title: Reading the option chain
description: Every column, badge and colour on the chain, and what the buildup pills mean.
status: stable
---

# Reading the option chain

The chain is the centre of the desk. Calls sit on the left, puts on the right, and strikes run down the middle.

## The header

Above the table you get the underlying's state:

- **Spot** with its change percentage
- **Future** price
- **VIX** — see the note at the bottom of this page
- **PCR (OI)** — put-call ratio by open interest
- **Max Pain** — the strike at which option buyers lose the most
- **ATM IV** — implied volatility at the money

## The columns

Each side of the chain shows, reading inward toward the strike:

| Column | Meaning |
|---|---|
| **Buildup** | A pill summarising what price and open interest are doing together |
| **Volume** | Contracts traded today |
| **OI Chg%** | Percentage change in open interest |
| **OI** | Open interest, with a bar showing relative size |
| **LTP** | Last traded premium — hover here to get the buy/sell buttons |
| **IV** | Implied volatility |

## Buildup pills

The four pills combine price direction with open-interest direction, which is the standard way to read positioning:

| Pill | Meaning | Price | Open interest |
|---|---|---|---|
| **L** | Long build-up | Up | Up |
| **SC** | Short covering | Up | Down |
| **S** | Short build-up | Down | Up |
| **LU** | Long unwinding | Down | Down |

Long build-up and short build-up mean fresh money is committing. Short covering and long unwinding mean existing positions are being closed.

## Row highlighting

- The **ATM** row is tinted and badged.
- The **MAX PAIN** strike carries its own badge.
- In-the-money cells get a subtle background wash, so moneyness is visible at a glance.
- The **three highest volumes** on each side are highlighted — a quick read on where today's activity is concentrated.

## Choosing how many strikes to see

The window buttons — **±5**, **±10**, **±15**, **±20**, **All** — control how many strikes either side of ATM are displayed. It defaults to ±5, which keeps the table readable.

## Live vs snapshot

A badge near the header tells you what you are looking at:

- **LIVE · 1s** — a websocket frame arrived within the last four seconds. Premiums update roughly every second.
- **SNAPSHOT** — the live feed is quiet and the app is falling back to polling every 15 seconds.

Open interest and greeks refresh on a slower cadence than premiums (about every 15 seconds) because they change far more slowly.

> **VIX always shows a dash.** India VIX is not currently supplied by the data layer, so that field renders as `—` regardless of the provider you have connected. It is a known gap, not a loading state.
