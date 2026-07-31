---
title: Discipline score and streak
description: Exactly how the two headline numbers are calculated.
status: stable
---

# Discipline score and streak

These are the two numbers the product actually cares about. Both are visible on the dashboard, the desk and the Discipline Mode page.

## The discipline score

**The percentage of your last 20 completed trades that were rule-compliant.**

```
score = (compliant trades ÷ total trades) × 100
```

Specifics that matter:

- The window is your most recent **20 completed** trades — not 20 days, not all time. It is a rolling measure of current behaviour.
- **Free-play trades are excluded** from both the numerator and the denominator.
- Open positions do not count. A trade enters the calculation when it closes.
- The result is rounded to two decimal places.

Because the window is 20, each trade moves the score by about five points. One violation in twenty is a 95. Two is a 90.

### How it is coloured

| Score | Colour | Reading |
|---|---|---|
| 80 and above | Green | Your process is holding |
| 50 – 79 | Amber | Slipping — check which rule |
| Below 50 | Red | The rules are not being followed |

The dashboard also shows a coaching line that changes at the 90, 70 and 40 thresholds.

### A trade is "compliant" when...

...it was placed without any rule being violated. Note this counts *attempted* violations recorded against the order, not merely whether it was blocked — an order that squeaked through with a warning still marks the trade non-compliant.

## The streak

**Consecutive rule-compliant closed trades.**

- Increments by one on each compliant close.
- **Resets to zero** on a single non-compliant close.
- Free-play trades are ignored entirely — they neither increment nor reset it.

The streak is deliberately brutal. Twenty clean trades followed by one sloppy one puts you back at zero, because that is how habits actually work.

### The 15-trade target

The dashboard shows progress toward **15 consecutive disciplined trades**, framed as *"N clean trades to next tier"*.

Be aware: **reaching 15 does not currently award any capital.** The tier promotion it implies is not implemented. Treat the streak as a behavioural scoreboard, which is genuinely what it is good for, and read [Your virtual account](/docs/your-virtual-account) for the full picture.

## Daily snapshots

A record is written each day capturing your score, the number of trades analysed, the violation count, and your streak at that point.

This is what powers the **30-day discipline trend** chart in analytics. It is worth checking weekly rather than daily — the trend line is more informative than any single day's number.

## What to actually watch

Early on, ignore P&L. A profitable week with a discipline score of 40 is a week you got lucky, and the habit you reinforced will cost you later.

The sequence that works is: get the score above 80, keep it there for a month, and only then start caring whether the strategy makes money. A disciplined trader with a mediocre edge outperforms an undisciplined one with a good edge, reliably.
