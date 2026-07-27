# ADR 0001 — `executions` is `virtual_orders` until partial fills exist

**Status:** Accepted · 2026-07-27
**Context:** Architecture gap #2, from `PAPER_TRADING_SAAS_ARCHITECTURE.md` §21

## Decision

Do not create an `executions` table. `virtual_orders` is the execution record
until partial fills are a real product requirement.

## Why

The doc separates orders from fills so one order can have many executions. That
separation earns its keep only when partial fills exist. They do not, and they
cannot: `virtual_positions` carries

```
UniqueConstraint("order_id", name="uq_virtual_positions_order_id")
```

one order, one position. An `executions` table added under that constraint
would hold exactly one row per order, and every column it wants already exists:

| doc column          | already on `virtual_orders` |
|---------------------|-----------------------------|
| `quantity`          | `quantity`                  |
| `fill_price`        | `entry_price` (post-slippage) |
| `slippage`          | `slippage_points`           |
| `simulated_charges` | `entry_brokerage`           |
| `executed_at`       | `entry_time`                |

So the table would be a duplicate written in the same transaction as the row it
duplicates, and its backfill would be 100% derived data — data that would have
to be re-derived anyway once the schema changes for real partial fills.

## What would change this

Any of:

- partial fills on single orders (`close_position` is all-or-nothing today)
- an order resting across multiple fills at different prices
- averaging into a position under one order id

The first real requirement should drop `uq_virtual_positions_order_id`, add
`executions`, and rework `close_position` into a quantity-aware exit. That is a
substantial change to `auto_exit_service`, `eod_service`, `pending_order_service`
and the concurrency tests — worth doing once, deliberately, rather than half now.

## Consequence

`PAPER_TRADING_SAAS_ARCHITECTURE.md` §21 lists a table this codebase does not
have, on purpose. This file is the reason.
