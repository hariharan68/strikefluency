---
title: Emergency exit
description: The panic button — what it closes, and importantly what it does not.
status: stable
---

# Emergency exit

**EM Exit** in the positions toolbar is the panic button. It closes multiple positions at once, at market, in a single action.

The button is disabled unless you have positions eligible for it.

## What it closes

**Open standalone BUY positions only.**

That is the complete list. It is narrower than most people expect, so it is worth being explicit about the exclusions:

| Not closed | Why |
|---|---|
| **SELL positions** | A short option is often the hedge leg of a manually constructed position. Closing it while leaving the long side turns a defined-risk position into an undefined one |
| **Strategy legs** | Same reasoning, more strongly. Half an iron condor is worse than a whole one |

Both exclusions are enforced at the database level, not just in the interface, so there is no path by which the emergency exit can dismantle a hedge.

## What it does not do

- It does **not** cancel resting limit orders. Those keep their margin blocked and can still fill. Cancel them separately from **Open Pending**.
- It does **not** stop you from trading afterwards. It is not a circuit breaker — if you want to stop, that is the daily loss cap's job.
- It does **not** bypass market hours. Outside 09:15–15:30 IST nothing closes.

## Using it

Click **EM Exit**, confirm, and you get a toast reporting the count:

> 3 standalone BUY positions exited

If nothing qualified, that is a valid outcome, not an error — you will simply see that zero positions were closed.

## When to use it

Genuine cases: a data feed problem you do not trust, a sudden move you did not plan for, or a personal circumstance that means you cannot watch the screen.

The case it is *not* for is emotional. Panic-closing everything after a loss is the same impulse the revenge cooldown exists to interrupt. If you are reaching for this button because you feel bad rather than because something is actually wrong, close the tab instead and come back tomorrow.

## The better habit

Emergency exit is a safety net for the times your plan has failed. If you find yourself using it regularly, the problem is upstream — position sizing, or the number of positions you carry, or trading structures you do not fully understand.

A well-sized book with stop-losses on every position rarely needs a panic button.
