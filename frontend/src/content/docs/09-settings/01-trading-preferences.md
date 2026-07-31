---
title: Trading preferences
description: The six settings that shape how the desk behaves.
status: stable
---

# Trading preferences

**Settings → Trading Preferences.** Note that each Settings section has its **own Save button** — toggling a switch does not persist it until you save.

## The settings

| Setting | Default | What it does |
|---|---|---|
| **Default Instrument** | NIFTY | Which underlying is selected when you open the desk |
| **Default Lots** | 1 | Pre-fills the quantity field. Range 1–50 |
| **Confirm Before Closing** | **On** | Asks for confirmation before exiting a position or cancelling an order |
| **Show Risk Warnings** | On | Displays risk warnings on the desk |
| **Auto-fill LTP from Chain** | On | Pre-fills the order price from the strike you clicked |
| **Trading Margin — Leverage** | **On** | 5x leverage: orders block contract value ÷ 5. Off blocks the full contract value |

## Leverage, in detail

This is the setting with the largest effect on how the app feels.

**ON (5x)** — *"orders block only the leveraged margin (5x)"*. A ₹7,800 contract blocks ₹1,560. You can hold several positions on ₹1,00,000.

**OFF (1x)** — *"orders block the full contract value from your sandbox funds"*. That same contract blocks ₹7,800. You hold far fewer positions.

### Which to use

Leverage **off** is the better practice setting, and it is worth considering despite the default.

With 5x leverage on ₹1,00,000 you can hold roughly ₹5,00,000 of contract value, which is more exposure than the account should carry. Position sizing discipline is easy to ignore when margin is never the binding constraint — and position sizing is the skill that actually determines survival.

Turning it off makes capital feel scarce, which is the correct feeling.

## Confirm Before Closing

Leave this on. It adds one click to an exit and prevents the occasional mis-click that closes a position you meant to keep.

It also governs the confirmation when cancelling a resting limit order:

> Cancel this resting limit order? The blocked funds are released immediately.

## Default Lots

Setting this to your normal size saves typing. But be aware of the psychology — a pre-filled quantity is a suggestion, and suggestions get accepted. If your default is 3 lots, you will place 3-lot trades on setups that deserved 1.

Setting it to 1 forces a deliberate decision on every trade. That is mildly annoying and probably correct.

## Auto-fill LTP from Chain

With this on, clicking a strike's buy button pre-fills the ticket at the live premium. Turn it off if you want to type every price deliberately — some traders prefer the friction.

## Saving

Change what you need, then click **Save** in that section. Changes elsewhere on the page are saved by their own buttons independently.
