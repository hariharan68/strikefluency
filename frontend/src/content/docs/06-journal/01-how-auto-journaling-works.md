---
title: How auto-journaling works
description: Entries are created for you — what is filled in automatically and what is not.
status: stable
---

# How auto-journaling works

The reason most trading journals fail is that they require you to write down the boring parts. By the time you have typed the entry price, the exit price and the P&L, the energy to record what actually mattered is gone.

StrikeFluency fills in the boring parts for you.

## When an entry is created

**Automatically, the moment a position closes.** There is nothing to click.

One closed standalone trade produces exactly one journal entry.

## What is filled in for you

| Field | Source |
|---|---|
| Instrument, strike, option type | The order |
| Side | Buy or sell |
| Entry price | Your actual fill, including slippage |
| Exit price | Your actual exit fill |
| P&L | Realised profit or loss |
| Brokerage and charges | The full computed cost |
| Setup tag | What you selected at entry |
| Exit reason | `CLOSED`, `SL_HIT`, `TARGET_HIT`, `CANCELLED` |
| Discipline compliance | Whether the trade broke any rule |
| Violations attempted | Which rules you tried to break on this order |
| Duration | Minutes held |
| Trade date | Session date |

The **violations attempted** field is the interesting one. It records what the discipline engine caught while you were placing this trade — so you can see not just what you did, but what you were trying to do.

## What only you can add

Three things the system cannot know:

- **Emotion tag** — what you were feeling
- **Mistake category** — what you got wrong
- **Written review** — a pre-trade thesis and a post-trade reflection

These are covered in [Emotion and mistake tags](/docs/emotion-and-mistake-tags) and [Reviewing a trade](/docs/reviewing-a-trade).

## Strategies

Multi-leg strategies mirror their legs into the trade records for consistency, so strategy results appear in your analytics. The journal experience is oriented around standalone trades.

## The empty state

Before your first closed trade the journal says:

> Journal entries are created automatically after a virtual trade is closed.

Open positions do not appear. An entry exists only once the trade is finished.

## Why this matters

A journal that fills itself means the only work left is the work that is actually valuable — thinking about what happened. Most traders who keep a journal for a month and stop do so because of the transcription burden, not because reflection stopped being useful.

The corollary: since the mechanical record is free, there is no excuse for not doing the reflective part. That is the only bit that changes anything.
