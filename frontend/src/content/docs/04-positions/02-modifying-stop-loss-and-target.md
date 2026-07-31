---
title: Modifying stop-loss and target
description: Adjusting protection on an open position, and what you are not allowed to change.
status: stable
---

# Modifying stop-loss and target

Click **Modify** on any open position to open the protection panel. It is draggable, so you can position it beside the chain.

## What the panel shows

A summary of the position first — side, quantity, entry price, current LTP and open P&L — so you are adjusting with context rather than from memory.

Then two editable fields:

- **Stop Loss** — marked *Required* when the mandatory stop-loss rule is in force
- **Target Price** — marked *Optional*

Each field has a live readout showing **projected P&L at that level**, updating as you type. This is more useful than it sounds: seeing "-₹1,240" under a stop you were about to widen is a good check on the impulse.

## Validation

The same directional logic as order entry applies:

| Message | Cause |
|---|---|
| `Stop Loss is mandatory while Discipline Mode is ON.` | You tried to clear a required stop |
| `Enter valid numeric prices or leave an optional field blank.` | Non-numeric input |
| `Stop Loss must be greater than zero.` | Zero or negative |
| `Stop Loss must be below the current premium of ₹X.` | Buy position, stop above LTP |
| `Stop Loss must be above the current premium of ₹X.` | Sell position, stop below LTP |
| `Target Price must be above the current premium of ₹X.` | Buy position, target below LTP |

## What you cannot do

**You cannot remove a mandatory stop-loss.** With Discipline Mode on and that rule active, you can move the stop but not delete it. Widening it is allowed; abandoning it is not.

This is the rule doing exactly what it should. The moment a position goes against you is the moment the stop feels wrong, and it is also the moment you are least qualified to judge that.

**You cannot modify a strategy leg.** Protection on multi-leg positions is managed at the strategy level. Only open, standalone, single-leg positions can be edited here.

## Saving

Saving updates the position and shows *"Stop Loss and Target Price updated"*.

The panel reminds you what happens next:

> Saved levels are monitored by the 5-second auto-exit sweep during market hours.

Which means your new levels are live immediately — you do not need to keep the tab open.

## A note on moving stops

The panel makes it easy to move a stop, and that is deliberate — sometimes a stop genuinely needs adjusting as a trade develops.

But the journal records your original thesis, and analytics will eventually show you the pattern. If your stops mostly move *away* from entry, you are not managing risk, you are deferring it. That habit shows up in the mistake breakdown as trades tagged `SL_TOO_TIGHT` that were not actually too tight.
