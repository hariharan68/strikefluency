---
title: What is not available yet
description: An honest list of everything incomplete, missing or deliberately absent.
status: partial
---

# What is not available yet

Documentation that only describes what works is a way of wasting your time. This page is the complete list of gaps, so you can stop looking for things that are not there.

## Empty pages

Three routes exist and are reachable but contain nothing:

| Page | Where | State |
|---|---|---|
| **Tools** | Sidebar | *"This page is empty for now."* |
| **Reports** | Profile menu | *"Generated trading and account reports will appear here."* |
| **API Key** | Profile menu | *"API credential management will be available here."* |

Note the Dashboard's **Reports tab** is a different thing and does work — it shows your discipline report. Only the `/reports` page from the profile menu is empty.

## Capital tier promotion

**The 15-trade streak does not award capital.**

The dashboard shows a tier badge and a progress bar reading *"N clean trades to next tier"*. Reaching 15 does not promote you to Tier 2 or credit ₹5,00,000 — no code performs that promotion.

The streak is a genuine measure of consecutive disciplined trades and worth watching as a behavioural scoreboard. Just do not wait for a reward at 15.

The only thing that changes your tier is turning **Discipline Mode off**, which jumps straight to Tier 3.

## India VIX

Always displays as `—` in the option chain header. Not supplied by the data layer with any provider.

## Backtesting and historical replay

**Neither exists.** The strategy builder evaluates price scenarios you specify — a target price and a target date. It cannot replay historical data or tell you how a structure would have performed in the past.

## Partial fills and partial closes

Not supported. One order maps to at most one position, and that position closes entirely or not at all. There is no scaling out.

## Real broker execution

Deliberately absent, and it will stay that way. The broker connection is **market data inbound only**. StrikeFluency cannot place orders, read your real positions or holdings, or access your funds. This is a policy boundary enforced in code.

## Payments

Despite the pricing page, there is **no checkout, no billing and no subscription enforcement**. The plan-gating mechanism exists in the code as a disabled seam. Every account currently has full access to everything.

## Discipline rule gaps

Two behaviours worth knowing:

- **No averaging down** and **no direction flip** apply to **BUY orders only**. Short entries bypass both.
- **No direction flip** ignores the instrument — an open NIFTY CE blocks a BANKNIFTY PE buy.

Strategies are checked against only three of the seven rules. See [Executing a strategy](/docs/executing-a-strategy).

## Account management

- No password change from within the app
- No self-service account deletion or reset
- No two-factor authentication on your StrikeFluency account
- No role management interface

## Notifications

In-app only. No email, SMS or push.

## Provider coverage gaps

**Fyers** — historical data and futures return *not implemented*.

## Market data

Exchange holidays are not modelled separately, so a weekday holiday will still appear as an open market.

## Navigation quirks

- The `/discipline` report page is not in the sidebar. Reach it via the Dashboard's Reports tab.
- Three different things are called "Reports": the Dashboard tab (works), the profile-menu page (empty), and the top-bar title of the discipline page.

## What this list means

None of this prevents the product doing what it is for — placing rule-checked practice trades, journalling them and tracking whether your discipline is improving. That entire loop works.

These are the edges. Now you know where they are.
