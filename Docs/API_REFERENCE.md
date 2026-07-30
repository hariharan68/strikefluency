# API reference

**Verified:** 2026-07-30

**Base path:** `/api/v1` except `/health`

**Inventory:** 112 HTTP operations and one WebSocket route

This is the stable human-readable inventory. In development, the generated
request/response schema is available from `/docs`, `/redoc`, and
`/openapi.json`. Those routes are disabled outside `ENVIRONMENT=development`.

## 1. Conventions

### Authentication

Protected HTTP routes require:

```http
Authorization: Bearer <access-jwt>
```

The market WebSocket uses `?token=<access-jwt>` because browser WebSocket
upgrades cannot set that header. The refresh JWT is not accepted as a bearer
token; it is sent only as the httpOnly `refresh_token` cookie to auth paths.

Unless a table marks a route Public, it requires an active user. Admin routes
also require `tenant_admin` or `super_admin`. Kite credential mutations and
credential reads require an admin; ordinary Kite connection/status operations
use an authenticated user.

### Content and errors

JSON is the normal request/response format. FastAPI returns 422 for schema
validation. Domain errors use a JSON `detail` string with an appropriate 4xx
status; 422 `detail` is commonly an array of structured validation objects.
Authentication throttling returns 429 plus `Retry-After`.

### Pagination

Paginated endpoints are one-based. Most accept `page` and `page_size` and return
the collection plus `total`, `page`, and `page_size`. Limits are route-specific;
admin pages cap `page_size` at 200.

### Idempotency

MARKET and pending LIMIT placement require a UUID `client_order_id`. Same intent
replay returns the original resource with HTTP 200; first creation returns 201;
different intent with the same ID returns a conflict.

## 2. Deliberately public surface

These 12 operations are the complete public registry. “Public” can still mean
cookie/state/password protected; it means no bearer dependency is possible or
required.

| Method | Path | Reason/control |
|---|---|---|
| GET | `/health` | Liveness and public capability flags; no user data. |
| POST | `/api/v1/auth/register` | Creates an account; 3 requests/minute/IP. |
| POST | `/api/v1/auth/login` | Creates a session; Origin checked, 5/minute/IP. |
| POST | `/api/v1/auth/refresh` | Refresh cookie + Origin check, 20/minute/IP. |
| POST | `/api/v1/auth/logout` | Refresh cookie + Origin check. |
| GET | `/api/v1/oauth/{provider}/start` | Browser redirect; server transaction cookie/state. |
| GET | `/api/v1/oauth/{provider}/callback` | Provider redirect; state and transaction validation. |
| POST | `/api/v1/oauth/link/{challenge_id}/confirm` | Password proof; 5/minute/IP. |
| GET | `/api/v1/auth/fyers/callback` | Fyers one-time auth-code redirect. |
| GET | `/api/v1/broker/fyers/callback` | Legacy Fyers callback alias. |
| GET | `/api/v1/auth/kite/callback` | Kite one-time Redis operation state. |
| GET | `/api/v1/market/status` | Market clock/provider status without user data. |

## 3. System and authentication

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/health` | Public | `{status, environment, execution_mode, broker_access_mode}` capability response. |
| POST | `/auth/register` | Public | Register, create/join tenant, seed account/rules, set refresh cookie, return access token/user. |
| POST | `/auth/login` | Public | Verify password, set refresh cookie, return access token/user. |
| POST | `/auth/refresh` | Public-cookie | Rotate the single-use refresh record and cookie; return access token. |
| POST | `/auth/logout` | Public-cookie | Revoke current refresh family and delete cookie. |
| GET | `/auth/me` | User | Current profile. |
| PUT | `/auth/me` | User | Replace `full_name`. |
| GET | `/auth/sessions` | User | Active terminal refresh records, including current family. |
| DELETE | `/auth/sessions/{family_id}` | User | Revoke one owned family. |
| POST | `/auth/logout-all` | User | Revoke all families, increment token version, deny current JTI, delete cookie. |

Registration fields are `full_name`, `email`, `password` (minimum 8 characters),
optional `tenant_code`, and `remember_me`. Login accepts email, password, and
`remember_me`. `UserProfile` returns id, email, full name, role, plan, tenant,
and active state.

## 4. OAuth

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/oauth/{provider}/start` | Public | Start `google`, `github`, or `facebook`; `remember_me` query is supported. |
| GET | `/oauth/{provider}/callback` | Public | Consume transaction/state, exchange code, create/login/link challenge, then redirect. |
| POST | `/oauth/link/{challenge_id}/confirm` | Public-password | Confirm an existing-account link and issue a session. |

OAuth success redirects to `/auth/oauth-callback` on `FRONTEND_URL` and sets the
same refresh cookie as password login. Existing password accounts are not
silently linked from a matching provider email.

## 5. Market data

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/market/option-chain` | User | Canonical provider chain; `instrument` defaults to NIFTY. |
| GET | `/market/spot` | User | Spot snapshot for `instrument`. |
| GET | `/market/status` | Public | One source for market/provider status and IST clock. |
| GET | `/market/instruments/search` | User | Search Kite catalog by text/exchange/segment/type/expiry. |
| GET | `/market/quotes` | User, Kite selected | Quotes for 1-500 comma-separated instrument tokens. |
| GET | `/market/ohlc` | User, Kite selected | OHLC projection for instrument tokens. |
| GET | `/market/depth` | User, Kite selected | Market depth for instrument tokens. |
| GET | `/market/history/{instrument_token}` | User, Kite selected | Historical candles with interval/from/to/continuous/OI. |
| GET | `/market/futures` | User, Kite selected | Future for underlying and optional expiry. |
| GET | `/market/expiries` | User | Catalog expiries for underlying and `OPT`/`FUT`. |
| WS | `/market/ws` | User JWT in `token` query parameter | Replayed and live market frames plus targeted trading notifications. |
| GET | `/market/debug/raw-fyers` | User + development | Raw Fyers option-chain diagnostic; returns 404 outside development. |

Kite-specific reads return 409 when Kite is not the selected provider. History
validates `from < to`; supported intervals are minute, 3/5/10/15/30/60minute,
and day.

## 6. Standalone trading

| Method | Path | Purpose |
|---|---|---|
| GET | `/trading/account` | Virtual account plus today's trades/P&L, open P&L, cooldown. |
| POST | `/trading/orders` | Place or replay a MARKET paper order. |
| GET | `/trading/orders` | Paginated order book with status and trading-day scope filters. |
| GET | `/trading/tradebook` | Paginated executed/closed trade view. |
| GET | `/trading/orders/{order_id}` | Owned order detail. |
| PATCH | `/trading/orders/{order_id}/protection` | Replace complete SL/target intent; both keys required and nullable. |
| PATCH | `/trading/orders/{order_id}/exit-limit` | Set/replace or null-cancel a full-position exit limit. |
| POST | `/trading/orders/{order_id}/close` | Manual whole-position close. |
| POST | `/trading/positions/emergency-exit` | Close every eligible standalone BUY position in one transaction. |
| POST | `/trading/pending` | Place or replay a resting LIMIT entry. |
| GET | `/trading/pending` | Pending/terminal view with trading-day scope and open/executed counts. |
| POST | `/trading/pending/{pending_id}/cancel` | Cancel owned PENDING order and release reservation. |
| GET | `/trading/positions` | Open positions and aggregate P&L/margin. |
| GET | `/trading/sessions/today` | Current session count, realized P&L, cooldown state. |

MARKET entry body:

```json
{
  "client_order_id": "62a1b0dd-2287-44c4-8cc5-9310720d0d6f",
  "instrument": "NIFTY",
  "expiry_date": "2026-08-04",
  "strike_price": 25000,
  "option_type": "CE",
  "action": "BUY",
  "quantity": 1,
  "product_type": "INTRADAY",
  "sl_price": "80.00",
  "target_price": "140.00",
  "setup_tag": "PRICE_ACTION"
}
```

`sl_price`, `target_price`, and `setup_tag` are schema-optional because
Discipline Mode OFF permits bare free-play orders. Active rules may require
them. Pending placement adds required positive `limit_price` and otherwise uses
the same intent fields.

## 7. Discipline

| Method | Path | Purpose |
|---|---|---|
| GET | `/discipline/mode` | Current master mode and unlocked balance/tier state. |
| PUT | `/discipline/mode` | Set `{enabled: boolean}`. |
| GET | `/discipline/rules` | Active/inactive rules and JSON values. |
| PUT | `/discipline/rules/{rule_code}` | Replace `rule_value` and/or `is_active`. |
| GET | `/discipline/score` | Score, streak, tier, and trades to next tier. |
| GET | `/discipline/violations` | Recent violation records; bounded `limit`. |
| GET | `/discipline/violations/today` | Current trading-day violations. |
| GET | `/discipline/progress` | 30-point history, tier progress, and ON/OFF performance. |

## 8. Journal and analytics

| Method | Path | Purpose |
|---|---|---|
| GET | `/journal` | Paginated journal plus aggregate metrics and filters. |
| GET | `/journal/{entry_id}` | Owned journal entry. |
| PUT | `/journal/{entry_id}` | Patch emotion, mistake, thesis, review, and reviewed state. |
| GET | `/analytics/advanced` | Period summary, daily/equity series, drawdown, and breakdowns; `days` is bounded. |
| GET | `/analytics/summary` | Overall completed-trade summary. |
| GET | `/analytics/discipline-trend` | Daily discipline scores for requested days. |
| GET | `/analytics/pnl-curve` | Per-trade cumulative P&L. |
| GET | `/analytics/mistakes` | Mistake counts and percentages. |

Journal update fields are optional, so the endpoint behaves as a patch despite
using PUT. Values are not a request to reprice or modify the underlying order.

## 9. Strategy builder

| Method | Path | Purpose |
|---|---|---|
| GET | `/strategy/templates` | Template metadata, optionally filtered by category. |
| GET | `/strategy/templates/{template_id}/legs` | Expand a template against underlying/expiry chain. |
| POST | `/strategy/analyze` | Pure ad-hoc payoff, greeks, margin, POP, and validation problems. |
| POST | `/strategy/simulate` | Rich builder scenario calculation; no persistence. |
| GET | `/strategy/market-context` | Spot, expiries, and chain context for an underlying. |
| GET | `/strategy/configurations` | List saved/draft builder JSONB configurations. |
| POST | `/strategy/configurations` | Create `SAVED` or `DRAFT` configuration. |
| GET | `/strategy/configurations/{configuration_id}` | Read owned configuration. |
| PATCH | `/strategy/configurations/{configuration_id}` | Update name/underlying/schema version/state. |
| DELETE | `/strategy/configurations/{configuration_id}` | Delete owned configuration. |
| POST | `/strategy/execute-preview` | Convert included builder legs into and execute a paper strategy. |
| POST | `/strategy/from-template` | Create a persisted draft from a template. |
| POST | `/strategy/draft` | Create an empty persisted strategy draft. |
| GET | `/strategy` | Paginated strategies, optional status filter. |
| GET | `/strategy/{strategy_id}` | Strategy, legs, and optional live position. |
| POST | `/strategy/{strategy_id}/legs` | Add a draft leg. |
| DELETE | `/strategy/{strategy_id}/legs/{leg_id}` | Remove a draft leg. |
| PATCH | `/strategy/{strategy_id}/setup-tag` | Set the strategy setup tag. |
| DELETE | `/strategy/{strategy_id}` | Delete a draft; 204 response. |
| GET | `/strategy/{strategy_id}/analytics` | Persisted strategy payoff/greeks/margin. |
| POST | `/strategy/{strategy_id}/execute` | Execute the draft into local legs/position. |
| POST | `/strategy/{strategy_id}/legs/{leg_id}/close` | Close one open leg; optional supplied exit LTP. |
| POST | `/strategy/{strategy_id}/square-off` | Close all open legs with a supported reason. |
| POST | `/strategy/{strategy_id}/mark-to-market` | Refresh live position/leg marks. |

Builder requests support 1-10 included legs. Option legs require a strike;
future legs forbid one. Analyze requests are not an order and may return a
`problems` list rather than persisting invalid combinations.

## 10. Option intelligence

| Method | Path | Purpose |
|---|---|---|
| GET | `/options/{instrument}/metrics` | PCR, max pain, OI walls, IV, posture, GEX, gamma flip; optional expiry. |
| GET | `/options/{instrument}/chain` | Enriched per-leg LTP/OI/volume/IV/greeks/buildup rows. |

Unknown instruments return 404. Both reads use the selected provider and do not
persist snapshots.

## 11. Settings

| Method | Path | Purpose |
|---|---|---|
| GET | `/settings` | Full defaults merged with stored JSONB overrides. |
| PUT | `/settings` | Partial update; unknown keys are forbidden. |

Supported keys are default instrument/lots, close confirmation, risk warnings,
LTP autofill, virtual leverage, and four notification toggles. Lots are 1-50.

## 12. Fyers broker lifecycle

| Method | Path | Access/purpose |
|---|---|---|
| GET | `/auth/fyers/credentials` | User; masked/configured state. |
| POST | `/auth/fyers/credentials` | User; persist app ID/secret. |
| DELETE | `/auth/fyers/credentials` | User; revoke credentials and token. |
| GET | `/auth/fyers/login` | User; return/start broker authorization. |
| GET | `/auth/fyers/callback` | Public callback HTML. |
| GET | `/auth/fyers/status` | User; selected/connected state. |
| DELETE | `/auth/fyers/token` | User; disconnect token but retain credentials. |
| POST | `/auth/fyers/token` | User; store a manually supplied access token. |
| POST | `/auth/fyers/exchange` | User; exchange auth code and activate provider. |
| GET | `/auth/fyers/debug/chain/{instrument_id}` | User + development diagnostic. |
| GET | `/broker/fyers/status` | User; legacy alias. |
| GET | `/broker/fyers/auth-url` | User; legacy alias. |
| GET | `/broker/fyers/callback` | Public legacy callback. |
| GET | `/broker/fyers/profile` | User; broker profile read. |
| POST | `/broker/fyers/token` | User; legacy exchange alias. |
| POST | `/broker/fyers/disconnect` | User; legacy disconnect alias. |

## 13. Kite broker lifecycle

| Method | Path | Access/purpose |
|---|---|---|
| GET | `/auth/kite/status` | User; selected/connected/feed state. |
| GET | `/auth/kite/credentials` | Admin; masked/configured state. |
| POST | `/auth/kite/credentials` | Admin; persist API key/secret. |
| DELETE | `/auth/kite/credentials` | Admin; revoke credentials/token. |
| GET | `/auth/kite/login` | User; create Redis operation state and broker URL. |
| GET | `/auth/kite/callback` | Public callback HTML; consumes operation state. |
| DELETE | `/auth/kite/token` | User; disconnect token. |
| POST | `/auth/kite/instruments/sync` | Admin; synchronize catalog. |

## 14. Admin read surface

| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/overview` | Counts, equity, activity, failed logins, rejected orders in scope. |
| GET | `/admin/audit` | Paginated audit by action/outcome/user. |
| GET | `/admin/users` | Paginated users/account state with search. |
| GET | `/admin/ledger` | Ledger page; with `user_id`, also returns reconciliation status. |
| GET | `/admin/snapshots` | Oldest-first daily portfolio snapshots for up to 365 days. |
| GET | `/admin/health` | Environment, provider, Redis, leader, socket count, and DB migration revision. |

`tenant_admin` is restricted to its own tenant. `super_admin` reads globally.
Supplying another tenant's `user_id` cannot widen scope and results in empty
data or 404 as appropriate. There are no admin mutation endpoints.

## 15. WebSocket frame contract

```json
{"type":"option_chain","instrument":"NIFTY","data":{}}
{"type":"market_status","data":{}}
{"type":"broker_status","data":{}}
{"type":"option_metrics","instrument":"NIFTY","data":{}}
{"type":"option_analytics","instrument":"NIFTY","data":{}}
{"type":"trading_update","reason":"order_closed","ts":"<ISO-8601>"}
{"type":"ack","message":"received"}
```

Steady-state market frames are replayed on connect. `trading_update` is never
replayed and must remain payload-free; clients refetch the affected REST state.
