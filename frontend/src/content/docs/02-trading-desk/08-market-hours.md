---
title: Market hours
description: When the desk executes, and the scheduled jobs that run each day.
status: stable
---

# Market hours

## The trading window

**09:15 to 15:30 IST, Monday to Friday.**

This is a hard boundary. It is not a discipline rule you can switch off, and it is not affected by Discipline Mode. Everything that moves money honours it:

- Market order entries
- Limit order placement
- Limit order fills
- Strategy execution
- Manual exits
- Emergency exit
- End-of-day square-off

Outside the window you can still browse the chain, build strategies, save drafts, read your journal and review analytics. You just cannot open or close positions.

> Mock market data keeps producing prices outside market hours, so the chain will look alive at 9pm. It is display only — orders will still be refused.

## Holidays

The window covers weekdays. Exchange holidays are not currently modelled separately, so a market holiday that falls on a weekday will still appear open.

## The daily schedule

Several jobs run automatically. Knowing them explains a lot of behaviour that otherwise looks surprising.

| Time (IST) | What happens |
|---|---|
| **08:30** | Pre-market cleanup. The trading day rolls over, and unfilled DAY limit orders from yesterday are expired with their margin released |
| **09:15** | Market opens — execution begins |
| **Every 5s** | Fill scanner for resting limit orders; auto-exit sweep for stop-loss, target and exit limits |
| **Every 15s** | Mark-to-market refresh for open strategies |
| **15:29** | Intraday square-off. All INTRADAY positions are closed; expiring contracts are cash-settled |
| **15:30** | Market closes — execution stops |
| **15:35** | Daily portfolio and per-position snapshots are written |

### 08:30 and the "Today" views

The orderbook and tradebook are scoped to today, and that day boundary is drawn at **08:30**, not midnight. The empty state says so directly: *"The orderbook resets at 08:30 IST each trading day."*

If you look at the orderbook at 08:00, you are still seeing yesterday.

### 15:29 and intraday positions

Anything opened as **Intraday** is closed automatically one minute before the bell, at the prevailing premium. You do not get to carry it.

**Positional** (NRML) positions carry forward — except on expiry day, where contracts are cash-settled regardless.

### 15:35 and your analytics

Portfolio snapshots power the equity curve on the Advanced Dashboard. Until at least two snapshots exist, that chart falls back to a curve derived from realised P&L. If your equity curve looks coarse in your first days, this is why — it fills in as snapshots accumulate.
