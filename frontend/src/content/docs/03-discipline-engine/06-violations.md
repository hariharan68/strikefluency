---
title: Violations
description: Reviewing blocked orders and using them as data rather than noise.
status: stable
---

# Violations

Every time a rule stops an order, a violation is recorded. This is not a punishment log — it is the most honest record of your trading impulses that exists anywhere.

## What is stored

Each violation captures:

- **Which rule** fired
- **Whether it was blocked or warned**
- **The full order you attempted** — instrument, strike, side, quantity, price

That last part is what makes it useful. You can see not just that you tried to overtrade, but exactly what you were about to buy at what price, and then check what that trade would have done.

## Where to see them

**Discipline Mode → Violations** — today's violations, with a count badge on the tab.

**Dashboard → Today's Discipline Log** — the same day's violations, reframed as coaching. Shows *"Clean run"* if there are none, or *"N slips"* with details.

**Discipline** report page — your recent violations across sessions, with `BLOCKED` and `WARNED` badges.

**Analytics → Mistake breakdown** — an aggregated donut of which rules you break most.

## Blocked versus warned

- **BLOCKED** — the order was refused. Nothing was placed.
- **WARNED** — the order proceeded but the violation was noted against it, which marks the trade non-compliant for scoring.

Most violations are blocks.

## How to use them

The instinct is to feel bad and move on. That wastes the data. Two habits that work:

**Weekly, look at which rule dominates.** Almost everyone has one signature violation. If yours is max trades per day, you have a frequency problem. If it is revenge cooldown, you have an emotional-regulation problem. If it is mandatory stop-loss, you have a planning problem. These need completely different fixes.

**Check what the blocked trade would have done.** The violation stores the full attempted order. Look up where that contract went afterward. Sometimes the rule saved you a large loss — that is worth internalising. Occasionally it cost you a good trade, and that is worth knowing too, because it tells you whether the rule's threshold is set correctly for how you trade.

## Violations and your score

A violation on an order that gets blocked does not directly reduce your discipline score, because no trade was created — the score is computed over *completed* trades.

What it does affect is any trade that carries an attempted-violation record through to completion. Those close as non-compliant, which lowers the score and resets your streak.

## Clearing them

There is no way to delete a violation, and that is deliberate. The record is the point.
