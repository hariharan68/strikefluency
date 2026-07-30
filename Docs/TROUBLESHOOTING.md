# Troubleshooting guide

This runbook covers failures that can be diagnosed from the current source tree.
Start with the symptom, verify the listed evidence, and avoid weakening a safety
control merely to make a process start.

## First-response checklist

1. Confirm the failing component and environment:

   ```powershell
   git branch --show-current
   git status --short
   $env:ENVIRONMENT
   $env:MARKET_DATA_PROVIDER
   ```

2. Check the backend health endpoint and frontend response:

   ```powershell
   Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8000/health
   Invoke-WebRequest -UseBasicParsing http://127.0.0.1:5173/
   ```

3. Read the first backend startup exception. Several security and configuration
   checks intentionally fail before the server binds a port.
4. Confirm PostgreSQL migrations and Redis reachability when the symptom concerns
   state-changing scheduler jobs.
5. Reproduce with `ENVIRONMENT=testing`; local development behavior is
   intentionally less strict in a few places.

## Backend does not start

### Validation error while loading settings

`app/config.py` validates settings before application startup. Common causes are:

- missing `DATABASE_URL` or `SECRET_KEY`;
- `EXECUTION_MODE` is not exactly `paper_only`;
- `BROKER_ACCESS_MODE` is not exactly `market_data_read_only`;
- `ENVIRONMENT=production` with a weak/default secret, insecure cookie, missing
  trusted origins, mock market data, or an invalid broker encryption setup;
- selecting Kite without required Kite credentials.

Compare the active environment with [Configuration](CONFIGURATION.md). Do not
change the two paper-trading literals to permit live broker execution.

### Security Kernel reports an unclassified route

The exception names a route that is neither authenticated nor present in
`PUBLIC_ROUTES`. For a private route, take `CurrentUser`, `CurrentAuth`,
`CurrentAdmin`, or the WebSocket user dependency. For a genuinely public route,
add a narrowly scoped entry and written reason to
`backend/app/core/security_kernel.py`, then add a security test.

Do not bypass `audit_route_security()` or move it ahead of router registration.

### Database connection or missing-relation error

The root Compose file does not start PostgreSQL. Supply an external PostgreSQL
16 instance, verify `DATABASE_URL`, and migrate it:

```powershell
cd backend
& .\.venv\Scripts\alembic.exe current
& .\.venv\Scripts\alembic.exe upgrade head
& .\.venv\Scripts\alembic.exe heads
```

There should be one head: `20260802_order_exit_limit` at the documentation
verification date. If an empty-database upgrade fails, treat it as a migration
defect rather than manually creating tables.

## Login or session restore fails

### Valid users return to `/login` after a page reload

Verify that `frontend/src/api/auth.js` calls `refreshAccessToken()` for refresh.
Calling the raw Axios client rotates the single-use refresh cookie without
putting the new access token into the in-memory store; the subsequent `/auth/me`
call then fails and may trigger another rotation.

Also verify:

- the frontend origin is in `TRUSTED_ORIGINS`;
- requests send credentials;
- production uses HTTPS with `COOKIE_SECURE=true`;
- the refresh cookie path is `/api/v1/auth`;
- the browser is not replaying an old rotated refresh token.

### Login, refresh, or logout returns 403

These cookie-sensitive endpoints validate `Origin`. The browser origin must
match a configured trusted origin exactly, including scheme and port.

### Login is intermittently rate-limited

Authentication limits are in-memory and per process. The default login limit is
five attempts per minute per IP. A 429 is expected after the threshold. In a
multi-worker deployment each worker has an independent counter; the current
implementation does not promise a global rate limit.

## Frontend is blank or shows the error boundary

Open the browser console first. A common cause is rendering FastAPI's structured
422 `detail` array directly in JSX. Convert all API errors through
`frontend/src/utils/apiError.js` (`getApiErrorMessage` or `toDisplayMessage`).

If the page loads but data does not:

- confirm `VITE_API_BASE_URL` or the Vite `/api` proxy target;
- inspect the failed request and the single refresh retry;
- verify the access token exists only in the Zustand in-memory store;
- confirm the WebSocket URL uses the matching backend origin.

## WebSocket does not connect or the desk becomes stale

The browser connects to `/api/v1/market/ws?token=<access-JWT>`. Check that:

- a current access token is present before connection;
- the configured URL uses `ws://` or `wss://` as appropriate;
- reverse proxies permit WebSocket upgrades and preserve query strings;
- query strings are redacted from proxy and access logs because they contain a
  short-lived bearer token;
- reconnect logic has refreshed an expired five-minute access token.

Global frames are replayed only from the memory of the process that accepted the
socket. User trading events are also process-local. With multiple API workers,
clients connected to one worker will not receive events published in another;
use one worker or add a shared pub/sub design before scaling horizontally.

## Orders are rejected or never fill

### `Market is closed`

This is an execution invariant. Entry, fill, and exit paths are bounded to
09:15-15:30 IST. Mock quotes may display outside market hours in development,
but they do not authorize execution.

### Quote unavailable or stale

Order placement raises on stale data. Resting entry and exit scanners skip stale
ticks and retry later. Check provider timestamps, provider-specific limits, and
the generic 120-second order backstop. Fyers preserves the REST chain timestamp
when overlaying socket LTPs; one fresh premium does not make stale OI/IV data
tradeable.

### Limit order remains `PENDING`

Verify all of the following:

- the market is open;
- the selected quote is fresh;
- BUY LTP is at or below the limit, or SELL LTP is at or above it;
- a leader process is running the five-second fill sweep;
- the order has not expired, been cancelled, or failed discipline revalidation.

The `reject_reason` explains discipline failures discovered at fill time.

### Stop-loss, target, or explicit exit limit does not fire

The five-second auto-exit job must have scheduler leadership and fresh market
data. Trigger priority on a same-tick gap is stop-loss, target, then exit limit.
Mark-to-market can continue while trigger execution is paused for stale data.

### Strike outside the chain

The order service deliberately returns no premium rather than substituting spot.
Select a strike present in the provider chain. Using the index level as an option
premium would corrupt margin and P&L.

## Scheduler state jobs are paused

State-changing jobs require `SchedulerLeadership`. Inspect Redis and backend
logs. Development with a non-Kite provider may fall back to single-process
leadership if Redis is unavailable. Production and Kite configurations fail
closed: restore Redis instead of widening the fallback.

Broadcast jobs are not leader-gated and skip work when no WebSocket clients are
connected. State jobs run regardless of connected clients.

If jobs appear duplicated, ensure only the elected process executes database
mutations and that the Redis lease TTL is longer than expected transient stalls.

## Balance or ledger reconciliation fails

`GET /api/v1/admin/ledger?user_id=...` reports `reconciles`. A false result means
the account balance differs from the sum of its signed ledger rows.

Do not edit an existing ledger row: PostgreSQL and ORM hooks forbid updates.
Identify the code path that wrote `VirtualAccount.balance` directly. Correct a
business balance through a compensating `MANUAL_ADJUSTMENT` using
`ledger_service`; do not rewrite history.

Run `backend/tests/unit/test_ledger_boundary.py` after any funds change. It
AST-scans application code for direct balance writes.

## Broker connection problems

### Fyers silently shows mock data

This is current development behavior: missing or invalid Fyers credentials cause
the provider factory to fall back to mock. Inspect `/api/v1/broker/status` and
the backend logs before treating displayed data as live.

### Kite shows no data

Kite is deliberately fail-closed and has no mock fallback. Verify credentials,
callback completion, token hydration, the 08:30 instrument catalog sync, and
Kite tick/catalog state. A production or Kite deployment also requires Redis
leadership for state jobs.

Connecting one broker disconnects the other. Broker credentials are currently
stored globally (`user_id=NULL`), so this is a single-broker deployment model.

## Tests pass locally but fail in CI

Reproduce the CI environment:

```powershell
cd backend
$env:ENVIRONMENT = "testing"
$env:MARKET_DATA_PROVIDER = "mock"
$env:REDIS_URL = "redis://127.0.0.1:6379/0"
& .\.venv\Scripts\pytest.exe -q
```

`testing` is neither development nor production. Code intended to be strict
only in production must check `is_production`, not `not is_development`.
CI also migrates an empty PostgreSQL database, so an existing local schema can
hide a broken migration chain.

For the frontend, run both the Node tests and production build:

```powershell
cd frontend
npm test
npm run build
```

## Escalation evidence

When handing a failure to another engineer, include the environment name,
provider, current Alembic revision, exact endpoint/job, correlation time in IST
and UTC, HTTP status and normalized response, scheduler-leadership state, and a
redacted log excerpt. Never include JWTs, OAuth codes, refresh cookies, broker
tokens, client secrets, or encryption keys.
