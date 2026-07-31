---
title: Editing rules and presets
description: Tuning your rulebook, and the three presets that ship with the app.
status: stable
---

# Editing rules and presets

Your rules are yours. The defaults are a sensible starting point, not a prescription.

## Where to edit them

**Discipline Mode → Rules.** Each rule is shown as a card with:

- Its **category** — risk, execution or behaviour
- Its **purpose** — why the rule exists
- Its **effect** — what it does to your orders
- Its **trigger** — what causes it to fire
- Its **severity** — critical, high or medium
- An **editable value** or an on/off toggle

Numeric rules (max trades, loss percentage, cooldown minutes) take a value. The rest are simple switches.

The command bar at the top shows how many rules are currently in force, as `N/7 rules effective`.

## Presets

Three presets set all seven rules at once:

| | Beginner | Intermediate | Advanced |
|---|---|---|---|
| Max trades per day | 2 | 4 | 6 |
| Max daily loss | 1.5% | 2% | 3% |
| Revenge cooldown | 30 min | 20 min | 10 min |
| Mandatory stop-loss | On | On | On |
| Mandatory setup tag | On | On | On |
| No averaging down | On | On | On |
| No direction flip | On | On | **Off** |

Apply a preset from **Discipline Mode → Settings**.

**Beginner** is deliberately restrictive. Two trades a day feels punishing and that is the point — it forces selectivity, which is the skill most new traders lack.

**Advanced** loosens the caps and turns off the direction-flip rule, on the assumption that an experienced trader running positions across indices will hit that rule's instrument-blind behaviour constantly.

## Tuning individual rules

Some guidance on the numbers that matter:

**Max trades per day.** Set this to slightly *fewer* trades than you think you need. If you routinely hit the cap and feel constrained, that is information — either your edge genuinely requires more frequency, or you are overtrading. The journal will tell you which.

**Max daily loss.** 2% of ₹1,00,000 is ₹2,000. Lower it if you find yourself trading to recover; raise it only if your position sizing genuinely requires more room. Remember it is measured against your *initial* balance, so it does not shrink as you draw down.

**Revenge cooldown.** Fifteen minutes is enough to break the emotional loop for most people. If you notice your worst trades cluster right after losses, extend it to 30.

## Turning a rule off

Every rule can be individually disabled, and doing so is a legitimate choice — the direction-flip rule in particular is genuinely awkward if you trade multiple indices.

This is different from turning **Discipline Mode** off, which bypasses everything at once and has side effects on your capital and scoring. Disabling one rule keeps the rest enforced and does not touch your account.

## Notification preferences

**Discipline Mode → Settings** also has notification toggles for things like remaining trades, risk usage, cooldown status, score drops, blocked trades, streak milestones and tier progress.

These are stored **in your browser** for that device only, and are separate from the server-side notification preferences in the main Settings screen.
