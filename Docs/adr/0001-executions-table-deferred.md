# ADR 0001: defer a separate executions table

- **Status:** Accepted
- **Decision date:** 2026-07-27
- **Last source verification:** 2026-07-30
- **Owners:** StrikeFluency maintainers

## Context

Trading systems commonly separate an order from its fills because one order can
execute in several quantities and at several prices. StrikeFluency does not
implement partial fills. A filled `VirtualOrder` creates one
`VirtualPosition`, and `virtual_positions.order_id` is protected by
`uq_virtual_positions_order_id`.

The current order row already records the data a one-to-one execution row would
contain:

| Execution concept | Current source |
|---|---|
| Filled quantity | `virtual_orders.quantity` |
| Fill price | `virtual_orders.entry_price` after slippage |
| Slippage | `virtual_orders.slippage_points` |
| Simulated entry charge | `virtual_orders.entry_brokerage` |
| Execution time | `virtual_orders.entry_time` |

Creating an `executions` table under the one-order/one-position constraint would
duplicate data written in the same transaction without adding information.

## Decision

Use `virtual_orders` as the execution record until partial fills become a real
product requirement. Do not add a one-to-one `executions` table.

## Consequences

- Order placement remains all-or-nothing.
- Position closing remains full-position rather than quantity-aware.
- Analytics and journaling read fill facts from `virtual_orders`.
- The schema avoids duplicate, fully derivable records.
- A future partial-fill design will require a deliberate migration rather than
  treating the current order model as already fill-aware.

## Revisit when

Reconsider this decision when any supported flow requires:

- several fills for one entry order;
- a resting order filled at several prices or times;
- a partial position exit; or
- quantity aggregation under one order identifier.

That redesign must address the unique position constraint, quantity-aware P&L
and margin, exit allocation, journal/analytics aggregation, and the interactions
with pending orders, automatic exits, EOD/expiry exits, and concurrency tests.

## Source evidence

- `backend/app/models/virtual_order.py`
- `backend/app/models/virtual_position.py`
- `backend/app/services/virtual_order_service.py`
- `backend/app/services/pending_order_service.py`
- `backend/tests/integration/test_order_concurrency.py`
