---
title: Discipline Mode and free play
description: The master switch — what turning it off actually does to your account, and what it costs.
status: stable
---

# Discipline Mode and free play

Discipline Mode is the master switch over the entire rule system. It is **on** by default.

## Where the switch is

Three places, all controlling the same setting:

- The **Trading Desk** header — a compact toggle
- **Settings → Discipline Mode** — the full control
- **Discipline Mode** page — the master switch in the command bar

Turning it off opens a confirmation dialog, because the consequences go well beyond skipping a few checks.

## What turning it OFF does

All of this happens at once:

1. **Every discipline rule is bypassed** on every execution path.
2. **Your balance is topped up to ₹10,00,000** (minus any margin currently blocked). This is posted to the funds ledger as a manual adjustment described *"Discipline Mode OFF — sandbox capital unlocked"*.
3. **Your tier is set to Tier 3** and capital is marked unlocked.
4. **Your initial balance is raised to ₹10,00,000**, so the daily-loss-cap denominator matches your new capital.
5. An audit event is recorded.
6. **Every subsequent trade is flagged as free play.**

The top-up is non-destructive — if your balance is already above ₹10,00,000 it is not reduced.

## What free-play trades cost you

This is the real price, and it is not the money:

Free-play trades are **excluded** from:

- Your discipline score
- Your consecutive disciplined streak
- Cooldown analytics
- Tier progression

They still appear in your positions, tradebook and journal. They still show P&L. They simply do not count toward the thing the product actually measures.

Free-play performance is reported **separately** on **Discipline Mode → Progress**, so you can compare disciplined results against unrestricted ones side by side. That comparison is often the most persuasive argument for the rules that exists.

## What turning it back ON does

Only one thing: **the rules start being enforced again.**

The money is **not** clawed back. Your tier stays at Tier 3 and your unlocked capital remains. This is a one-way door for your account state.

Consider that before flipping the switch "just to try something" — you cannot get your Tier 1 constraints back.

## How you know it is off

You will not miss it:

- An amber **DISCIPLINE OFF** pill appears in the top bar on every screen, linking to the control centre.
- A yellow banner sits on the trading desk: *"Discipline Mode is off. Rules are bypassed, full virtual capital is unlocked, and these trades do not affect your discipline score."*
- The Discipline Mode page reads *"Free play is active"* and offers a **Restore protection** button.

## When free play is genuinely useful

There are legitimate reasons to use it:

- **Learning the mechanics** of a strategy structure without a stop-loss requirement forcing your hand.
- **Testing a multi-leg idea** that the averaging-down or direction-flip rules would block for structural rather than behavioural reasons.
- **Exploring the interface** without consuming your daily trade allowance.

What it is not useful for is trading your way out of a bad day. If you find yourself reaching for the switch after hitting your loss cap, that is precisely the moment the rule was written for.
