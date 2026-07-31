---
title: Tour of the interface
description: What every screen in the sidebar does, and where to find things that are not there.
status: stable
---

# Tour of the interface

## The shell

Once signed in, every screen shares the same frame:

- **Sidebar** on the left — the main navigation.
- **Top bar** — the current page title, a live IST clock with a market-open indicator, a theme toggle, a settings shortcut, and your profile menu.
- **Content area** — the page itself.

The sidebar can be collapsed with the small circular toggle on its edge, and your choice is remembered on that device.

## The sidebar, screen by screen

| Screen | What it is for |
|---|---|
| **Dashboard** | Your discipline score, today's guardrails, balance, P&L charts and the day's violations |
| **Terminal 1** | A live spot ticker for all three indices — LTP, change, session high/low, a tick sparkline and PCR sentiment |
| **Trade** | The main desk: option chain plus order ticket, with a Positions tab alongside |
| **Positions** | Live positions, tradebook, orderbook, pending limit orders and activity logs |
| **Strategy Builder** | Multi-leg strategies with payoff graphs, greeks and 32 ready-made templates |
| **Option Chain** | The chain on its own, full width |
| **Tools** | Empty placeholder — see below |
| **Discipline Mode** | The control centre for your rules, violations, progress and the master switch |
| **Journal** | Every closed trade, with tagging and review |
| **Analytics** | P&L curves, win rate, discipline trend and mistake breakdown |
| **Settings** | Preferences, themes, notifications, broker connections and security |

## Screens not in the sidebar

Three places are reachable only from the **profile menu** in the top bar:

- **Reports** — currently an empty placeholder.
- **API Key** — currently an empty placeholder.
- **Admin Page** — only visible to administrators; read-only views of users, audit trail and the funds ledger.

There is also a **Reports** tab inside the Dashboard which shows your discipline report — this is a different thing from the empty `/reports` page, despite the shared name.

## Placeholders you will run into

Three routes are wired up and reachable but contain nothing yet:

- **Tools** — *"This page is empty for now."*
- **Reports** — generated reports will appear here eventually.
- **API Key** — API credential management will live here.

They are listed in [What is not available yet](/docs/what-is-not-available-yet) along with everything else that is not built.

## Warning indicators

Two pills can appear in the top bar and both are worth acting on:

- **DISCIPLINE OFF** (amber) — your rules are bypassed. Click it to go to the control centre and switch protection back on.
- **Reconnect Zerodha** (amber) — your broker data feed has degraded and needs a fresh login.

## Themes and layout

There are four themes — one dark (**Obsidian Dark**) and three light (**Misty Teal**, **Forest Paper**, **Aqua Cloud**) — chosen in **Settings → Customization**. The sun/moon button in the top bar flips between dark and whichever light theme you last used.

The same section offers two sidebar layouts: **Default** with text labels, or **Icon Rail** with icons only and labels on hover. Icon Rail applies on wide screens only.

Both the theme and the layout are stored **per device**, not on your account — so your laptop and your desktop can differ.
