# Fyers Broker Integration Architecture

This document reverse-engineers the existing Fyers integration in the Strikfin codebase and turns it into a Codex-ready implementation prompt. It is written to describe the current architecture, not to propose a redesign.

## Scope

This architecture slice covers only the Fyers integration and the plumbing it depends on:

- OAuth login, callback, status, disconnect, manual token set, and debug endpoints
- In-memory token handling plus durable encrypted persistence
- Broker adapter abstraction and adapter registry
- Market-data provider behavior for spot, futures, option chain, and history
- Startup hydration of the token store and instrument snapshot
- Frontend broker-connect flow in Settings

It does not cover unrelated product areas.

## High-Level Architecture

The Fyers integration is split into three layers:

1. Frontend connection flow
2. Backend OAuth and token persistence flow
3. Market-data adapter/provider flow

The key design choice is that the live Fyers provider remains the source of market data, while the broker adapter layer wraps it so the rest of the app can depend on a uniform interface.

### Data Flow Summary

1. The user clicks `Connect` in the Settings > Broker Connect panel.
2. The frontend opens a popup and requests the backend Fyers login URL.
3. The backend creates a Fyers OAuth session and returns the authorization URL.
4. The user logs in with Fyers, and Fyers redirects back to the callback endpoint.
5. The callback exchanges `auth_code` for an access token.
6. The token is stored immediately in memory and also written durably to `broker_connections` using Fernet encryption.
7. On startup, the backend reloads the durable token from `broker_connections` back into the in-memory token store.
8. Market-data requests go through the broker adapter and then to the Fyers provider, which uses cached live calls and fallback behavior to stay usable under rate limits.

## Backend Components

### 1. OAuth Router

File:

- [backend/app/api/v1/routers/fyers_auth.py](/C:/Users/sriha/Documents/vscode/Strikfin%20(ATT)/backend/app/api/v1/routers/fyers_auth.py)

Responsibilities:

- Generate the Fyers OAuth login URL
- Handle the OAuth callback
- Report connection status
- Clear the in-memory Fyers token
- Allow manual token set for daily token paste-in workflows
- Expose a debug option-chain endpoint for inspection

#### Endpoints

- `GET /api/v1/auth/fyers/login`
- `GET /api/v1/auth/fyers/callback?auth_code=...&s=...`
- `GET /api/v1/auth/fyers/status`
- `DELETE /api/v1/auth/fyers/token`
- `POST /api/v1/auth/fyers/token`
- `GET /api/v1/auth/fyers/debug/chain/{instrument_id}`

#### Login behavior

The login endpoint creates a `SessionModel` using:

- `client_id = FYERS_APP_ID`
- `secret_key = FYERS_SECRET_ID`
- `redirect_uri = FYERS_REDIRECT_URI`
- `response_type = "code"`
- `grant_type = "authorization_code"`

The returned payload includes:

- `login_url`
- brief browser instructions
- `app_id`
- `redirect_uri`

If Fyers credentials are missing, it returns a structured `FYERS_NOT_CONFIGURED` error.

#### Callback behavior

The callback:

- exchanges `auth_code` for `access_token`
- stores the token in the hot in-memory store immediately
- persists the token durably in `broker_connections`
- treats persistence as best effort, so the OAuth flow still succeeds even if DB write fails
- returns an HTML success page or error page instead of JSON

The callback uses `user_id=None`, because the redirect is unauthenticated and the current implementation treats the connection as the implicit global connection until per-user wiring exists.

#### Status behavior

The status endpoint:

- checks whether the hot token store currently has a token
- performs a live Fyers profile check for actual connectivity
- returns both `has_token` and `connected`

This means the UI can distinguish:

- no token present
- token present but live check failed
- token present and live connection active

#### Manual token set

The manual token endpoint accepts:

```json
{ "access_token": "..." }
```

It:

- updates the in-memory token immediately
- persists the token durably in encrypted storage

#### Disconnect behavior

The delete endpoint clears the in-memory token store. The existing code keeps this behavior simple and does not currently enforce a DB revoke path in the same call.

### 2. Token Store

File:

- [backend/app/core/token_store.py](/C:/Users/sriha/Documents/vscode/Strikfin%20(ATT)/backend/app/core/token_store.py)

Responsibilities:

- Hold the active Fyers access token in memory
- Expose getters and setters for the hot path
- Keep a legacy `.env` write fallback

Important details:

- The hot path is synchronous and in-memory
- `set_access_token()` updates memory and writes to `.env`
- `set_in_memory()` updates memory only
- `clear_access_token()` clears memory and `.env`
- `get_token_info()` returns metadata used by the status endpoint

The Fyers provider reads this store directly when building the API client.

### 3. Durable Broker Token Storage

File:

- [backend/app/brokers/connections.py](/C:/Users/sriha/Documents/vscode/Strikfin%20(ATT)/backend/app/brokers/connections.py)

Responsibilities:

- Encrypt broker tokens at rest
- Persist, retrieve, and revoke broker connections
- Hydrate the hot token store on startup from durable storage

Key behavior:

- Uses Fernet encryption
- If `BROKER_TOKEN_ENC_KEY` is empty, derives a stable key from `SECRET_KEY`
- `user_id` is nullable for now
- Status values include `ACTIVE` and `REVOKED`
- The persistence helpers are async and use SQLAlchemy `AsyncSession`

Important helper functions:

- `save_broker_token(...)`
- `get_broker_token(...)`
- `revoke_broker_token(...)`
- `load_fyers_token_into_store(...)`

Startup hydration priority:

1. DB token from `broker_connections`
2. Existing `.env` token already loaded into the in-memory store

### 4. Broker Adapter Interface

File:

- [backend/app/brokers/base.py](/C:/Users/sriha/Documents/vscode/Strikfin%20(ATT)/backend/app/brokers/base.py)

Responsibilities:

- Define a synchronous vendor-agnostic broker interface
- Preserve the current dict-based contract

Methods:

- `get_spot(ref)`
- `get_option_chain(ref, expiry_date=None)`
- `get_futures(ref)`
- `get_history(ref, days=60, resolution="D")`
- `get_open_interest(ref, expiry_date=None)`
- `is_connected()`

Trading methods exist as stubs for later phases:

- `get_positions`
- `get_orders`
- `get_holdings`
- `place_order`

The critical design constraint is that methods accept `InstrumentRef`, not raw vendor symbols or magic IDs.

### 5. Fyers Adapter

File:

- [backend/app/brokers/fyers/adapter.py](/C:/Users/sriha/Documents/vscode/Strikfin%20(ATT)/backend/app/brokers/fyers/adapter.py)

Responsibilities:

- Implement `BrokerAdapter` for Fyers
- Delegate to the existing provider module
- Stay thin and non-invasive

Current behavior:

- `get_spot()` delegates to `app.ingestion.providers.fyers_provider.get_spot(instrument_id)`
- `get_option_chain()` delegates similarly
- `get_futures()` delegates similarly
- `get_history()` delegates similarly
- `is_connected()` delegates to the provider health check

This is explicitly a strangler wrapper, not a rewrite.

### 6. Broker Registry

File:

- [backend/app/brokers/registry.py](/C:/Users/sriha/Documents/vscode/Strikfin%20(ATT)/backend/app/brokers/registry.py)

Responsibilities:

- Resolve which adapter serves market-data requests
- Cache adapter instances

Current resolution rule:

- `settings.MARKET_DATA_VENDOR == "fyers"` -> `FyersAdapter`
- otherwise -> `MockAdapter`

The registry accepts an `InstrumentRef` parameter on `get_market_data_adapter(ref)` even though the current resolution is still global. That is forward-compatible plumbing for future per-instrument or per-user resolution.

### 7. Market Data Facade

File:

- [backend/app/market_data/service.py](/C:/Users/sriha/Documents/vscode/Strikfin%20(ATT)/backend/app/market_data/service.py)

Responsibilities:

- Provide an async facade over the synchronous adapter
- Run adapter calls in a threadpool
- Preserve the existing response shapes

Behavior:

- `get_spot`, `get_option_chain`, `get_futures`, `get_history`, and `get_open_interest` resolve the adapter then call it via `run_in_threadpool`
- `spot_by_id`, `option_chain_by_id`, `futures_by_id`, and `history_by_id` first resolve an `InstrumentRef` from the DB

The facade stays thin. Caching and fallback logic remain in the provider layer.

### 8. Startup Wiring

File:

- [backend/app/main.py](/C:/Users/sriha/Documents/vscode/Strikfin%20(ATT)/backend/app/main.py)

Important startup steps:

1. Run migrations in development
2. Seed instruments
3. Hydrate the instrument snapshot from the DB
4. Hydrate the Fyers token store from `broker_connections`
5. Start background ingestion jobs
6. Start the websocket publisher

The Fyers token hydration step is what makes restarts recover the active token without depending on `.env`.

## Provider Behavior

### Fyers Provider

File:

- [backend/app/ingestion/providers/fyers_provider.py](/C:/Users/sriha/Documents/vscode/Strikfin%20(ATT)/backend/app/ingestion/providers/fyers_provider.py)

Responsibilities:

- Build the live Fyers client
- Fetch spot, futures, option chain, and history
- Cache results briefly to avoid burst rate limits
- Recover usable live values when quotes are throttled
- Fall back to mock data when live Fyers access fails

#### Client construction

The provider reads the raw access token from `token_store` and passes it directly to `FyersModel`.

Important constraint:

- Do not pass `appId:token`
- Pass the raw access token only

#### Cache and fallback model

The provider uses:

- short TTL caching
- last-good result caching
- `fyers_cached` source tagging for stale-but-live fallback values
- mock fallback only when no live value is available

This exists to keep the dashboard usable under rate limiting and transient API failures.

#### Spot / futures behavior

The provider deliberately uses one batched `quotes()` call for:

- spot
- India VIX
- current-month futures

This reduces dashboard fan-out and avoids duplicate rate-limit pressure.

If `quotes()` fails:

- it attempts to recover spot and futures from the option-chain endpoint
- if that still fails, it returns the last live value if available
- if no live value exists, it falls back to mock

#### Option chain behavior

The provider:

- fetches the Fyers option chain
- normalizes expiry dates
- computes forward price using parity where possible
- derives IV and Greeks
- calculates call OI / put OI / PCR
- returns a dict shape compatible with the existing consumers

#### History behavior

Historical candles are fetched from Fyers and cached for longer than intraday data, because the data is far less volatile.

## Database Model

### BrokerConnection

File:

- [backend/app/db/models.py](/C:/Users/sriha/Documents/vscode/Strikfin%20(ATT)/backend/app/db/models.py)

Migration:

- [backend/alembic/versions/20260705_0938-a2aa386db8ed_broker_connections_table.py](/C:/Users/sriha/Documents/vscode/Strikfin%20(ATT)/backend/alembic/versions/20260705_0938-a2aa386db8ed_broker_connections_table.py)

Schema highlights:

- `id` UUID primary key
- `user_id` nullable FK to `users.user_id`
- `broker` string key such as `fyers`
- `access_token_enc` encrypted token
- `refresh_token_enc` encrypted refresh token
- `meta` JSONB metadata
- `status` active/revoked state
- timestamps for generated, created, and updated times

The table is indexed by `(user_id, broker)`.

## Frontend Integration

### API Endpoints

File:

- [frontend/src/api/endpoints.ts](/C:/Users/sriha/Documents/vscode/Strikfin%20(ATT)/frontend/src/api/endpoints.ts)

Frontend Fyers API functions:

- `getFyersLogin()`
- `getFyersStatus()`
- `clearFyersToken()`

These functions map directly to the backend auth routes.

### Hook

File:

- [frontend/src/lib/useFyersConnect.ts](/C:/Users/sriha/Documents/vscode/Strikfin%20(ATT)/frontend/src/lib/useFyersConnect.ts)

Behavior:

- opens a popup synchronously on user click
- fetches the login URL
- redirects the popup to Fyers
- polls `/auth/fyers/status`
- times out after three minutes
- updates local state for connected / token-expired / not-connected states
- clears the token and refreshes status on disconnect

### Settings Panel

File:

- [frontend/src/components/settings/panels/BrokerConnectPanel.tsx](/C:/Users/sriha/Documents/vscode/Strikfin%20(ATT)/frontend/src/components/settings/panels/BrokerConnectPanel.tsx)

Behavior:

- renders the Fyers row as the live broker connection
- renders non-Fyers brokers as display-only stubs
- shows the current connection state and the relevant action button

## Required Invariants

These are the important implementation invariants that must not be broken:

- Tokens must never be stored in plaintext in durable storage
- The OAuth callback must not fail just because durable persistence fails
- Startup hydration must keep restoring the Fyers token into the hot store
- The provider must continue returning usable dicts when live Fyers calls fail
- Spot/futures batching must stay in place to control rate-limit pressure
- The adapter layer must remain synchronous at the interface boundary
- The frontend popup + polling flow must remain intact

## Reverse-Engineered Implementation Prompt

Use this prompt when asking Codex GPT-5 to work on the integration:

```text
You are working in an existing FastAPI + React codebase. Do not rewrite the app. Do not change unrelated files. Your job is to reverse engineer and implement the Fyers broker integration as a coherent feature slice, preserving the current behavior and architecture.

Scope: Fyers only, plus the shared broker plumbing it depends on.

What already exists and must be preserved

Backend:
- OAuth entrypoints:
  - GET /api/v1/auth/fyers/login
  - GET /api/v1/auth/fyers/callback
  - GET /api/v1/auth/fyers/status
  - DELETE /api/v1/auth/fyers/token
  - POST /api/v1/auth/fyers/token
  - GET /api/v1/auth/fyers/debug/chain/{instrument_id}
- Token storage:
  - in-memory sync token store for hot path
  - legacy .env write fallback
  - encrypted durable storage in broker_connections using Fernet
- Startup wiring:
  - app startup hydrates instrument snapshot
  - app startup hydrates the Fyers token from broker_connections into the in-memory token store
- Market data:
  - Fyers provider is the live implementation for spot, futures, option chain, history
  - it uses a TTL cache and last-good fallback
  - it collapses multiple dashboard reads into one batched quotes() call
  - when quotes() is rate-limited, it recovers spot/futures from the option chain if possible
  - it falls back to mock data when live Fyers access fails
- Broker abstraction:
  - BrokerAdapter interface exists and should stay synchronous
  - FyersAdapter currently delegates to app.ingestion.providers.fyers_provider
  - registry resolves the active adapter from settings.MARKET_DATA_VENDOR
  - MarketDataService runs adapter calls in a threadpool and should remain thin

Frontend:
- Settings > Broker Connect uses Fyers OAuth popup + polling flow
- Fyers connection state is read from /auth/fyers/status
- Connect starts with /auth/fyers/login
- Disconnect calls DELETE /auth/fyers/token
- The Fyers row shows connected / token expired / not connected states
- Non-Fyers brokers are display-only stubs for now

Core implementation facts you must preserve

1. OAuth flow
- login endpoint builds Fyers SessionModel with:
  - client_id = FYERS_APP_ID
  - secret_key = FYERS_SECRET_ID
  - redirect_uri = FYERS_REDIRECT_URI
  - response_type = "code"
  - grant_type = "authorization_code"
- callback exchanges auth_code for access_token
- on success:
  - set token in memory immediately
  - persist encrypted token to broker_connections as a best-effort durable write
  - do not fail the OAuth flow if DB persistence fails
- status endpoint:
  - reports has_token from the hot token store
  - performs a live Fyers profile check to decide connected=true/false
- manual token set:
  - accepts { "access_token": "..." }
  - updates memory and durable encrypted store
- delete token:
  - clears the in-memory token
  - preserve current behavior unless the app already has a DB revoke path wired in

2. Token durability
- broker_connections stores encrypted access_token_enc and refresh_token_enc
- encryption uses Fernet
- if BROKER_TOKEN_ENC_KEY is empty, derive a stable key from SECRET_KEY
- broker_connections.user_id is nullable because the OAuth callback is currently unauthenticated
- status values include ACTIVE / REVOKED
- startup hydration loads the Fyers token from DB into token_store, and falls back to .env token already present

3. Fyers provider behavior
- client creation must use the raw access token from token_store
- do not pass appId:token into FyersModel
- provider is sync and wrapped through run_in_threadpool by the async service
- preserve current cache TTLs and fallback behavior:
  - spot TTL around 35s
  - option chain TTL around 95s
  - history TTL around 1h
- preserve the single batched quotes() refresh for spot, VIX, and futures
- preserve last-good cache logic and "fyers_cached" fallback source tagging
- preserve option-chain derived IV/greeks behavior
- preserve mock fallback for any live failure
- preserve the instrument snapshot-based symbol resolution
- preserve futures symbol construction via expiry rules and vendor symbol templates

4. Broker abstraction
- keep BrokerAdapter methods synchronous
- keep return shapes compatible with the existing provider dicts
- FyersAdapter should remain a thin wrapper around fyers_provider unless you are explicitly asked to refactor the provider itself
- registry should continue to map MARKET_DATA_VENDOR -> adapter
- MarketDataService should remain a thin async facade over adapters

5. Frontend flow
- the broker connect popup should:
  - open a blank popup synchronously on click
  - fetch login_url
  - navigate popup to Fyers login
  - poll /auth/fyers/status until connected or timeout
- disconnect should refresh status after clearing token
- preserve current user-facing status strings and button states as much as possible

Implementation prompt for Codex GPT-5

- Read the existing backend and frontend files first.
- Reverse engineer the Fyers integration as a complete flow from UI click to backend OAuth to durable token storage to live market-data consumption.
- Do not invent a new architecture.
- Keep the current contract shapes and endpoint names.
- Preserve fallback behavior and rate-limit protections.
- If you need to add or change code, keep the edits tightly scoped to the Fyers broker integration and its direct plumbing only.
- Add or update tests only where they validate the Fyers flow or prevent regressions in the token/storage/adapter path.
- Ensure no plaintext tokens are persisted.
- Ensure startup hydration still works.
- Ensure the Fyers provider still produces usable market-data dicts even when live calls fail.
```

## Acceptance Criteria

- A user can start the Fyers OAuth flow from the frontend.
- The backend returns a login URL and handles the callback.
- The access token is stored in memory immediately and durably in encrypted `broker_connections`.
- Restarting the backend restores the token from durable storage.
- Live market-data calls continue through the adapter/service layer.
- Spot, futures, and option-chain behavior remains rate-limit hardened and fallback-safe.
- Disconnect clears the hot token and reports the broker as disconnected in the UI.
- No unrelated app behavior changes.

