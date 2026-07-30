# Backend engineering guide

**Verified:** 2026-07-30

**Runtime:** Python 3.11.9, FastAPI 0.111, SQLAlchemy 2.0.30

## 1. Entry point and request lifecycle

`backend/app/main.py` creates the FastAPI application. Import-time work parses
settings, validates production and paper-only invariants, registers exception
handlers and middleware, includes every router under `/api/v1`, declares
`/health`, and audits route security.

For a normal authenticated request:

1. middleware applies CORS, auth throttling where applicable, and response
   security headers;
2. a dependency decodes the access JWT, checks JTI denial, loads the active
   user, and verifies `token_version`;
3. Pydantic validates request data;
4. the thin router calls a service;
5. the service reads/locks/mutates ORM state but normally does not commit;
6. the router writes an in-transaction audit row, commits, refreshes response
   rows, and publishes any best-effort WebSocket notification;
7. a domain exception is mapped by `core/error_handlers.py`, while `get_db()`
   rolls back any failed request transaction and closes the session.

The SQLAlchemy engine uses `pool_pre_ping=True`, a base pool of 10, and up to 20
overflow connections per API process. `autocommit` and `autoflush` are disabled.

## 2. Route modules

There are 13 router modules and 113 registered operations, including the
WebSocket and root health route.

| Module/prefix | Responsibility |
|---|---|
| `routers/auth.py` `/auth` | Password auth, refresh-cookie rotation, profile, device sessions, logout. |
| `routers/oauth.py` `/oauth` | Google/GitHub/Facebook start, callback, and password-confirmed linking. |
| `routers/market.py` `/market` | Canonical market reads, Kite advanced reads, status, and authenticated WebSocket. |
| `routers/trading.py` `/trading` | Account, market orders, pending limits, positions, tradebook, exits, session. |
| `routers/discipline.py` `/discipline` | Mode, rules, score, violations, and progress. |
| `routers/journal.py` `/journal` | Journal list, detail, and editable review fields. |
| `routers/analytics.py` `/analytics` | Summary, advanced, discipline, P&L, and mistake analytics. |
| `routers/strategy.py` `/strategy` | Templates, analysis/simulation, workspaces, drafts, execution, MTM, exits. |
| `routers/options.py` `/options` | Enriched option-chain and aggregate metrics. |
| `routers/settings.py` `/settings` | Complete per-user preferences and partial updates. |
| `routers/broker.py` mixed | Fyers credential/token lifecycle and legacy aliases. |
| `routers/kite.py` mixed | Kite credential/token lifecycle and catalog sync. |
| `routers/admin.py` `/admin` | Read-only, role-scoped operator data and health. |

Use [API reference](API_REFERENCE.md) for the complete operation list.

## 3. Dependency and authorization types

`app/dependencies.py` exposes:

- `get_current_user`: bearer JWT to active `User`;
- `get_current_auth`: active user plus decoded claims for session-aware routes;
- `get_current_active_admin`: requires `tenant_admin` or `super_admin`;
- `CurrentUser` and `CurrentAdmin`: annotated aliases used in route signatures.

The WebSocket equivalent, `get_ws_user`, lives in the security kernel because
browser upgrades cannot carry a normal Authorization header. Adding only
`require_plan()` does not authenticate a route; plan and user dependencies must
be composed.

## 4. Service catalog

### Trading and funds

| Service | Responsibility |
|---|---|
| `virtual_order_service.py` | Standalone entry, protection edits, exit-limit edits, close, emergency exit, LTP lookup, idempotency matching. |
| `pending_order_service.py` | Place/cancel/expire/scan DAY-valid LIMIT entries and manage reservations. |
| `auto_exit_service.py` | Mark open standalone positions and trigger SL, target, or exit limit. |
| `eod_service.py` | Expiry cash settlement, intraday close, stale-position safety net, pre-market cleanup. |
| `ledger_service.py` | The only balance writer; initial credit, margin block/release, charges, P&L settlement, adjustment. |
| `brokerage_calculator.py` | Decimal fee breakdown per entry/exit leg. |
| `slippage_engine.py` | Side-aware simulated fills for liquid and illiquid strikes. |
| `trading_session_service.py` | Current trading-day session, counts, realized P&L, cooldown lifecycle. |

### Discipline, journal, and analytics

| Service | Responsibility |
|---|---|
| `discipline_engine.py` | Loads active per-user rule JSON and blocks the first violation. |
| `discipline_mode_service.py` | Master switch and non-destructive Tier 3 sandbox unlock. |
| `discipline_progress_service.py` | Score history, tier progress, and ON/OFF performance aggregates. |
| `journal_service.py` | Create the auto-journal entry and update user-authored fields. |
| `journal_metrics.py` | Journal-derived metrics. |
| `analytics_service.py` | Summary and advanced performance aggregates. |
| `options_service.py` | Provider-chain enrichment, IV recovery, greeks, PCR, walls, max pain, and GEX. |

### Strategy

| Service/package | Responsibility |
|---|---|
| `strategy_service.py` | Persisted draft lifecycle and API-oriented reads. |
| `strategy_execution_service.py` | Account-locked strategy execution, MTM, leg close, square-off, margin and mirrored orders. |
| `strategy_workspace_service.py` | Versioned saved configurations and preview execution. |
| `app/strategy/` | Pure float-based domain, template, strike, pricing, payoff, margin, probability, and greek functions. No DB/network imports. |

### Auth, broker, operations

| Service | Responsibility |
|---|---|
| `auth_service.py` | Registration graph and password authentication. |
| `token_service.py` | Refresh-token records, row-locked rotation, family revocation, cleanup. |
| `oauth_service.py` | OAuth transactions, exchanges, linking, and user issuance. |
| `fyers_auth_service.py` / `kite_auth_service.py` | Credential/token lifecycle and provider activation. |
| `audit_service.py` | In-transaction and immediate best-effort audit writes. |
| `snapshot_service.py` | Idempotent daily portfolio and open-position observations. |
| `scheduler_leadership.py` | Renewable Redis lease for database-mutating jobs. |
| `auth_maintenance.py` | Daily refresh-token retention cleanup. |

## 5. Models and schemas

Every ORM class uses SQLAlchemy 2 typed `Mapped[]` fields. `app/models/__init__.py`
must import every model before Alembic evaluates `Base.metadata`. Request and
response types live in `app/schemas`; avoid returning ORM objects without a
declared response model when the route has a stable contract.

Conventions:

- UUID primary keys except the Kite catalog token key and OAuth transaction key;
- `tenant_id` and `user_id` copied to domain rows for filtering/auditability;
- `Numeric`/`Decimal` for money;
- JSONB for evolving discipline rule values, user preferences, audit detail,
  attempted actions, and builder workspace state;
- unique constraints encode idempotency and one-to-one lifecycle assumptions;
- append-only update guards are attached through `models/append_only.py`.

See [Data model](DATA_MODEL.md) for the table map.

## 6. Market providers and broker adapters

Two abstractions coexist:

- `market.base.MarketDataProvider` is the application-facing normalized provider
  used by trading, options intelligence, schedulers, and most routers.
- `brokers.base.MarketDataAdapter` is an explicitly read-only broker adapter
  used to enforce capability boundaries.

`provider_factory.get_market_provider()` creates one singleton per process and
`reset_provider()` closes it during shutdown/provider switching. Fyers may return
a mock provider if initialization fails. Kite always returns a Kite provider,
whose payload reports unavailable/stale state when it cannot serve trusted data.

The canonical option-chain shape includes instrument, spot, ATM, expiry,
timestamp/freshness, source, PCR, and strike rows with CE/PE LTP, OI, volume, IV,
bid, and ask fields where the provider supplies them. Consumers must tolerate
provider-specific optional fields and use source/freshness metadata.

Kite additionally uses:

- PostgreSQL `kite_instruments` for catalog metadata;
- Redis for ticks, status, subscription counts/control, auth operation state,
  history cache, feed-worker leadership, and REST rate slots;
- a feed worker class that is separate from FastAPI request code.

## 7. Background jobs

`app/market/market_scheduler.py` uses an `AsyncIOScheduler` in
`Asia/Kolkata`. Broadcast jobs return early when there are no connected sockets.
State jobs run regardless of viewers but only for the Redis leader. Each job
opens and closes its own database session.

The standalone refresh-token cleanup scheduler runs in UTC at 03:15 and deletes
expired/revoked terminal token records older than its retention cutoff.

Do not place state mutation into an ungated broadcast job. Add a leader wrapper,
transaction handling, retry/idempotency behavior, and a test.

## 8. Error handling

Services raise domain errors such as invalid credentials, order/position not
found, discipline violation, insufficient balance, market closed, quote
unavailable, idempotency conflict, and invalid strategy state. The centralized
handler maps them to client errors. Unexpected exceptions remain server errors
and should be logged with context but without secrets.

Frontend-safe error detail matters: FastAPI validation errors use a list of
objects. UI code must pass API failures through `utils/apiError.js` instead of
rendering `response.data.detail` directly.

## 9. Adding backend behavior

### New authenticated endpoint

```python
from app.dependencies import CurrentUser

@router.get("/example")
def example(current_user: CurrentUser, db: Session = Depends(get_db)):
    return service.read(db, current_user)
```

The route audit will fail startup if authentication is missing. A genuinely
public operation needs a method/path/reason entry in `PUBLIC_ROUTES` plus route
audit tests.

### New money movement

Never assign or increment `account.balance`. Add or use a typed
`ledger_service` wrapper that posts a signed delta and a durable explanation in
the same transaction. The AST boundary test inspects the entire application.

### New wire event

Add a `TradingEvent` enum member, pin its exact value in
`tests/unit/test_events.py`, handle it in `useMarketWebSocket.js` if behavior is
new, and publish only after commit. Keep the event payload-free.

### New instrument rule

Update `core/instruments.py` only. Do not add local lot-size, strike-interval,
or expiry-day literals in providers or services. `get_spec()` must continue to
raise for unknown symbols.

## 10. Known backend constraints

- Active broker credentials are global rather than per user.
- Fyers history and futures provider methods are placeholders.
- Expiry-calendar fallback knows weekdays but not exchange holidays; live
  provider expiry lists take precedence.
- Targeted WebSocket notifications are process-local.
- Partial fills are not modeled.
- Single orders charge entry brokerage at entry, while strategy position logic
  nets its entry brokerage at strategy close. This accepted inconsistency must
  not be “cleaned up” without a deliberate P&L-semantics change.
