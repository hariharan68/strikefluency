---
title: Filters and export
description: Finding trades, the four journal tabs, and getting your data out.
status: stable
---

# Filters and export

## The four tabs

| Tab | Contents |
|---|---|
| **Trades** | The entry list |
| **Analytics** | Journal-specific metrics |
| **Calendar** | Trades laid out by date |
| **Playbook** | Patterns drawn from your history |

The **Calendar** view is good for spotting clusters — a run of red on consecutive days usually means something behavioural rather than strategic.

## Metric cards

| Metric | Meaning |
|---|---|
| **Realized P&L** | Total booked profit |
| **Win rate** | Winners against losers |
| **Profit factor** | Gross profit ÷ gross loss |
| **Rule adherence** | Percentage of trades that were compliant |
| **Review completion** | Percentage of entries you have reviewed |

**Profit factor** above 1.5 is solid. Below 1.0 means you are losing money.

**Review completion** is the one to keep high. A journal you do not review is just a database.

## Quick views

Five one-click filters:

- **All trades**
- **Needs review** — your working list
- **Rule violations** — trades that broke a rule
- **Winners**
- **Losses**

## Search and filters

A free-text search covers instrument, strike and setup. Alongside it, four dropdowns filter by:

- **Setup tag**
- **Result** — winner or loser
- **Review status**
- **Discipline** — compliant or not

Combining them is where it gets useful. *Rule violations + winners* is a particularly uncomfortable and instructive list — trades where breaking your rules paid off. Those are the ones that teach bad habits, and seeing them collected together helps inoculate against the lesson.

## Table options

- **Optional columns** — entry-to-exit prices, holding time
- **Density** — comfortable or compact
- **Pagination** — 10 rows per page, loading 100 entries at a time

## Row indicators

Each row shows a review state (`Reviewed` / `Review started` / `Needs review`) and a discipline pill reading `100%` or `0%` — a trade either was compliant or was not.

## Export

**Export** downloads a CSV with these columns:

`Date · Instrument · Strike · Type · Side · Setup · Entry · Exit · P&L · Charges · Duration · Discipline · Reviewed`

Useful for pivot-table analysis, or for keeping a record outside the app.

Note the export does **not** include your written thesis and review text — only the structured fields. If those notes matter to you, they live in the app.

## Positions exports

Separately, the positions workspace has its own **Export CSV** which exports whichever tab is active — live positions, tradebook, orderbook, pending orders or logs. Files are named `strikefluency-{tab}-YYYY-MM-DD.csv`.
