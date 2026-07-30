# Contributing and extension guide

This guide describes the repository-specific contracts that must remain true
when StrikeFluency changes. Read [Architecture](ARCHITECTURE.md),
[Security](SECURITY.md), and [Trading and discipline](TRADING_AND_DISCIPLINE.md)
before modifying execution, authentication, balances, or background jobs.

## Working agreement

- Treat source code, migrations, and tests as authoritative.
- Keep routers thin; put synchronous business logic in `backend/app/services/`.
- Services accept a database session and domain inputs, and raise exceptions from
  `backend/app/core/exceptions.py`.
- The router owns `commit()` unless the component is a documented autonomous
  transaction boundary.
- Preserve unrelated work in a dirty worktree.
- Update the affected document and `AGENTS.md` whenever architecture or a durable
  invariant changes.
- Never commit `.env`, `fyers_token.json`, `access_token.txt`, `fyers_logs/`,
  access/refresh tokens, OAuth secrets, broker secrets, or encryption keys.

## Change workflow

1. Identify the owning layer and existing tests.
2. Read the relevant ADRs under `Docs/adr/` before adding a seemingly missing
   table or subsystem.
3. Make the smallest coherent change while preserving the contracts below.
4. Add or update tests at the same layer.
5. Migrate an empty database when schema changed.
6. Run backend tests in the CI environment and run frontend tests/build when the
   client changed.
7. Update API, configuration, data-model, operations, and troubleshooting docs as
   applicable.

## Required architectural contracts

### Route classification

Every new HTTP or WebSocket route must be authenticated through its FastAPI
dependency tree or explicitly declared public with a reason in
`backend/app/core/security_kernel.py`. The startup audit is a process-binding
control; do not weaken or bypass it.

An ordinary private endpoint should take `CurrentUser`:

```python
from app.dependencies import CurrentUser

@router.get("/example")
def get_example(current_user: CurrentUser):
    ...
```

Use the active-admin dependency for administrative data and derive tenant scope
from the authenticated admin row, never from a request parameter.

### Paper-only broker boundary

Broker SDK usage must remain behind `ReadOnlyBrokerClient` or a comparably strict
allowlist. Do not add broker order placement, modification, cancellation,
positions, or holdings calls. Market-data payloads must pass
`assert_market_data_payload()` and must not carry private virtual-ledger fields.

Changing execution mode is an architectural redesign, not a configuration task.

### Funds ledger

Never assign, increment, or decrement `VirtualAccount.balance` outside
`backend/app/services/ledger_service.py`. Use `open_account`, `post`,
`block_margin`, `release_margin`, `charge`, `settle_pnl`, or `adjust` so the
signed ledger row and balance mutation share one transaction.

Ledger rows are append-only. Correct an error with a compensating row. Preserve
the invariant:

```text
virtual_accounts.balance = SUM(virtual_fund_ledger.amount)
```

### Instruments and money

Obtain lot size, strike interval, weekly-expiry support, and expiry weekday from
`backend/app/core/instruments.py:get_spec()`. Unknown symbols must fail rather
than inherit a default. Snapshot lot size onto new order records so later
contract revisions do not revalue history.

Use `Decimal` for money in persistence and services. The dependency-free pure
mathematics under `backend/app/strategy/` intentionally uses floats; conversion
belongs at its boundary.

### Market hours and freshness

Execution paths use `require_market_open()`; there is no `MARKET_HOURS`
discipline rule. Preserve the distinct freshness behaviors:

- placement raises on stale data;
- automated fill/exit scans skip and retry;
- manual/EOD/expiry close may use the bounded current-LTP fallback during market
  hours.

Mock availability in development is not permission to bypass execution hours.

### Lock ordering and idempotency

Single-order placement and closing serialize through the account. Close-related
paths preserve the account -> order -> position -> session lock order. Review
integration concurrency tests before changing query or lock order.

New retryable placement flows need a client-generated idempotency key with a
database uniqueness guarantee and semantic replay validation. Normalize prices
before comparing a replay with stored numeric values.

### Events and commits

Publish `TradingEvent` only after the state transaction commits. If work needs to
collect notifications before commit, use `DeferredPublisher`, flush after
commit, and discard on rollback. Event values are a frontend wire contract and
are pinned by tests.

`trading_update` remains notify-then-refetch and carries no position/order
payload. Adding payload would create a second client-side source of truth.

## Adding a backend endpoint

1. Add request/response schemas under `backend/app/schemas/` when the shape is
   reused or non-trivial.
2. Implement business behavior in the appropriate service.
3. Add a thin route under the correct `/api/v1` router.
4. Add authentication and, where appropriate, `require_plan()` in addition to
   authentication.
5. Convert domain exceptions to the established HTTP response shape.
6. Commit in the router, then publish any trading update.
7. Add unit and/or integration tests, including authorization and tenant scope.
8. Update [API reference](API_REFERENCE.md) and security documentation.

Public routes require an explicit security review because they enlarge the
unauthenticated attack surface.

## Adding a database table or column

1. Add a typed SQLAlchemy 2.0 model with explicit constraints and indexes.
2. Export/import it where metadata discovery requires it.
3. Create a linear Alembic revision; verify `alembic heads` still reports one
   head.
4. Test `alembic upgrade head` against an empty database, not only an existing
   developer database.
5. If a new table references users or virtual accounts, update the integration
   test schema-drift patcher and the `committed_user` teardown in
   `backend/tests/integration/test_order_concurrency.py`.
6. Extend cleanup/retention and admin visibility deliberately.
7. Update [Data model](DATA_MODEL.md).

Append-only business records should reuse the existing model/DDL guard pattern.
Do not add `executions`, subscription, or payment tables without revisiting the
accepted ADRs and the product requirement that makes them necessary.

## Adding or changing a scheduled job

Classify the job first:

- broadcasts may run in every process and should skip expensive work when there
  are no WebSocket clients;
- database mutations must be leader-gated and must run even with no clients.

State jobs need idempotent behavior, explicit market-time semantics, bounded
failure scope, logging, and safe transaction ownership. Add the job to
`backend/app/market/market_scheduler.py`, its tests, the scheduler tables in
[Backend](BACKEND.md) and [Operations](OPERATIONS.md), and document required
Redis behavior.

## Adding a market-data provider

Implement the provider protocol used by `provider_factory`, including source
metadata and timestamps that the shared freshness module can interpret. Decide
and test:

- authentication and token hydration;
- spot, option-chain, status, and history capabilities;
- cache TTLs and orderability limits;
- simulated/fallback labeling;
- development and production failure behavior;
- shutdown/cleanup behavior;
- compatibility with the read-only broker boundary.

Register the provider explicitly. Unknown names must fail; never silently select
a default for a misspelled production setting.

## Adding a discipline rule

Add the enum/value, default configuration, enforcement logic, persistence and
serialization behavior, rule-management UI, and tests together. Decide whether
the rule is valid for a whole strategy; per-leg enforcement can incorrectly
reject deliberately multi-directional strategies. Update the canonical list in
[Trading and discipline](TRADING_AND_DISCIPLINE.md).

Execution-safety checks such as market hours and quote freshness belong outside
the configurable discipline rules.

## Frontend changes

- Keep the access token in memory; do not introduce `localStorage` persistence.
- Use the existing Axios refresh single-flight and auth epoch protections.
- Normalize API errors through `utils/apiError.js` before rendering them.
- Use Zustand stores for shared auth, market, trading-event, and preference state.
- Treat WebSocket trading events as invalidations and reload REST data.
- Add protected pages beneath `ProtectedRoute` and `AppLayout`; use `AdminRoute`
  for admin UX, while retaining backend authorization.
- Use CSS custom properties from `src/styles/index.css`; avoid new hardcoded
  colors and use `--on-primary` on accent backgrounds.
- Preserve the dense, scannable trading surface.

If multiple TSX components are introduced, note that this repository's frontend
is currently JavaScript/JSX; do not create an accidental mixed migration without
an explicit tooling decision.

## Verification matrix

| Change | Minimum verification |
|---|---|
| Documentation only | link/path checks, source cross-check, `git diff --check` |
| Backend logic | focused tests plus full `pytest -q` in testing environment |
| Route/auth | security-kernel and endpoint authorization tests |
| Funds/order flow | ledger-boundary, service, and concurrency tests |
| Schema | empty-database Alembic upgrade, full backend tests |
| Frontend behavior | `npm test` and `npm run build`; browser flow when interactive |
| Scheduler/provider | unit tests plus Redis/provider failure-path validation |

Canonical backend reproduction:

```powershell
cd backend
$env:ENVIRONMENT = "testing"
$env:MARKET_DATA_PROVIDER = "mock"
$env:REDIS_URL = "redis://127.0.0.1:6379/0"
& .\.venv\Scripts\alembic.exe upgrade head
& .\.venv\Scripts\pytest.exe -q
```

Canonical frontend verification:

```powershell
cd frontend
npm test
npm run build
```

## Review checklist

- Does the change preserve route classification, paper-only access, ledger
  reconciliation, market-hours enforcement, freshness semantics, and lock order?
- Are tenant and user scopes derived from authenticated state?
- Are commits and post-commit events ordered correctly?
- Are time zones explicit and money values precise?
- Are failure behavior and retry/idempotency defined?
- Is every new configuration key documented with its production implications?
- Do migrations work from an empty database and leave one head?
- Do API, data, operations, and troubleshooting docs match the implementation?
