# Architecture decision records

Architecture decision records explain intentional choices that may otherwise
look like missing implementation. They are normative for maintainers until a
later ADR supersedes them.

| ADR | Status | Decision |
|---|---|---|
| [0001](0001-executions-table-deferred.md) | Accepted | Use `virtual_orders` as the fill record until partial fills exist. |
| [0002](0002-no-billing-machinery.md) | Accepted | Keep the plan-gating seam without subscription/payment machinery. |

## Adding an ADR

Create a sequentially numbered Markdown file when a change introduces or
reverses a consequential architectural constraint. Record context, decision,
alternatives, consequences, and the conditions that would justify revisiting
it. If a decision changes, add a new ADR and mark the old record superseded; do
not silently rewrite history.

For current system structure, see [Architecture](../ARCHITECTURE.md). For the
implemented product boundary, see
[Product and requirements](../PRODUCT_AND_REQUIREMENTS.md).
