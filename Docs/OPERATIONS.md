# Operations and deployment

**Verified:** 2026-07-30

## 1. Deployment support status

The repository provides application code, Alembic migrations, a Vite production
build, CI, and local Redis/pgAdmin Compose services. It does **not** provide
backend/frontend Dockerfiles, infrastructure-as-code, a production proxy/TLS
configuration, a process-manager definition, a deployment workflow, or
centralized observability integrations.

Deployment is therefore platform-owned. The requirements below are derived from
the application and must be supplied by the chosen platform.

## 2. Required production services

| Component | Requirement |
|---|---|
| Frontend | Static hosting for `frontend/dist`, SPA fallback to `index.html`, HTTPS. |
| API | Python 3.11 running `app.main:app`, graceful lifespan startup/shutdown, HTTPS behind ingress. |
| PostgreSQL | PostgreSQL 16-compatible database with backups and migration access. |
| Redis | Required for production scheduler leadership; also required for Kite and optional JTI denial. |
| Ingress/proxy | Route `/api/v1` and `/health`, support WebSocket upgrades, redact WS query tokens. |
| Secret manager | Database, Redis, JWT, broker encryption, broker/OAuth, and SMTP secrets. |
| Monitoring | Detect startup refusal, leadership loss, broker/staleness, migration drift, and job exceptions. |

Use the same origin for SPA and `/api` where possible. For separate origins,
configure exact HTTPS `TRUSTED_ORIGINS` and build the frontend with the absolute
API base.

## 3. Recommended topology

### Single API process

One API process is the current fully coherent topology: one selected provider,
one in-process WebSocket manager, one broadcast set, and one targeted trading
notification path. Redis remains required in production by startup validation.

### Multiple API workers

Multiple workers can share PostgreSQL and use Redis to elect one
database-mutating scheduler leader. Each worker must run process-local market
broadcasts for its own sockets.

Targeted `trading_update` events are not distributed. A write on worker A does
not notify a socket on worker B. Add a shared event bus before treating
multi-worker notification latency as reliable; until then, use one worker or
ensure REST refresh/polling provides acceptable convergence.

## 4. Build and release sequence

### Backend artifact

```powershell
cd backend
python -m pip install -r requirements.txt
python -m py_compile app\main.py
```

The platform-specific process wrapper must import `app.main:app`, forward
termination for lifespan shutdown, and use the intended backend working
directory/configuration.

### Frontend artifact

```powershell
cd frontend
npm ci
npm test
npm run build
```

Deploy `frontend/dist`. Configure SPA fallback for browser routes, but do not
rewrite `/api` or WebSocket upgrades to `index.html`.

### Database migration

Run once per release before new code serves traffic:

```powershell
cd backend
alembic upgrade head
alembic current
alembic heads
```

Expected repository head is `20260802_order_exit_limit`. CI proves empty-schema
upgrade. Also test the release migration on a recent restored copy of production
data and review lock/backfill duration. Do not let every API replica race to run
Alembic; use one release job or operator step.

### Startup order

1. PostgreSQL is reachable and migrated.
2. Redis is reachable.
3. secrets/environment are mounted.
4. API starts and passes import/lifespan validation.
5. health and admin health are checked.
6. frontend/ingress begins routing users.

## 5. Production environment checklist

- `ENVIRONMENT=production`.
- Paper-only execution/access literals unchanged.
- Strong, stable `SECRET_KEY` from secret storage.
- `COOKIE_SECURE=true`.
- Exact HTTPS `TRUSTED_ORIGINS` and `FRONTEND_URL`.
- PostgreSQL URL with provider-required TLS.
- Reachable `REDIS_URL`.
- Stable `BROKER_TOKEN_ENC_KEY`, especially for Kite.
- Selected provider and exact HTTPS callback URLs.
- OAuth callbacks updated at each provider.
- SMTP values if security email delivery is required.
- Frontend API base/proxy behavior matches ingress.
- Debug/API schema routes verified absent.

See [Configuration reference](CONFIGURATION.md) for every variable and refusal
condition.

## 6. Health and readiness

`GET /health` proves the app imported and can serve HTTP. It reports public
paper/broker capability modes but does not query PostgreSQL, Redis, or the
broker; it is liveness, not full readiness.

Authenticated `GET /api/v1/admin/health` reports environment, selected/connected
provider, market state, Redis configured state, process leadership, process
WebSocket count, and database Alembic revision. A deployment readiness check
should separately verify PostgreSQL and Redis connectivity; no public deep
readiness endpoint exists.

## 7. Logging and alerts

Capture Python logging and startup/shutdown stdout. Never log Authorization
headers, refresh cookies, broker tokens/secrets, passwords, or the WebSocket
`token` query parameter.

Alert at minimum on:

- import/startup refusal and repeated 5xx responses;
- PostgreSQL pool/connectivity errors;
- “state jobs are paused” or Redis leadership errors;
- no leader beyond the lease TTL plus recovery margin;
- broker unavailable or sustained stale data during market hours;
- automatic fill/exit/EOD/snapshot job exceptions;
- audit write errors or ledger reconciliation failure;
- Alembic revision different from the release head;
- elevated failed login, token-reuse, or rejected-order audit counts.

The code exports no metrics; use log/query/platform instrumentation until a
metrics integration is deliberately added.

## 8. Scheduled-job operating table

| Time/cadence | Expected observation | Failure consequence |
|---|---|---|
| 1s | Market/status frames while sockets exist. | UI uses REST fallback; no DB impact. |
| 5s | Auto-exit and LIMIT-fill sweeps by leader. | Protection/fills pause. Investigate before manual action. |
| 15s | Strategy MTM and option metrics. | Marks/derived UI become stale. |
| 08:30 IST | Stale DAY/prior intraday cleanup and Kite catalog sync. | Old book/catalog may persist; rerun after root cause. |
| 15:29 IST | Expiry settlement and intraday square-off. | Open state may remain; restore leader/provider and inspect. |
| 15:35 IST | Daily portfolio/open-position snapshots. | Historical equity can miss a date; same-day rerun is idempotent. |
| 03:15 UTC | Old terminal refresh-token cleanup. | Storage grows; active auth remains functional. |

## 9. Redis outage runbook

### Production or Kite

1. Confirm API processes remain up and inspect admin health.
2. Expect state jobs to pause; do not widen local fallback.
3. Restore Redis with the same connection/security settings.
4. Wait for lease reacquisition (heartbeat is roughly TTL/3).
5. Verify exactly one leader.
6. Inspect pending orders, open positions, 15:29 work, and snapshot date.
7. Let idempotent sweeps recover; use manual action only with an audit- and
   ledger-safe plan.

Kite data also depends on Redis ticks/status/control and may be unavailable even
when PostgreSQL/API are healthy.

### Development non-Kite

The configured fallback may keep state jobs active in one process. Never run
multiple fallback processes against the same database.

## 10. Broker runbooks

### Fyers disconnect/staleness

1. Check selected provider and `/auth/fyers/status`.
2. Inspect source (`fyers`, `fyers_cached`, or `mock_fallback`) and age.
3. Refresh/reconnect through the setup UI/API.
4. Production entries remain blocked on simulated fallback; do not bypass.
5. If compromised, revoke at Fyers and delete saved credentials/token before
   issuing replacements.

### Kite disconnect/staleness

1. Check Redis, `/auth/kite/status`, and admin health.
2. Confirm catalog data and feed-worker leadership.
3. Re-authenticate if the daily token is invalid.
4. Run the admin catalog sync after credentials and Redis are healthy.
5. Keep Kite fail-closed; never switch silently to mock in production.

Connecting one broker intentionally disconnects the other.

## 11. Backup and restore

A recovery set includes the PostgreSQL backup and Alembic revision, application
release/commit, `SECRET_KEY` if existing JWT validation matters, and
`BROKER_TOKEN_ENC_KEY` for encrypted broker rows. Store configuration metadata
without exposing secret values.

Redis is not the order/funds system of record, but loss affects leadership, Kite
live state, cached history, operation state, and optional JTI denial. Size its
persistence/HA accordingly.

Restore drill:

1. restore PostgreSQL into isolation;
2. provide retained encryption secrets;
3. verify/migrate the Alembic revision;
4. run ledger reconciliation;
5. inspect account/order/position counts and latest snapshots;
6. start one isolated API process;
7. verify health without contacting real users or changing broker state.

## 12. Ledger incident runbook

If balance and ledger sum differ:

1. stop state-changing traffic and scheduler leadership;
2. snapshot the database and retain logs;
3. identify the first sequence/arithmetic discontinuity;
4. search recent code, migrations, and manual SQL for a direct write;
5. do not UPDATE a ledger row or direct-write balance;
6. post a reviewed compensating `MANUAL_ADJUSTMENT` for the correct economic
   state;
7. confirm reconciliation, add a regression test, and record the incident.

## 13. Rollback guidance

Application rollback is safe only when older code understands the current
schema. Review downgrade and data-loss implications; prefer forward fixes after
new-format data is written.

If a release fails before traffic and its migration is proven reversible, stop
new code, back up, downgrade deliberately, and deploy the last compatible
release. Once traffic writes new data, use a reviewed compatibility/forward
recovery instead.
