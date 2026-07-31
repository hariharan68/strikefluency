---
title: Payoff, greeks and analytics
description: The four analysis tabs and the target controls that drive them.
status: stable
---

# Payoff, greeks and analytics

Four tabs sit below the leg table, all recalculating as you edit.

## Payoff graph

The profit-and-loss curve across a range of underlying prices. This is the primary view — it shows your maximum profit, maximum loss, and where the structure breaks even.

Overlays available:

- **Breakeven markers**
- **Standard deviation bands** — how far the underlying is statistically likely to move
- **Open interest overlay** — where positioning is concentrated relative to your strikes
- **Manual P&L overlay** — plot your own reference line
- **Zoom** and **invert**

The standard deviation bands are worth turning on. A structure that only profits beyond two standard deviations is a lottery ticket, and the graph will show you that immediately.

## P&L table

The same information numerically, across price points. Better than the graph when you want exact figures rather than shape.

## Greeks

Delta, gamma, theta and vega for the structure and per leg.

For multi-leg positions the aggregate greeks are what matter — a spread's individual legs can have large opposing deltas that net to almost nothing. The point of the structure is usually the net.

**Theta** is the one to watch on any short-premium structure. It is the number that pays you, and it is also the number that reverses violently if volatility spikes.

## Strategy chart

Price context for the underlying alongside your structure.

## Target controls

Two sliders drive every calculation:

**Target price** — where you think the underlying will be. Ranges ±10% around spot.

**Target date** — from today through to expiry, valued at 3:30 PM on the chosen day.

Moving the date slider is the clearest demonstration of time decay available anywhere. Build a long straddle, drag the date toward expiry without moving the price, and watch the whole curve sink. That is theta, and seeing it is more instructive than reading about it.

## Other controls

- **Multiplier** — scale the whole structure up or down
- **Include booked P&L** — fold realised profit into the display
- **Breakeven mode** — calculate breakevens at expiry or at the target date
- **Invert risk-reward** — flip the perspective

## How it recalculates

Edits are debounced by about 120 milliseconds, so dragging a slider does not fire a request per pixel. Results carry a revision token and stale responses are discarded, which is why the numbers never flicker between old and new values.

Open strategies that you have actually executed are marked to market roughly every 15 seconds.

## Using this well

The temptation is to hunt for a structure with a beautiful payoff curve. Curves are easy to make beautiful by choosing strikes the market will never reach.

The more useful exercise is to pick a view you actually hold — "NIFTY stays between 24,800 and 25,200 for the next week" — and then find the structure that expresses it most efficiently. Compare a short strangle, an iron condor and a butterfly on the same view, and the trade-offs between premium collected and risk taken become concrete.
