# Development setup

**Verified:** 2026-07-30

## 1. Prerequisites

- Git.
- Python 3.11. The project pins `3.11.9` in `.python-version` and CI.
- Node.js 20 for parity with CI; npm is used with `package-lock.json`.
- PostgreSQL 16 running locally or on a reachable host.
- Redis 7 for parity with CI and for scheduler leadership/Kite. Mock or Fyers
  development can run one API process without Redis, but state-job safety then
  depends on that single-process topology.
- Docker Desktop is optional. This repository's `docker-compose.yml` starts
  **Redis and pgAdmin only**; it does not start PostgreSQL.

Default local ports are backend 8000, frontend 5173, PostgreSQL 5432, Redis
6379, and pgAdmin 5050.

## 2. Clone and inspect

```powershell
git clone <repository-url>
cd StrikeFluency
git status --short
```

Do not commit `.env`, `fyers_token.json`, `access_token.txt`, or `fyers_logs/`.

## 3. Start local supporting services

Start Redis and pgAdmin from the repository root:

```powershell
docker compose up -d
docker compose ps
```

Ensure PostgreSQL 16 is already running, then create the application database
if it does not exist:

```powershell
psql -U postgres -c "CREATE DATABASE strikefluency;"
```

pgAdmin is optional at `http://localhost:5050`. The development credentials in
`docker-compose.yml` are `admin@strikefluency.com` / `admin`; do not reuse them
for a public deployment. To reach host PostgreSQL from pgAdmin, use
`host.docker.internal:5432`.

## 4. Backend setup

### Recommended Windows bootstrap

From the repository root:

```powershell
.\scripts\setup-backend.ps1
Copy-Item backend\.env.example backend\.env
```

The script locates Python 3.11, creates `backend/.venv`, upgrades pip, and
installs `requirements-dev.txt` (which includes runtime dependencies).

### Manual setup

```powershell
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements-dev.txt
Copy-Item .env.example .env
```

For macOS/Linux, activate with `source .venv/bin/activate` and copy with
`cp .env.example .env`.

At minimum, set these values in `backend/.env`:

```dotenv
DATABASE_URL=postgresql://postgres:<password>@localhost:5432/strikefluency
SECRET_KEY=<at-least-32-random-characters>
ENVIRONMENT=development
EXECUTION_MODE=paper_only
BROKER_ACCESS_MODE=market_data_read_only
MARKET_DATA_PROVIDER=mock
REDIS_URL=redis://localhost:6379/0
TRUSTED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
FRONTEND_URL=http://localhost:5173
```

Generate a secret without writing it to shell history where practical:

```powershell
python -c "import secrets; print(secrets.token_hex(32))"
```

Apply every migration before starting:

```powershell
alembic upgrade head
alembic current
```

Start the API:

```powershell
uvicorn app.main:app --reload --port 8000
```

Expected development endpoints:

- health: `http://127.0.0.1:8000/health`
- Swagger UI: `http://127.0.0.1:8000/docs`
- ReDoc: `http://127.0.0.1:8000/redoc`
- OpenAPI: `http://127.0.0.1:8000/openapi.json`

Startup prints environment, provider, permanent execution modes, token TTL,
cookie mode, and authenticated/public route counts. Treat a startup refusal as
a safety failure to fix, not a guard to bypass.

## 5. Frontend setup

In a second terminal:

```powershell
cd frontend
npm ci
Copy-Item .env.example .env
npm run dev
```

The default empty `VITE_API_BASE_URL` uses Vite's `/api` proxy. The proxy target
defaults to `http://localhost:8000`; the WebSocket target defaults to
`ws://localhost:8000`. Open `http://localhost:5173`.

Use `npm install` only when intentionally changing dependencies and the lock
file. Use `npm ci` for reproducible setup and CI parity.

## 6. First local workflow

1. Keep `MARKET_DATA_PROVIDER=mock`.
2. Register without a tenant code. The first account becomes a tenant admin and
   receives a virtual account plus the default rules.
3. Open the dashboard/terminal to verify REST and WebSocket data.
4. Orders can execute only during the 09:15-15:30 IST boundary. Mock display
   data can continue off-hours in development; that does not permit execution.
5. If you need off-hours automated tests, use test fixtures that patch the
   market-time check. Do not weaken the production execution boundary.

## 7. Development commands

```powershell
# Backend test suite
cd backend
pytest -q

# CI-equivalent backend environment
$env:ENVIRONMENT="testing"
$env:MARKET_DATA_PROVIDER="mock"
$env:REDIS_URL="redis://127.0.0.1:6379/0"
pytest -q

# Frontend tests and build
cd ..\frontend
npm test
npm run build

# Preview the built frontend
npm run preview
```

Integration tests self-skip when PostgreSQL is unavailable. A green local run
with skips is not equivalent to CI, which supplies PostgreSQL and Redis and
migrates an empty database first.

## 8. Database change workflow

1. Update the SQLAlchemy model.
2. Create a migration from `backend/`:

   ```powershell
   alembic revision --autogenerate -m "short description"
   ```

3. Review the generated upgrade and downgrade; do not trust autogenerate for
   data backfills, PostgreSQL triggers, or complex constraints.
4. Test an empty upgrade and, where safe, a downgrade/upgrade cycle.
5. Update the integration-test schema drift patcher and committed-user teardown
   when adding tables that reference users/accounts.
6. Update [Data model](DATA_MODEL.md), [Configuration](CONFIGURATION.md), and an
   ADR if the change modifies an architectural decision.

Current head: `20260802_order_exit_limit`.

## 9. Broker development

Use [Configuration](CONFIGURATION.md) and [Backend guide](BACKEND.md) before
enabling Fyers or Kite. Broker connections are global in current persistence
(`broker_connections.user_id` is null for active shared credentials). Connecting
one provider deactivates the other. Never add broker order methods as a shortcut
for testing; the paper boundary intentionally fails closed.

## 10. Safe cleanup

- Stop Uvicorn and Vite with Ctrl+C.
- Stop local containers with `docker compose stop` to preserve Redis data.
- Do not remove database volumes or local `.env`/token files unless that data
  loss is intentional.
