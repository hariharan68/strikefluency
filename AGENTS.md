# StrikeFluency — Agent Notes

Durable project context for AI/agent work. **Verified against source on 2026-07-28.**

> Works with any coding agent — Claude Code, Codex and others all read
> `AGENTS.md` by convention. Nothing here is tool-specific.

> Previous versions of this file described the pre-`feature/modules-connection`
> codebase and were badly out of date — an agent following them made changes
> against a system that no longer existed. If you change architecture, update
> this file in the same commit. If a statement here contradicts the code, the
> **code wins** — fix this file.

---

## Project summary

A **paper-only** options trading simulator for Indian retail traders
(NIFTY / BANKNIFTY / SENSEX). The differentiator is a discipline engine that
gates every order before it fills.

- Backend: FastAPI, Python 3.11, SQLAlchemy 2.0 (typed `Mapped[]`), Alembic, PostgreSQL 16
- Frontend: React 18, Vite, Zustand, React Router v6, Axios, Recharts, lucide-react (no TypeScript)
- Backend dev port 8000, frontend dev port 5173
- `docker-compose.yml` → PostgreSQL 16 (5432), pgAdmin (5050)
- Redis is used for scheduler leadership (see *Scheduler* below)

### Two non-negotiable invariants

Both are enforced **by construction**, not convention. Do not weaken either.

**1. Security Kernel** — `app/core/security_kernel.py`

`audit_route_security(app)` runs at import time in `main.py`, after every router
is registered. Every HTTP and WebSocket route must be either:

- **authenticated** — its dependency tree contains `get_current_user`,
  `get_current_auth`, `get_current_active_admin`, or `get_ws_user`; or
- **declared public** — an entry in `PUBLIC_ROUTES` with a written reason.

Anything else raises `RuntimeError` and **the process never binds a port**.
Current audit: **97 authenticated, 12 declared public**.

To add an endpoint, just take `CurrentUser`:

```python
from app.dependencies import CurrentUser

@router.get("/my-endpoint")
def my_endpoint(current_user: CurrentUser):
    ...
```

**2. Paper-trading boundary** — `app/core/paper_trading_policy.py`

StrikeFluency authenticates with brokers and reads market data, but **never**
places, modifies, or cancels a broker order.

- Broker SDK clients are wrapped in `ReadOnlyBrokerClient`, an allowlist proxy.
  `place_order`, `cancel_order`, `get_positions`, `get_holdings`, etc. fail closed.
- `assert_market_data_payload()` rejects any request carrying private paper-ledger
  keys (`user_id`, `virtual_order_id`, `realized_pnl`, `pre_trade_thesis`, …).
- `EXECUTION_MODE: Literal["paper_only"]` and
  `BROKER_ACCESS_MODE: Literal["market_data_read_only"]` are `Literal` types, so a
  bad `.env` value fails during settings parsing, before startup.

Enabling broker execution would require a deliberate architectural redesign. It
cannot be turned on through configuration.

---

## Running locally

```powershell
# Backend
cd backend
.venv\Scripts\activate
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev
npm run build

# Tests
cd backend
pytest              # 383 tests; integration tests self-skip without Postgres
```

**Never commit** `.env`, `fyers_token.json`, `access_token.txt`, or `fyers_logs/`.

---

## Backend architecture

Entry point `app/main.py`. Lifespan startup hydrates the **active** broker's
token, starts the market scheduler and auth maintenance; shutdown reverses it.

CORS and the cookie `Origin` check both read `settings.trusted_origins` — one
list, so they cannot drift.

### Routers (13, all under `/api/v1`, 109 routes)

| Prefix | Purpose |
|---|---|
| `/auth` | register, login, refresh, logout, sessions, logout-all |
| `/oauth` | Google / GitHub / Facebook, state + PKCE, account-link challenges |
| `/market` | option chain, spot, status, WS, Kite quote/ohlc/depth/history/expiries |
| `/trading` | account, orders, tradebook, positions, session |
| `/discipline` | mode switch, rules, score, violations, progress |
| `/journal` | list / get / update entries |
| `/analytics` | summary, discipline trend, P&L curve, mistakes |
| `/strategy` | templates, analyze/simulate, drafts, execution, builder configurations |
| `/options` | chain intelligence — PCR, max pain, OI walls, GEX, greeks |
| `/settings` | per-user preferences (JSONB) |
| `/broker`, `/kite` | per-broker credential + connection lifecycle |
| `/admin` | read-only operator view — overview, audit trail, users, ledger, health |

### Layering conventions

- **Routers are thin.** Business logic lives in `app/services/`.
- **Services never commit.** The router owns `db.commit()`. Known and accepted
  exceptions, all deliberate: `brokers/connections.py` token helpers own their
  own short-lived sessions; `pending_order_service.scan_and_fill()` commits per
  order (it is a scheduler sweep with no router above it, and one bad order must
  not roll back the whole sweep — see its docstring); `token_service` and
  `oauth_service` commit around refresh-token rotation.
- **`virtual_accounts.balance` is written in exactly one place:**
  `app/services/ledger_service.py`. See the funds ledger section below.
- Services are plain module functions taking `(db, user, ...)`, raising domain
  exceptions from `app/core/exceptions.py`. No async in the service layer.
- `app/strategy/` is **pure maths** — no DB, no network, floats. Everything else
  uses `Decimal` for money. Conversion happens at the ORM boundary.

---

## Domain rules

Contract specs: **`app/core/instruments.py` is the single source of truth**
(`get_spec(symbol)`). Lot sizes, strike intervals and expiry weekdays used to be
duplicated in six places and drifted; do not reintroduce a literal anywhere else.

| | Lot size | Strike interval | Weekly | Expiry weekday |
|---|---|---|---|---|
| NIFTY | 65 | 50 | yes | Tuesday |
| BANKNIFTY | 30 | 100 | no (monthly only) | Tuesday |
| SENSEX | 20 | 100 | yes | Thursday |

`get_spec()` **raises** on an unknown symbol rather than defaulting — a silent
default meant filling orders at the wrong lot size.

Times (IST): open 09:15, close 15:30, EOD square-off 15:29, pre-market reset /
trading-day boundary 08:30.

Capital tiers: TIER_1 ₹1,00,000 · TIER_2 ₹5,00,000 · TIER_3 ₹10,00,000.
15 consecutive disciplined trades unlocks the next tier.

### The 7 discipline rules

`MAX_TRADES_PER_DAY`, `MANDATORY_SL`, `NO_AVERAGING_DOWN`, `NO_DIRECTION_FLIP`,
`REVENGE_COOLDOWN`, `MAX_DAILY_LOSS`, `MANDATORY_SETUP_TAG`.

There is **no** `MARKET_HOURS` discipline rule — market-hour blocking lives in
`virtual_order_service.place_order()` and is bypassed in development.

A **strategy counts as one trade**. Only the three strategy-level rules apply
(`STRATEGY_DISCIPLINE_RULES`): setup tag, max trades/day, max daily loss. Per-leg
rules are skipped by design — an iron condor is deliberately multi-directional.

### Discipline Mode (master switch)

`VirtualAccount.discipline_mode_enabled`. OFF → all rules bypassed, capital
topped up to ₹10,00,000, tier → TIER_3, and orders are flagged `was_free_play`
so they never affect the score, streak or cooldown. ON → rules resume; money is
kept, never clawed back.

`MAX_DAILY_LOSS` is a percentage of `initial_balance`, so `set_mode()` raises
`initial_balance` alongside the balance when capital unlocks. If you touch
either, keep them in step.

---

## Trading flow

`app/services/virtual_order_service.py`

**Place** — market-hours check (skipped in dev) → lock `VirtualAccount`
`FOR UPDATE` → idempotency check on `client_order_id` → session + open positions
→ fetch LTP from the chain → discipline engine (skipped in free-play) → slippage
→ margin → balance check → brokerage → create `VirtualOrder` + `VirtualPosition`
→ deduct margin, increment trade count.

**Close** — same lock order (account → order → position → session) → exit LTP →
slippage → gross P&L → exit brokerage → update order/position → release margin,
apply net P&L → update session → cooldown on `SL_HIT` → discipline score →
auto journal entry.

Notes:

- **Lock order is identical in both paths.** Keep it that way — it is what
  serializes manual, auto-exit and EOD closes.
- `_get_ltp_from_chain()` returns `None` when a strike is outside the chain and
  **never falls back to spot**. An index level is thousands of points from a
  premium; treating it as LTP corrupts P&L and falsely triggers SL/target.
- Margin = contract value ÷ `LEVERAGE_MULTIPLIER` (5) when the user's
  `leverage_enabled` setting is on, ÷ 1 when off.
- `client_order_id` makes placement retry-safe; a replay returns the original
  fill (HTTP 200 instead of 201) and never re-prices.

### The funds ledger (`virtual_fund_ledger`)

Every change to `virtual_accounts.balance` posts a matching append-only ledger
row in the same transaction, so the balance and its explanation can never
disagree. The invariant is **`balance == SUM(ledger.amount)`** — note *not*
`initial_balance + SUM(...)`, because `initial_balance` is a discipline-rule
denominator that `discipline_mode_service` mutates on capital unlock.

- **Never write `account.balance` directly.** Use `ledger_service.post()` or a
  wrapper (`block_margin`, `release_margin`, `charge`, `settle_pnl`, `adjust`,
  `open_account`). `tests/unit/test_ledger_boundary.py` AST-scans `app/` and
  fails the suite on any direct write — including in new code you add.
- `post()` takes a **signed delta**, never a target balance, and raises
  `InsufficientBalanceError` *before* mutating if the delta would go negative.
  That converts what would be an `IntegrityError` 500 at commit into the 400
  every caller already handles.
- Accounts are created at **zero** and credited via `open_account()`, so the
  first row already reconciles. Test fixtures do the same.
- `UPDATE` is blocked by a Postgres trigger (`trg_vfl_forbid_update`) plus an
  ORM `before_update` listener. `DELETE` is deliberately allowed — test teardown
  and account deletion need it, and a delete fails loudly as a gap in `seq`
  whereas an update corrupts history silently. To correct a row, post a
  compensating `MANUAL_ADJUSTMENT`.
- The trigger travels with the table via an `after_create` DDL event, so the
  conftest schema-drift patcher and Alembic produce identical schemas.
- The ledger is **observational**: balances live in `virtual_accounts` and are
  never derived from it, which is what makes the migration safe to drop. Do not
  turn `balance` into a view over the ledger — that trades the reversibility
  away.
- A new table with an FK to `users`/`virtual_accounts` must be added to the
  conftest drift patcher *and* to the `committed_user` teardown in
  `tests/integration/test_order_concurrency.py`, or the suite breaks confusingly.

### Subscriptions — a seam, not machinery (`app/core/plans.py`)

The app is free. There are **no** `subscriptions` / `payments` / `plan` tables
and no payment provider, on purpose — see `Docs/adr/0002-no-billing-machinery.md`.

What exists is only the expensive-to-retrofit part: `users.plan` (default
`'free'`, `ck_users_plan`), an ordering so "at least pro" is expressible, and
`require_plan(minimum)`.

`settings.BILLING_ENABLED` is `False`, so the gate admits everyone — an explicit
kill switch, tested on both sides, not a stub that silently does nothing. That
means `require_plan` can be attached to a route today and change nothing, and is
already correct the day billing is switched on. Unknown plan values rank lowest,
so a bad value fails closed.

`require_plan` does **not** authenticate. Compose it with `CurrentUser`; a route
depending only on it would fail the Security Kernel and stop the app booting.

`tests/unit/test_plans.py` fails if subscription or payment models appear, so
adding them is a deliberate decision rather than a drive-by.

### Architecture decisions (`Docs/adr/`)

Where the codebase deliberately diverges from
`PAPER_TRADING_SAAS_ARCHITECTURE.md`. Read these before "fixing" a missing table:

- `0001-executions-table-deferred.md` — `virtual_orders` **is** the execution
  record until partial fills exist; under `uq_virtual_positions_order_id` an
  `executions` table would be a 1:1 duplicate.
- `0002-no-billing-machinery.md` — why the subscription seam exists but the
  billing tables do not.

### Admin surface (`app/routers/admin.py`, `/admin`)

Read-only operator view: overview + system health, the **audit trail read
surface** (previously psql-only), users, funds ledger, and daily snapshots.

**Deliberately read-only.** Every mutation an admin might want already exists
behind a user-facing endpoint or belongs in psql, and a half-built "adjust this
balance" button is a bigger liability than its absence. Any write added here
must post to `virtual_fund_ledger` and `audit_logs` like anything else.

**Scoping is the security-critical part**, and this is the first place
`tenant_id` is used for read *isolation* rather than only being written:

- `tenant_admin` → own tenant only. `super_admin` → all tenants.
- The scope comes from the **admin's own row**, never a query parameter, so no
  request input can widen it. Naming another tenant's `user_id` returns empty
  (audit) or 404 (ledger) rather than that user's data — both are tested.
- Unattributable failed logins (unknown email → no `user_id`/`tenant_id`) are
  visible only to a `super_admin`; a tenant admin could not attribute them.

`GET /admin/ledger?user_id=…` reports **`reconciles`** — whether that account's
balance still equals the sum of its ledger rows. That is the Phase 1 invariant
made visible, and it surfaces a balance mutated outside `ledger_service` instead
of letting it pass unnoticed. It stays `null` when unscoped, where it is
meaningless.

Frontend: `AdminRoute.jsx` is the **first role guard in the app**
(`ProtectedRoute` is authentication-only) and exports `isAdminRole` /
`ADMIN_ROLES`, which `TopBar` now uses instead of its own inline array. The
sidebar gained `adminOnly` filtering — items without the flag stay visible to
everyone. The guard is UX only; every endpoint is independently enforced by
`get_current_active_admin`.

Roles are still assigned only at registration: **no `tenant_code` → tenant_admin,
with one → trader**. There is no endpoint to change a role after the fact.

### Trading events (`app/events/`)

Deliberately small — publisher and consumer are the same process, so this is a
naming layer, not decoupling. There is **no `consumer.py` and no dispatcher**;
add one when a second subscriber exists, not before.

- `TradingEvent` (StrEnum) replaces ten inline magic strings. **The values are a
  wire contract**: `useMarketWebSocket.js` dispatches on `msg.reason`, so a
  rename silently stops the frontend refreshing — no error, just a stale desk.
  `tests/unit/test_events.py::test_wire_values_are_unchanged` pins all ten.
- `publish(user_id, event)` — call **only after `db.commit()`**. Takes no third
  argument, so the no-payload contract is enforced by the signature: clients
  re-run their REST loaders, keeping REST the single source of truth rather
  than maintaining a second divergent representation of a position.
- `DeferredPublisher` — collect during work, `flush()` after commit,
  `discard()` on rollback. Replaces the identical list-then-drain-or-clear
  dance `market_scheduler` was hand-rolling in both sweeps. `flush()` after
  `discard()` is a no-op, so the try/except/finally ordering is safe.

`notify_trading_update` still exists in `websocket_manager` and is re-exported;
`publish` is the preferred entry point.

### Daily snapshots (`portfolio_snapshots`, `pnl_snapshots`)

Captured by the `daily_snapshot` cron at **15:35**, six minutes after the 15:29
square-off, so intraday positions are already settled and only genuine
carry-forward is marked. Leader-gated like every other state job.

Most of an equity curve is reconstructible from closed orders. One part is not:
the **unrealised mark on positions still open at the close**. A carried NRML
position leaves no record of what it was worth on each intervening day, because
`virtual_positions.current_ltp` holds only the latest value and the exit price
eventually overwrites it. That is what these tables preserve.

- `portfolio_snapshots` — one row per user per day: the account total.
  `equity = balance + margin_blocked + unrealized_pnl`, enforced by a CHECK.
  Margin has to be added back because it is already excluded from `balance`,
  and resting-limit reservations count too.
- `pnl_snapshots` — one row per *open* position per day: the attribution a
  total cannot give. Closed positions are skipped; their VirtualOrder row is
  already a permanent record.

**Not append-only**, unlike the ledger and audit log. A snapshot is a derived
observation, so re-running a day must update rather than duplicate — the cron
has a 600s misfire grace and a restart near the close can genuinely fire it
twice. Unique constraints on `(user_id, snapshot_date)` and
`(position_id, snapshot_date)` enforce it.

One failing account is logged and skipped rather than aborting the batch: the
caller commits once, so an uncaught error would cost every other user their row.

### Stale market data (`app/market/freshness.py`)

One staleness contract for every provider. Previously only Kite had one, and it
ran at two of the five places a fill can happen.

**Three answers, deliberately different:**

| Path | Behaviour | Why |
|---|---|---|
| `place_order`, `place_limit_order` | **raise** (`assert_orderable`) | Never open a position on stale data. |
| `scan_and_exit`, `scan_and_fill` | **skip** (`is_tradeable`) | A stale tick fires a stop-loss the market never hit, or fills a limit at a price that never printed. Pause and retry next tick — a stale sweep is not an error. |
| `close_position` | **not gated** | Serves manual exits, EOD square-off and expiry settlement. Refusing to close traps the user in a position and would leave intraday positions open overnight — strictly worse than exiting at a slightly old price, which the `current_ltp` fallback already bounds. |

Mark-to-market still runs on a stale chain in `scan_and_exit`. Staleness pauses
*triggering*, not display; freezing the P&L number too would make the desk look
broken during a brief feed hiccup.

- `age_ms()` derives from `age_ms` → `as_of` → `timestamp`, so providers that
  never stamped freshness fields (Fyers, mock) needed **no changes**.
  An unknowable age counts as stale, never as fresh.
- `MARKET_ORDER_BLOCK_SECONDS` (120s) is a **backstop, not a replacement**. A
  provider's own `assert_orderable` runs first and still wins where stricter —
  Kite demands <30s because it has a live tick feed. The generic bound must stay
  above the slowest provider's cache TTL (Fyers caches chains for 95s), or it
  rejects orders during entirely normal operation.
- Simulated sources (`mock`, `mock_fallback`) are
  refused in production but **allowed in development** — locally the mock
  provider *is* the data source, and blocking it would block all local trading.
- `assert_orderable` raises `RuntimeError` on purpose: the order paths already
  catch it and re-raise `QuoteUnavailableError` (a clean 400). Narrowing the
  type would turn stale quotes into 500s.

### The audit trail (`audit_logs`)

Append-only record of security- and trading-sensitive actions, sharing the
ledger's guard (`app/models/append_only.py`: UPDATE blocked, DELETE allowed).
Distinct from `security_notifications`, which tells a *user* something happened;
this is the operator-facing trail.

**The two write modes are the design — pick deliberately:**

- `audit_service.record(db, ...)` joins the caller's transaction. Correct for
  successful state changes: if the transaction rolls back, the action did not
  happen and must not be audited as though it did.
- `audit_service.record_now(...)` opens its own session and commits immediately.
  Required for events whose transaction is about to roll back — **failed logins**
  (`authenticate_user` raises before the router commits) and **rejected orders**.
  Those are the rows most worth having, and `record()` would silently discard them.

Both are fire-and-forget and never raise: an audit failure must never fail a
trade or block a login.

`user_id` and `tenant_id` are nullable on purpose — a failed login against an
unknown email has no user, and is exactly the row worth keeping. The attempted
email goes in `detail` so a typo can be told apart from an attack.

There is **no read API yet**. Query it in `psql`; a `/admin` surface is Phase 6.

**Known inconsistency, deliberately not fixed:** single orders charge entry
brokerage at *entry* (debited from balance), while
`strategy_execution_service._close_if_all_legs_done` nets the strategy's entry
brokerage at *close* (`net = realized_pnl - position.brokerage`). Two
conventions. Unifying them changes strategy P&L semantics, so it is out of
scope until deliberately scheduled.
- Lot size is snapshotted onto every order row, so a SEBI revision never
  re-values historical trades.

### Resting LIMIT orders — `app/services/pending_order_service.py`

`place_order()` above is the **MARKET** path only. A **LIMIT** order is a
decision about a price that has not happened yet, so it never touches
`VirtualOrder` at placement: it lands in `pending_orders` and waits.

**Place** (`POST /trading/pending`) — market-hours check → lock account →
idempotency on `client_order_id` → strike must be quotable → discipline engine →
block margin → create `PendingOrder` (status `PENDING`).

**Fill** — the 5s `limit_fill_tick` scans every resting order; on trigger it
releases the reservation and calls `place_order()`, which creates the real
`VirtualOrder` + `VirtualPosition`. That indirection is the point: orderbook,
auto-exit, EOD square-off, journal and analytics all keep working on
`VirtualOrder` with no changes.

Trigger: `BUY` fills when `ltp <= limit_price`, `SELL` when `ltp >= limit_price`.
An order placed at or through the market is marketable and fills on the next
scan — the ticket warns before you place it.

Notes:

- **Discipline runs twice** — at placement and again at the fill. A trigger that
  would breach a cooldown or trade cap set in the meantime becomes `REJECTED`
  with the rule's message in `reject_reason`, never filled quietly.
- **Margin is blocked at placement** (priced off the limit) and released the
  moment the order leaves `PENDING` — fill, cancel, expiry or rejection. The
  fill releases before `place_order()` re-blocks, so it is never charged twice.
- `scan_and_fill()` **owns its transaction and commits per order**, unlike
  `scan_and_exit()`. A rejection must persist without discarding fills that
  already succeeded in the same sweep.
- Prices are quantized to 2dp on the way in. The columns are `Numeric(10,2)`, so
  comparing an unrounded input against the stored value would make an honest
  retry look like a different order and 409.
- LIMIT orders are **DAY validity** — `expire_pending_orders()` clears the book
  at 15:29, and the 08:30 reset sweeps anything a missed EOD run stranded.

---

## Market data

Provider factory `app/market/provider_factory.py` — module singleton, selected by
`MARKET_DATA_PROVIDER`: `mock` | `fyers` | `kite`.

Exactly one broker is live at a time; connecting one auto-disconnects the others.
Fyers **falls back to mock** on missing/invalid credentials.
**Kite is deliberately fail-closed** and never substitutes simulated prices.

Broker tokens are Fernet-encrypted in `broker_connections`
(`BROKER_TOKEN_ENC_KEY`, else derived from `SECRET_KEY`). They are currently
stored **globally** (`user_id=None`), not per user — a single-tenant assumption
sitting inside an otherwise multi-tenant schema.

### Scheduler — `app/market/market_scheduler.py`

APScheduler `AsyncIOScheduler`, timezone `Asia/Kolkata`.

| Job | Cadence | Leader-only |
|---|---|---|
| market status + option chain broadcast | 3s | no |
| option metrics + analytics broadcast | 15s | no |
| strategy mark-to-market | 15s | yes |
| SL/target auto-exit | 5s | yes |
| resting LIMIT order fills | 5s | yes |
| expiry + intraday square-off | 15:29 cron | yes |
| pre-market reset | 08:30 cron | yes |
| Kite instrument catalog sync | 08:30 cron | yes |

**Leader-only jobs mutate the database** and run in one elected process
(`SchedulerLeadership`, Redis lease). Broadcast jobs skip entirely when no
WebSocket clients are connected; state jobs run regardless — a stop-loss must be
honoured whether or not anyone is watching.

If `REDIS_URL` is set but Redis is unreachable, development with a non-Kite
provider falls back to single-process leadership. **Production and Kite stay
fail-closed** — if you see "state jobs are paused" in production, start Redis;
do not widen the fallback.

### WebSocket — `ws://…/api/v1/market/ws?token=<access JWT>`

Authenticated via `get_ws_user` **before** the connection is accepted; browsers
cannot send an `Authorization` header on a WS upgrade, so the token travels as a
query parameter and goes through the same pipeline as HTTP (signature, expiry,
type, JTI denylist, `token_version`, active user).

Frame types: `option_chain`, `market_status`, `broker_status`, `option_metrics`,
`option_analytics`, `trading_update`.

Global market frames broadcast to everyone; `trading_update` is per-user via
`push_user_event`. The last frame of each `(type, instrument)` is replayed to a
newly connected client. **`trading_update` carries no payload** — it is
notify-then-refetch; REST stays the single source of truth.

---

## Auth

- Access token: **memory only**, 5 min, never in `localStorage`.
- Refresh token: httpOnly cookie, path `/api/v1/auth`, rotated on every use,
  family-tracked for reuse detection.
- `POST /auth/login|refresh|logout` additionally check `Origin` against
  `trusted_origins`.
- `token_version` on `User` invalidates every outstanding access token on
  logout-all; optional JTI denylist (`JTI_DENYLIST_ENABLED`).
- OAuth uses server-side transactions with state + PKCE. Linking an OAuth
  identity to an existing password account requires a password challenge.

### Frontend auth — the sharp edges

- `api/client.js` — request interceptor attaches the in-memory token; response
  interceptor retries once on 401 behind a single-flight `refreshPromise`.
- **`api/auth.js` `refresh()` must call `refreshAccessToken()`, not the raw
  client.** The raw client does not store the returned token, so the follow-up
  `/auth/me` runs unauthenticated, 401s, and rotates the single-use refresh
  cookie a second time — bouncing valid sessions to `/login` on every reload.
  This has broken once already.
- `App.jsx` dedupes session restore in a module-scoped promise, because
  StrictMode double-invokes effects and refresh tokens are single-use.
- **Never render an API error payload directly into JSX.** FastAPI returns 422
  `detail` as an *array of objects*; React throws "Objects are not valid as a
  React child" and the error boundary blanks the page. Always go through
  `utils/apiError.js` (`getApiErrorMessage` / `toDisplayMessage`). This has also
  broken once already.

---

## Frontend architecture

Routes in `src/App.jsx`. Public/marketing: `/`, `/product`, `/discipline-engine`,
`/scope`, `/docs`, `/blog`, `/varsity`, `/pricing`, `/login`, `/register`,
`/auth/oauth-callback`. Protected (inside `ProtectedRoute` → `AppLayout`):
`/dashboard`, `/terminal-1`, `/positions`, `/option-chain`, `/trading`,
`/strategy-builder`, `/discipline`, `/discipline-mode`, `/journal`, `/analytics`,
`/settings`, `/api-key`, `/reports`.

Stores (Zustand): `authStore` (in-memory token + auth epoch), `marketStore`
(chains keyed by instrument), `tradingStore` (`eventSeq` bumped by WS, pages
re-run their REST loaders), `preferencesStore` (mirrors server defaults).

`AppErrorBoundary` in `App.jsx` catches render errors; a blank page usually means
something threw inside render — check the console before assuming a data problem.

### Design system

**Three themes**, all token-driven from `src/styles/index.css`: `dark` (default),
`light` (misty), `forest-light`. `useTheme.js` stamps a class plus
`data-theme` on `<html>`.

- **Never hardcode a hex value.** Use the CSS custom properties. Use
  `--on-primary` for text on an accent background.
- Discipline is the hero of the UI; P&L is calm and secondary.
- Keep the trading surface dense and scannable, not marketing-styled.
- Sidebar 220px, TopBar 52px. Inline styles are common and idiomatic here.

---

## Testing

383 tests. `backend/tests/unit/` is mostly pure and needs no database;
`backend/tests/integration/` self-skips when Postgres is unreachable and wraps
each test in a rolled-back outer transaction, so nothing persists.

CI (`.github/workflows/ci.yml`) runs backend tests against Postgres 16 + Redis 7,
then builds the frontend.

### Verifying your work — read this before claiming something passes

A green `pytest` on your machine does **not** mean CI is green. Two differences
have already caused real failures.

**1. CI runs `ENVIRONMENT=testing`, not `development`.**

`ENVIRONMENT` is a free string. `is_development` is `ENVIRONMENT == "development"`
and `is_production` is `ENVIRONMENT == "production"` — so under CI's `testing`
**both are False**. Any code branching on `not is_development` silently takes the
strict path in CI and nowhere else.

This exact mistake shipped in `app/market/freshness.py` and turned 44 tests red
while every local run stayed green. **Gate on `is_production` when you mean
"only be strict in production."**

Reproduce CI's environment before pushing:

```powershell
cd backend
$env:ENVIRONMENT="testing"; $env:MARKET_DATA_PROVIDER="mock"
$env:REDIS_URL="redis://127.0.0.1:6379/0"
pytest -q
```

**2. CI migrates an EMPTY database.**

CI runs `alembic upgrade head` from nothing. Your dev database is already
migrated, so a migration that only works against existing data passes locally
and fails in CI. Test the real path:

```powershell
# create a throwaway DB, then:
$env:DATABASE_URL="postgresql://…/sf_probe"; alembic upgrade head
```

Note `tests/conftest.py::_ensure_strategy_schema` papers over schema drift for
local runs — it creates missing tables directly from the ORM. That safety net
does **not** exist in CI, which is another reason local green ≠ CI green. A new
table needs its Alembic migration *and* an entry in that patcher.

### The checklist

| Check | Command |
|---|---|
| Boot / Security Kernel | `pytest tests/unit/test_security_kernel.py -q` |
| Structural gates | `pytest tests/unit/test_ledger_boundary.py tests/unit/test_paper_trading_boundary.py -q` |
| Full suite, CI env | see above |
| Migration round-trip | `alembic downgrade -1 && alembic upgrade head` |
| Migration from scratch | `alembic upgrade head` on an empty DB |
| Frontend | `npm run build` |
| Live smoke | run on **port 8001** — 8000 is the developer's own server |

For anything touching money, assert the ledger still reconciles:

```sql
SELECT a.user_id FROM virtual_accounts a
WHERE a.balance <> COALESCE(
  (SELECT SUM(l.amount) FROM virtual_fund_ledger l WHERE l.account_id = a.id), 0);
-- must return zero rows
```

Two live-smoke traps, both of which have wasted time: `run_tests.py` is **stale**
(it predates `client_order_id`, posts form-encoded login to a JSON endpoint, and
omits the `Origin` header — ~10 of its 38 checks fail on a healthy server), and
`/auth/login` takes a **JSON body with `email`**, not an OAuth2 form.

**Gap worth closing:** `tests/unit/test_discipline_engine.py`,
`test_slippage_engine.py`, `test_brokerage_calculator.py`, `test_utils.py`,
`tests/integration/test_auth.py` and `test_journal.py` are **empty files**. The
discipline engine — the product's core differentiator — has no direct unit tests
and is only covered indirectly through order-placement tests.

---

## Known rough edges

- `GET /market/debug/raw-fyers` is dev-gated but instantiates the Fyers SDK
  directly, bypassing the `ReadOnlyBrokerClient` allowlist. Delete it.
- `_close_mirrored_order` matches a leg's `VirtualOrder` by
  `strategy_id + strike + option_type + action` and takes `.first()`. Two legs
  with identical values (ratio structures) collide. A `leg_id` column on
  `virtual_orders` would make this exact.
- Kite-only market endpoints (`/quotes`, `/ohlc`, `/depth`, `/futures`,
  `/history`) return 409 under other providers; `/instruments/search` and
  `/expiries` read the `kite_instruments` table without that guard.
- Broker tokens are global, not per user (see *Market data*).
- **`src/pages/LoginPage.jsx` is the live login page (338 lines).**
  `src/pages/auth/LoginPage.jsx` is a one-line re-export shim
  (`export { default } from '../LoginPage'`) and `App.jsx` imports the shim.
  Neither is orphaned — do not "clean up" either one.
- Genuinely dead code, a leftover UI generation that `PositionsPage`,
  `JournalPage` and `DisciplinePage` superseded. It forms one connected
  subtree, so delete it together or not at all:
  `pages/journal/JournalEntryPage.jsx` (complete and working, but never routed —
  `JournalPage` shows detail inline via `TradeDetailPanel`), `PositionsList` →
  `OpenPositionCard`, `ViolationList`, `StrikeRow`, `MarketStatusBadge`,
  `RuleViolationToast`, `DisciplineScoreRing`, `DisciplineStreakBadge`,
  `Pagination`, `Badge`, `Input`.
  Check the whole subtree before deleting any single item: `OpenPositionCard`
  looks used, but its only caller is the dead `PositionsList`.
- `pages/reports/ReportsPage.jsx` and `pages/account/ApiKeyPage.jsx` are
  deliberate placeholders ("will appear here"), routed and reachable from the
  TopBar profile menu. They are unbuilt features, not broken wiring.
- `README.md` still lists only mock/Fyers under market data; Kite is fully built.
- **Nuvama was removed entirely** (2026-07-27): provider, router, auth service,
  broker adapter, SDK wrapper, setup wizard, settings, SDK dependency and
  `broker_connections` rows. Do not reintroduce references to it.

---

## Safety rules

- Never commit secrets or local tokens.
- Never start a second market WebSocket — one lives in `AppLayout`.
- Do not revert user changes unless asked.
- **Do not leave a fix on a branch that is never merged.** A post-merge fix once
  lived only on a deleted `fix/post-merge-runtime` branch while `main` shipped
  broken; recovery needed the reflog. Land fixes on the branch that ships.
- Preserve the existing architecture: thin routers, logic in services, one API
  module per domain on the frontend, Zustand for shared state.
