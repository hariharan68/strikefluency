---
title: The order ticket
description: Every field in the order window and what it does.
status: stable
---

# The order ticket

Hovering the **LTP** cell of any strike reveals a **B** and an **S** button. Clicking either opens the order ticket — a small draggable window you can reposition anywhere on screen. Press **Esc** to close it.

## Header

The header shows the contract you are trading and carries the **B / S** buttons, which flip the side without reopening the ticket.

## Product type

| Product | Behaviour |
|---|---|
| **Intraday** | Squared off automatically at **15:29 IST** |
| **Positional** | Carries forward to the next session |

Note that expiry-day contracts are cash-settled at the end of the day regardless of which product you chose.

## Quantity

Type the number of **contracts**. The stepper rounds to whole lots and displays the result underneath as `N lots × lotSize`.

Your **default lots** setting (1–50, configured in Settings) pre-fills this field.

## Order type

**Market** — the price field is read-only and shows the live premium. The ticket tells you plainly: *"Fills at live premium."*

**Limit** — you type the price you want. The ticket then tells you what will happen:

- If your limit is already better than the market: *"Already at market — this will fill almost immediately."*
- Otherwise: *"Waits until the premium falls to / rises to X. Nothing opens until then."*

The two behave very differently. See [Market vs limit orders](/docs/market-vs-limit-orders).

## Advanced fields

With Discipline Mode on, this section is expanded by default because two of its fields are mandatory.

### Stop Loss ★

Required whenever the mandatory stop-loss rule is active. It must be on the correct side of the current premium:

- **Buy order** — stop-loss must be **below** the live premium
- **Sell order** — stop-loss must be **above** the live premium

Getting this backwards produces a specific rejection naming both your stop and the current LTP.

### Target

Optional. Same directional logic, in reverse.

### Setup Tag ★

Required when the mandatory setup tag rule is active. Your options are:

| Tag | Use it when |
|---|---|
| `OI_BASED` | The trade is driven by open interest positioning |
| `PRICE_ACTION` | Candles, structure, momentum |
| `LEVEL_TRADE` | A support, resistance or pivot level |
| `EXPIRY_PLAY` | An expiry-day specific setup |
| `OTHER` | Anything else |

The point is not the taxonomy. It is that you cannot place a trade without having articulated *why* — which is exactly the pause most impulsive entries lack.

## The footer

Before you submit, the footer shows:

- **Funds required** — with `(5x)` or `(1x)` indicating your leverage setting
- **Available** — what you have left
- **Est. charges** — an estimate, labelled *"charged now + on exit"*, or *"charged on fill"* for a resting limit order

## The submit button

The button text tells you exactly what will happen:

- `SIMULATE BUY · N qty` — a market order, filling now
- `PLACE LIMIT BUY · N qty` — a limit order, which may rest

## Client-side blocks

Some checks happen in the browser before anything is sent, so you get instant feedback:

> Stop Loss is mandatory when Discipline is ON.

> Setup tag is mandatory when Discipline is ON.

> Enter a limit price above zero, or switch to Market.

Everything else — the seven discipline rules, margin, market hours — is checked on the server. If one of those fails and no specific message comes back, you will see the general fallback:

> Order failed — check discipline rules, margin, or market hours.
