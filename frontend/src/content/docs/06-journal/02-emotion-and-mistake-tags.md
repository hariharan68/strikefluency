---
title: Emotion and mistake tags
description: The two classifications that turn a trade log into a behavioural record.
status: stable
---

# Emotion and mistake tags

These two fields are the ones that make the journal worth keeping.

## Emotion tags

What you were feeling when you placed the trade.

| Tag | Use it when |
|---|---|
| `CONFIDENT` | The setup was clear and you followed your plan |
| `CALM` | Routine execution, no emotional charge |
| `FEARFUL` | You hesitated, sized down, or nearly did not take it |
| `GREEDY` | You sized up, held past your target, or chased more |
| `IMPATIENT` | You took it early, or took it because nothing else was happening |
| `FOMO` | You entered because the move was already happening without you |

### Be honest, especially about winners

The instinct is to tag winning trades `CONFIDENT` and losing ones with something worse. Resist it. A FOMO entry that happened to work is still a FOMO entry, and tagging it honestly is the only way the data means anything.

Over a few dozen trades the pattern becomes visible: for most people, the `FOMO` and `IMPATIENT` buckets have a substantially worse expectancy than `CALM` and `CONFIDENT`. Seeing your own version of that number is more persuasive than any advice.

## Mistake categories

What went wrong, if anything.

| Category | Meaning |
|---|---|
| `NONE` | No mistake — this includes losing trades that were correctly executed |
| `EARLY_EXIT` | You closed before your thesis played out |
| `SL_TOO_TIGHT` | Stopped out by noise, then the trade worked |
| `IGNORED_LEVEL` | You traded through a level you had identified |
| `FOMO_ENTRY` | You entered late, chasing |
| `OVERSIZE` | Position was larger than your plan allowed |

### `NONE` is not a cop-out

A losing trade executed exactly as planned is a **good** trade with a bad outcome. Tag it `NONE`.

Conflating "lost money" with "made a mistake" is the single most damaging misconception in trading psychology. It teaches you to change a process that was working, because of an outcome that was random.

Equally, a winning trade where you oversized is a **mistake** that happened to pay. Tag it `OVERSIZE`.

## Where the tags surface

Both feed into analytics:

- **Mistake breakdown** — a donut chart of your most common errors, on the Analytics page
- **Performance by setup** — cross-referenced with your setup tags

The mistake breakdown is the single most actionable chart in the product. One category almost always dominates, and fixing that one thing usually moves your results more than any strategy change.

## How to build the habit

Tag trades the same day. Emotions fade fast and by tomorrow you will reconstruct a more flattering version of what you felt.

Five seconds per trade is enough. The value is in the pattern across fifty trades, not the precision of any single one.
