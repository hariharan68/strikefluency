# ADR 0002 — a subscription seam, not billing machinery

**Status:** Accepted · 2026-07-27
**Context:** Architecture gap #9, from `PAPER_TRADING_SAAS_ARCHITECTURE.md` §21, §41

## Decision

Ship `users.plan` and `require_plan()`. Do not build `subscription_plans`,
`subscriptions` or `payments` tables, and do not integrate a payment provider.

## Why

StrikeFluency is free and has no paying users. Payment rails nobody uses are
the clearest over-scope in the architecture doc: they carry real ongoing cost
(webhook handling, proration, refunds, PCI-adjacent scope, provider API churn)
against zero current benefit, and they would be built against guessed
requirements — what the tiers are, what they gate, what a downgrade does to an
open position — none of which are known.

What is expensive to add later is not the billing integration, which is
well-trodden. It is the **column on a live `users` table** and the **shape of
the gate** threaded through every route. So those exist:

- `users.plan`, defaulting to `'free'`, constrained by `ck_users_plan`
- `Plan.ORDER`, so "at least pro" is expressible and unknown values fail closed
- `require_plan(minimum)`, a real check behind `settings.BILLING_ENABLED`

`BILLING_ENABLED` is `False`, so the gate admits everyone. That is not a stub
that silently does nothing — it is an explicit kill switch, tested on both
sides, so the gate can be wired onto routes today and is already correct the
day it is switched on.

## What would change this

A decision to charge for something specific. At that point the questions above
have answers, and the tables can be designed against them rather than against a
guess.

## Consequence

`PAPER_TRADING_SAAS_ARCHITECTURE.md` lists subscription and payment tables this
codebase does not have, on purpose. `tests/unit/test_plans.py` fails if
subscription or payment models appear without this file being updated in the
same commit.
