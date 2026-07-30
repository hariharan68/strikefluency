# StrikeFluency engineering documentation

**Documentation status:** source-verified on 2026-07-30

**Application version:** FastAPI reports `1.0.0`; frontend package reports `0.1.0`

**Scope:** all application, migration, test, configuration, and repository
automation files present on the `main` branch at the verification date

StrikeFluency is a paper-only Indian index-options simulator. It combines local
virtual execution, discipline enforcement, journaling, analytics, option-chain
intelligence, and read-only broker market data for NIFTY, BANKNIFTY, and SENSEX.
No code path submits, modifies, or cancels an order at a broker.

This directory is the canonical engineering documentation set. When a statement
here conflicts with executable code, an Alembic migration, or a test, the code
wins and the documentation must be corrected in the same change.

## Start here

| Need | Document |
|---|---|
| Understand the product and implemented scope | [Product and requirements](PRODUCT_AND_REQUIREMENTS.md) |
| Understand components and runtime flows | [Architecture](ARCHITECTURE.md) |
| Run the application locally | [Development setup](DEVELOPMENT.md) |
| Configure environments and providers | [Configuration reference](CONFIGURATION.md) |
| Work on FastAPI, services, schedulers, or providers | [Backend guide](BACKEND.md) |
| Work on React, state, routing, or styling | [Frontend guide](FRONTEND.md) |
| Understand order, funds, and discipline behavior | [Trading and discipline](TRADING_AND_DISCIPLINE.md) |
| Find an HTTP or WebSocket endpoint | [API reference](API_REFERENCE.md) |
| Understand tables, ownership, and migrations | [Data model](DATA_MODEL.md) |
| Review security controls and trust boundaries | [Security](SECURITY.md) |
| Deploy, operate, back up, or recover the service | [Operations and deployment](OPERATIONS.md) |
| Run tests and reproduce CI | [Testing and quality](TESTING.md) |
| Diagnose common failures | [Troubleshooting](TROUBLESHOOTING.md) |
| Add a route, table, provider, or feature safely | [Contributing and extension guide](CONTRIBUTING.md) |
| Understand deliberate architectural exceptions | [Architecture decision records](adr/README.md) |

## System at a glance

| Area | Implemented system |
|---|---|
| Backend | Python 3.11, FastAPI, SQLAlchemy 2.0, Alembic |
| Frontend | React 18, Vite 5, Zustand, React Router 6, Axios, Recharts |
| Durable store | PostgreSQL 16; 27 ORM tables and one linear Alembic head |
| Coordination/cache | Redis 7 for scheduler leadership, Kite state/ticks, rate slots, and optional JWT JTI denial |
| API | 112 HTTP operations plus one authenticated WebSocket route |
| Market data | mock, Fyers, or Kite; exactly one selected provider per process |
| Execution | local paper ledger only; no broker order interface exists |
| Background work | APScheduler for broadcasts, fills, exits, snapshots, EOD work, catalog sync, and token cleanup |
| CI | GitHub Actions: PostgreSQL 16 + Redis 7, Alembic from empty DB, pytest, frontend production build |

## Non-negotiable contracts

1. **Every route is authenticated or deliberately public.**
   `app/core/security_kernel.py` audits the complete FastAPI route graph at
   import time. An unclassified route prevents startup.
2. **Broker access is market-data-only.**
   `app/core/paper_trading_policy.py` rejects unsafe configuration and wraps
   broker SDKs with read allowlists.
3. **Every virtual balance change has a matching ledger row.**
   Only `app/services/ledger_service.py` writes `virtual_accounts.balance`.
4. **Execution is market-hours-bound.**
   State-changing entry and exit paths use the 09:15-15:30 IST execution gate;
   off-hours display data in development does not bypass it.
5. **REST is the durable client source of truth.**
   WebSocket `trading_update` events contain a reason only and tell clients to
   refetch REST state after a committed change.

## Documentation conventions

- Paths are relative to the repository root unless stated otherwise.
- Times are Asia/Kolkata (IST) unless a section explicitly says UTC.
- Money is represented with `Decimal` in database-facing backend code; the pure
  `app/strategy/` mathematics package uses floats.
- “Supported” means an executable code path and test or schema exist. “Deferred”
  means no production implementation exists, even if a marketing page mentions it.
- `/api/v1` is omitted only when a table clearly labels paths as relative API paths.
- Swagger UI, ReDoc, and OpenAPI JSON exist only when
  `ENVIRONMENT=development`.

## Keeping this set current

Update the affected document whenever a change modifies routes, configuration,
tables, invariants, scheduled jobs, provider behavior, user-visible flows, or
deployment requirements. Useful drift checks are:

```powershell
# Route count and route inventory
cd backend
& .\.venv\Scripts\python.exe -c "from app.main import app; print(app.state.security_audit)"

# Current schema head
& .\.venv\Scripts\alembic.exe heads

# Tracked repository inventory
cd ..
git ls-files
```
