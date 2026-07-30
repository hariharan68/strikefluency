# Testing and quality

**Verified:** 2026-07-30

**Collected backend cases:** 419

**Frontend unit files:** 5

## 1. Quality gates

The enforced gates are backend pytest, Alembic upgrade from empty PostgreSQL 16,
Redis-backed CI environment, frontend Node tests, and the Vite production build.

No linter, formatter, static type checker, coverage threshold, browser E2E
suite, dependency audit, or deployment is currently enforced by CI. Do not claim
those checks passed unless run separately.

## 2. Backend test layout

```text
backend/tests/
├── conftest.py             shared session/client/user/schema fixtures
├── unit/                   pure and isolated boundary tests
└── integration/            PostgreSQL transaction, constraint, route, and concurrency tests
```

Unit coverage includes discipline, strategy templates/payoff/builder, option
math, brokerage/slippage, instruments, market hours/freshness, providers,
paper/route boundaries, JWT hardening, leadership, ledger AST checks, events,
WebSockets, and analytics helpers.

Integration coverage includes auth/admin scoping, orders/concurrency, stale
gating, LIMITs, exits, discipline mode, journal/analytics, ledger/audit triggers,
snapshots, strategies, and settings.

## 3. Run backend tests

```powershell
cd backend
pytest -q
pytest --collect-only -q

# Focused examples
pytest -q tests\unit\test_security_kernel.py
pytest -q tests\integration\test_order_concurrency.py::test_concurrent_retry_creates_exactly_one_order

# Optional, not gated
pytest --cov=app --cov-report=term-missing
```

Integration tests use PostgreSQL row locks, JSONB, triggers, and constraints.
They self-skip when PostgreSQL is unreachable and normally run in a rolled-back
outer transaction. A green run with skips is not CI-equivalent.

Committed-user concurrency tests have explicit teardown. New user/account FK
tables must be added to their child-before-parent cleanup.

## 4. Reproduce CI

CI supplies PostgreSQL 16 and Redis 7 and sets:

```dotenv
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/strikefluency_test
SECRET_KEY=ci-only-secret-key-with-at-least-32-characters
ENVIRONMENT=testing
MARKET_DATA_PROVIDER=mock
REDIS_URL=redis://127.0.0.1:6379/0
```

Then it installs development dependencies, applies all migrations, and runs the
suite. Equivalent PowerShell after starting services and creating the DB:

```powershell
cd backend
$env:DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/strikefluency_test"
$env:SECRET_KEY="ci-only-secret-key-with-at-least-32-characters"
$env:ENVIRONMENT="testing"
$env:MARKET_DATA_PROVIDER="mock"
$env:REDIS_URL="redis://127.0.0.1:6379/0"
alembic upgrade head
pytest -q
```

`testing` is neither development nor production. Both settings helpers use exact
equality. Gate on `is_production` when strictness is production-only; `not
is_development` unintentionally includes CI.

## 5. Migration verification

CI starts from empty schema. Reproduce on a fresh disposable database, not only
a patched development DB:

```powershell
createdb -U postgres strikefluency_migration_check
$env:DATABASE_URL="postgresql://postgres:<password>@localhost:5432/strikefluency_migration_check"
alembic upgrade head
alembic current
```

Review schema/trigger creation, then remove the disposable database through your
normal administration process. Never target a development/production DB with
destructive test cleanup.

## 6. Frontend checks

```powershell
cd frontend
npm ci
npm test
npm run build
```

`npm test` runs `node --test`. Current tests cover API error normalization, live
P&L, payoff-axis behavior, discipline config, and theme logic. `npm run build`
catches JSX/import/bundling errors and is the frontend CI gate.

`npm run visual-check` invokes Playwright locally. It is not a CI gate.

## 7. Test design conventions

- Patch time/provider boundaries rather than weakening runtime safety.
- Use `Decimal` for money and assert ledger rows plus balance.
- Assert success and rollback around locks/transactions.
- Pin event strings because the frontend dispatches on them.
- Test idempotent replay and same-ID conflict.
- Test ownership with a second tenant/user.
- Test production and `testing` branches when they differ.
- Test scheduler leader, non-leader, and Redis failure.
- Test append-only ORM and raw SQL UPDATE.
- Include FastAPI 422 array errors in UI tests.

## 8. Change-specific minimum matrix

| Change | Minimum focused checks |
|---|---|
| Route/auth | security kernel, auth hardening, unauthorized/role/tenant cases |
| Order/funds | placement, concurrency, ledger, market hours, freshness, journal |
| LIMIT/protection | pending orders, auto exit, EOD cleanup, events |
| Strategy | builder, payoff/templates, integration, ledger/margin |
| Provider | provider tests, freshness, paper boundary, environment branches |
| Model/migration | fresh upgrade, fixtures/teardown, constraints/triggers |
| Frontend auth | auth/API-error tests, build, cold restore/concurrent 401 manual flow |
| WebSocket | manager/event tests, reconnect/refetch manual flow |
| Theme/UI | unit tests, production build, four-theme visual check |

Finish with the full backend suite and frontend build for cross-layer changes.

## 9. Interpreting failures

- Import-time `SECURITY KERNEL`: route lacks auth/public classification.
- Order tests fail only in CI: inspect `ENVIRONMENT` and mock freshness logic.
- Integration tests skip: test database is unavailable.
- Teardown FK error: update schema patcher/explicit cleanup.
- Ledger AST failure: direct balance write exists.
- Frontend blank page: inspect console and raw API error rendering.
