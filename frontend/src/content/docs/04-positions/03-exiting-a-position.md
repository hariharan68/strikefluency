---
title: Exiting a position
description: Closing at market, placing a limit exit, and which trigger wins when several fire at once.
status: stable
---

# Exiting a position

Click **Exit** on any open position. The panel has two tabs.

## Market — exit now

Closes at the current available premium.

The panel shows:

- **Transaction** — e.g. `SELL to close`
- **Order type** — Market
- **Quantity**
- **Reference premium** — the current LTP
- **Estimated P&L**

And a warning worth reading:

> Confirming exits at the current available premium. The final fill includes configured slippage and exit charges, so final P&L may differ from this estimate.

The estimate is a reference, not a promise. Slippage and charges are applied on the actual fill.

Click **Exit {N} at market** to confirm.

## Limit — exit at your price

Places a resting exit instruction. The position stays open until the premium reaches your level.

| Position | Exits when |
|---|---|
| **BUY** | Premium rises **to or above** your limit |
| **SELL** | Premium falls **to or below** your limit |

Buttons available:

- **Place limit exit** — set one
- **Update limit exit** — change an existing one
- **Cancel active limit** — remove it

An `Active` badge appears on the tab when a limit exit is resting.

Validation is straightforward: `Enter a valid limit premium.` and `Limit premium must be greater than zero.` You will see *"Limit exit instruction saved"* or *"Limit exit cancelled"* on success.

### Saving a limit exit outside market hours

This is allowed. You can set up your exits in the evening for the next session — nothing executes until the market opens, but the instruction is stored.

Placing an *entry* order outside hours is not allowed. The asymmetry is deliberate: planning an exit in a calm moment is exactly the behaviour the product wants to encourage.

## Trigger priority

A position can have a stop-loss, a target and an exit limit all set at once. If more than one would trigger on the same tick, the order is:

1. **Stop-loss**
2. **Target**
3. **Exit limit**

Stop-loss first, always. Capital protection outranks profit capture.

## Slippage on exits

Market exits and stop-loss fills include slippage, working against you. Your realised P&L will typically be slightly worse than the reference price.

**Limit exits are the exception.** Slippage may improve a limit exit fill, but it will never make it worse than the limit you set. If you asked for ₹150, you will not get ₹148.

## Confirmation

If **Confirm Before Closing** is enabled in Settings — it is on by default — you get a confirmation step before any exit executes. Leaving it on is recommended; a mis-click that closes a position is an annoying way to end a trade.

## Exiting strategies

Multi-leg strategies exit as a whole. The **Exit** button on the strategy summary row squares off every leg. Individual legs cannot be closed separately from this screen.
