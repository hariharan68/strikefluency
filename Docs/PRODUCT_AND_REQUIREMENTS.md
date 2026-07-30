# Product and software requirements

**Status:** implemented-system specification

**Verified:** 2026-07-30

**Sources of truth:** `backend/app`, `backend/migrations`, `frontend/src`, and tests

## 1. Purpose

StrikeFluency lets Indian retail traders practice index options without sending
orders to a broker. The product is designed around behavior and capital
discipline rather than profit maximization: order entry can be blocked by a
configurable rule set, compliant streaks unlock larger virtual-capital tiers,
and closed trades become journal and analytics records.

The supported underlyings are NIFTY, BANKNIFTY, and SENSEX. Broker connections
provide inbound market data only. All accounts, orders, positions, fills,
margin, P&L, discipline records, and journals are local PostgreSQL state.

## 2. Users and roles

| Role | Creation and capability |
|---|---|
| `trader` | Registers with an existing `tenant_code`; uses personal trading, discipline, journal, analytics, strategy, settings, and market-data surfaces. |
| `tenant_admin` | Registers without a tenant code, creating a tenant; has trader capabilities plus the read-only admin surface scoped to that tenant. |
| `super_admin` | Global read-only operator role supported by authorization and admin queries. No HTTP role-assignment endpoint exists. |

Email addresses are globally unique. A user belongs to one tenant. Most trading
reads and writes are scoped by the authenticated user; the admin surface is the
explicit tenant-aware read-isolation boundary.

## 3. Implemented capabilities

### 3.1 Authentication and sessions

- Email/password registration and login.
- Five-minute access JWTs held in frontend memory.
- Rotating, family-tracked refresh JWTs held in an httpOnly cookie at
  `/api/v1/auth`; persistent and browser-session policies are supported.
- Session listing, single-family revocation, logout, and logout-all.
- Google, GitHub, and Facebook OAuth flows with server-side transaction state;
  Google uses PKCE and the transaction abstraction covers every provider.
- Password confirmation before an OAuth identity is linked to an existing
  password account.
- Optional access-token JTI denial through Redis and mandatory `token_version`
  checking for logout-all invalidation.

### 3.2 Market data and option intelligence

- Provider abstraction for mock, Fyers, and Kite data.
- Spot, option-chain, expiry, market-status, metrics, and WebSocket updates for
  all three supported underlyings.
- Kite-only instrument search, quote, OHLC, depth, history, futures, expiries,
  instrument-catalog sync, and Redis-backed tick state.
- Option-chain calculations for PCR by OI and volume, max pain, OI walls,
  writing posture, ATM IV, IV percentile, greeks, buildup classification, net
  gamma exposure, and gamma-flip strike.
- Quote freshness metadata and different safety behavior for new entries,
  scheduler triggers, and manual exits.

### 3.3 Standalone paper trading

- Immediate MARKET entries and DAY-valid resting LIMIT entries.
- BUY and SELL CE/PE contracts with INTRADAY or NRML product type.
- Server-derived lot sizes, simulated slippage, detailed brokerage, optional
  5x virtual leverage, margin reservation, and balance checks.
- Retry-safe placement using user-scoped `client_order_id` values.
- Stop-loss, target, and full-position resting LIMIT exits.
- Manual close, automatic protection exit, 15:29 intraday square-off, expiry
  settlement, and emergency exit for eligible standalone BUY positions.
- Order history, tradebook, pending-order views, open positions, daily session,
  and virtual-account summaries.

### 3.4 Strategy builder and execution

- A pure-mathematics strategy package with Black-76 pricing, greeks, strike
  selection, payoff, margin, probability analysis, and template generation.
- Thirty-two tested strategy templates grouped by market view.
- Draft strategies with up to ten legs, optional calendar expiries, template
  expansion, analysis, scenario simulation, and execution preview.
- Persisted builder presets/drafts in JSONB workspaces.
- Paper execution, leg close, complete square-off, mark-to-market, and mirrored
  `virtual_orders` for journal/analytics compatibility.
- A multi-leg strategy counts as one trade and evaluates only setup tag, daily
  trade count, and daily loss rules.

### 3.5 Discipline and progression

- Seven configurable rules: maximum trades/day, mandatory stop-loss, no
  averaging down, no direction flip, revenge cooldown, maximum daily loss, and
  mandatory setup tag.
- A master Discipline Mode. OFF bypasses rules, unlocks Tier 3 sandbox capital,
  and excludes free-play trades from score and streak calculations. ON restores
  rules without clawing capital back.
- Rolling compliance score over the latest 20 completed non-free-play trades.
- Capital tiers of ₹1,00,000, ₹5,00,000, and ₹10,00,000; 15 consecutive
  disciplined trades are required for each next-tier unlock.
- Violation history, daily score snapshots, progress history, tier progress,
  and Discipline ON/OFF performance comparison.

### 3.6 Journal, analytics, and operations

- Automatic one-to-one journal entry when a standalone order closes.
- User-editable emotion, mistake category, thesis, review, and reviewed state.
- Summary, advanced performance, discipline trend, P&L curve, and mistake
  analytics.
- Daily account and per-open-position snapshots at 15:35 IST.
- Append-only funds ledger and security/trading audit trail.
- Read-only admin overview, users, audit, ledger reconciliation, snapshots, and
  system health, scoped by operator role.

### 3.7 Frontend

- Public marketing, product, discipline, scope, documentation, blog, varsity,
  pricing, login, registration, and OAuth callback pages.
- Protected dashboard, market terminal, positions, option chain, trading desk,
  strategy builder, discipline, journal, analytics, settings, and admin pages.
- Authenticated WebSocket with reconnect backoff, heartbeat, replayed market
  frames, and REST fallback/refetch behavior.
- Four themes: dark, misty light (`light`), forest light, and aqua light.

## 4. Explicitly absent or deferred

The following are not production capabilities of this repository:

- Real broker execution, broker positions, broker holdings, broker funds, or
  order-management APIs.
- Historical market replay, candle-by-candle playback, or a historical
  option-chain ingestion store. Kite historical-candle reads do not constitute
  a replay engine.
- A generic backtesting engine. Strategy `/simulate` evaluates supplied price
  scenarios; it does not replay historical sessions.
- Payments, subscriptions, invoices, checkout, or payment-provider webhooks.
  `users.plan` and `require_plan()` are only a disabled gating seam.
- Partial fills or partial position closes. One virtual order maps to at most
  one virtual position and closes as a whole.
- Cross-process event distribution for targeted `trading_update` WebSocket
  notifications; the connection manager is process-local.
- A built-in role-management endpoint.
- Production container images, infrastructure-as-code, a reverse-proxy
  configuration, or a hosted deployment workflow.
- Functional Tools, API Key, and Reports workspaces. Those protected routes
  currently render placeholders.
- India VIX in the option intelligence response; the backend returns `null`.
- Fyers history and futures implementations in `FyersMarketDataProvider`; those
  methods currently return `source: not_implemented`.

## 5. Core functional requirements

| ID | Requirement | Enforcement/source |
|---|---|---|
| FR-01 | A user can create or join a tenant and receive an isolated virtual account and default discipline rules. | `services/auth_service.py` |
| FR-02 | Every registered route is authenticated or appears in an explicit public registry. | `core/security_kernel.py`, `tests/unit/test_security_kernel.py` |
| FR-03 | Broker credentials may produce market data but never broker execution. | `core/paper_trading_policy.py`, broker adapter ABCs, boundary tests |
| FR-04 | A new paper entry must be inside execution hours and use an orderable quote. | `core/utils.py`, `market/freshness.py`, order services |
| FR-05 | Discipline Mode ON evaluates applicable rules before a fill; OFF bypasses them and marks the trade free-play. | discipline and execution services |
| FR-06 | A balance mutation and its ledger row occur in the same database transaction. | `services/ledger_service.py`, ledger boundary tests |
| FR-07 | A repeated `client_order_id` with the same intent returns the original result; a different intent conflicts. | order and pending-order services |
| FR-08 | Scheduled triggers skip stale data and retry later rather than filling or exiting from an untrusted tick. | `market/freshness.py`, fill/exit services |
| FR-09 | A completed standalone order updates account/session state and produces a journal entry. | `services/virtual_order_service.py`, `journal_service.py` |
| FR-10 | Events that announce database state are emitted only after commit and carry no state payload. | `events/publisher.py` and router/scheduler call sites |
| FR-11 | A tenant admin cannot expand read scope with request input; a super admin may read globally. | `routers/admin.py`, admin integration tests |
| FR-12 | Daily snapshots are idempotent per user/position and date. | snapshot models/service and unique constraints |

## 6. Non-functional requirements embodied in code

### Safety and consistency

- Fail-closed startup for invalid production security configuration, unsafe
  execution modes, and unaudited routes.
- PostgreSQL row locks serialize account, order, position, and session updates.
- Router-owned request transactions; explicitly documented service-owned
  transactions only for token rotation, OAuth, broker token helpers, and the
  per-order pending-fill scheduler sweep.
- Append-only update guards on the funds ledger and audit log.
- `Decimal` for money outside the pure numerical strategy package.

### Availability behavior

- Database connections use `pool_pre_ping` with a 10-connection base pool and
  20 overflow connections per process.
- Redis elects one process for database-mutating scheduler work.
- Production and Kite pause state jobs when Redis leadership is unavailable;
  development with a non-Kite provider may use a single-process fallback.
- Broker and audit notification failures are generally isolated from the
  trading transaction; durable state remains authoritative.

### Security and privacy

- Passwords use bcrypt; refresh tokens are stored as SHA-256 hashes.
- Broker tokens are Fernet-encrypted at rest.
- Access tokens are memory-only in the frontend; refresh cookies are httpOnly,
  SameSite=Lax, path-scoped, and Secure in production.
- API responses receive defensive headers and `Cache-Control: no-store`.
- Production API schema endpoints are disabled.

## 7. Domain constraints

| Constraint | Value |
|---|---|
| Execution hours | 09:15 through 15:30 IST on weekdays; calendar helper is holiday-blind |
| EOD state work | 15:29 IST |
| Daily snapshots | 15:35 IST |
| Pre-market cleanup/catalog sync | 08:30 IST |
| NIFTY | NSE, lot 65, strike interval 50, weekly and monthly, Tuesday expiry |
| BANKNIFTY | NSE, lot 30, strike interval 100, monthly only, Tuesday expiry |
| SENSEX | BSE, lot 20, strike interval 100, weekly and monthly, Thursday expiry |
| Leverage preference | 5x virtual leverage when enabled; 1x when disabled |
| Strategy legs | Maximum 10 |
| Score window | Latest 20 completed, non-free-play trades |

## 8. Success and acceptance criteria

A release is acceptable only when:

1. the application imports with a passing security route audit;
2. Alembic upgrades an empty PostgreSQL database to the single head;
3. backend tests pass under the CI environment (`ENVIRONMENT=testing`, mock
   provider, PostgreSQL, and Redis);
4. frontend unit tests and the Vite production build pass;
5. paper-trading and ledger boundary tests remain green;
6. new tables, routes, scheduled jobs, configuration, and wire events are
   reflected in this documentation set.
