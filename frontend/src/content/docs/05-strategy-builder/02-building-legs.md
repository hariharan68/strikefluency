---
title: Building legs
description: The leg table, per-leg controls and the bulk editing tools.
status: stable
---

# Building legs

Each row in the leg table is one contract in your structure.

## Per-leg controls

| Control | What it does |
|---|---|
| **Include** | Checkbox — temporarily exclude a leg without deleting it, to see its contribution |
| **B / S** | Flip the leg between buy and sell |
| **Expiry** | Per-leg expiry — this is what makes calendar spreads possible |
| **Strike** | Stepper moving in the instrument's strike interval |
| **Type** | `CE`, `PE` or `FUT` |
| **Lots / Qty** | Quantity stepper; the unit toggle switches between lots and contracts and is remembered |
| **Price** | Editable — override the market price to explore what-if scenarios |

Expanding a leg reveals a detail row with an **IV override** and the live LTP.

## Per-leg expiry and calendar spreads

Because each leg carries its own expiry, calendar and diagonal spreads work properly. The `long_calendar_calls` and `long_calendar_puts` templates set this up for you.

## Price overrides

The editable price field is the most underrated control here. It lets you ask "what if I could get this leg two rupees cheaper?" and see the payoff curve respond immediately.

This is how you find out whether a structure's attractiveness depends on a fill you are unlikely to actually get.

## IV overrides

Similarly, overriding implied volatility on a leg lets you stress-test a structure against a volatility change. Build a short straddle, push IV up 20%, and watch what happens — that is the lesson every short-volatility trader eventually learns expensively.

## Bulk edits

Three tools operate on the whole structure at once:

- **Shift spread** — move every strike up or down together, keeping the structure intact
- **Widen / narrow spread** — expand or contract the distance between legs
- **Move hedge** — reposition the protective leg only

These matter because adjusting a four-leg condor one strike at a time is tedious and error-prone. Shifting the whole thing preserves the relationships you set up.

## Lots versus contracts

The unit toggle switches the quantity steppers between lots and contracts, and your preference is stored in the browser.

Lots are usually the right mental model for building — an iron condor is "one lot of each leg", not "65 of these and 65 of those".

## Saving your work

- **Saved Strategies** — named structures you can reopen
- **Draft Portfolios** — work-in-progress workspaces

Both persist to your account. You can also share a structure via URL — the builder encodes the configuration into the link, so a colleague opening it sees exactly what you built.

## A word on complexity

Ten legs is the ceiling, but complexity is not sophistication. Most structures worth trading have two to four legs. If you find yourself at eight, check whether you have built something coherent or just something complicated.

The payoff graph is the honest test: if you cannot explain the shape in one sentence, you probably should not trade it.
