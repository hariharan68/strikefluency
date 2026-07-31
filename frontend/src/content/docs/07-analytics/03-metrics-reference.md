---
title: Metrics reference
description: The Analytics page, and how to read each number honestly.
status: stable
---

# Metrics reference

The **Analytics** page in the sidebar is the dedicated performance view.

## Stats strip

| Metric | Meaning |
|---|---|
| **Avg P&L / Day** | Net result divided by trading days |
| **Win trades / Loss trades** | Counts |
| **Total P&L** | With percentage of initial capital and the starting figure |
| **Total trades** | Completed |
| **Win rate** | Percentage of winners |
| **Best trade** | Largest single win |
| **Profit factor** | Gross profit ÷ gross loss — turns green at 1.5 |

## The four charts

### Aggregate P&L vs date

Daily bars, green for profit and red for loss. Good for spotting streaks and outliers.

Look for a single enormous red bar. One outsized loss among many small wins is the classic signature of a system that works until it does not.

### Cumulative P&L vs date

An area chart of running total — your equity curve.

The shape matters more than the endpoint. A smooth rise means consistent process. A jagged one that gets to the same place means you are taking more risk than the final number suggests.

### 30-day discipline score trend

Bars, 0–100%.

**This is the chart to check weekly.** The discipline score moves before P&L does. A declining trend here reliably precedes a bad month, which makes it the closest thing to an early warning available.

### Mistake breakdown

A donut of your tagged mistakes.

This only works if you tag honestly in the journal. Assuming you do, it is the most actionable chart in the product — one segment usually dominates, and addressing that one thing tends to move results more than any strategy change.

## How to read these honestly

**Win rate is nearly meaningless on its own.** A 70% win rate with an average loss three times the average win is a losing system. Always read it beside payoff ratio or profit factor.

**Small samples lie.** Twenty trades tells you almost nothing. A hundred starts to be informative. Be very suspicious of conclusions drawn from your first week.

**Best trade is a warning, not an achievement.** If your best trade is several times your average win, check whether it was skill or an oversized position. Look at the journal entry — if it is tagged `OVERSIZE`, the number is a red flag wearing a green colour.

**Profit factor without drawdown is incomplete.** Both are needed. Good returns you could not psychologically have held are not returns you would have captured.

## What to do with this

A workable routine:

- **Weekly** — glance at the discipline trend and the mistake breakdown. Two minutes.
- **Monthly** — read the full stats strip, look at breakdowns by setup and instrument, and decide one thing to change.

One change at a time. Changing three things means learning nothing about which worked.

## Metrics that do not exist

For completeness: there is no Sharpe ratio, no Sortino, no benchmark comparison and no risk-adjusted return metric. There is also no backtesting, so every number here is from trades you actually placed.
