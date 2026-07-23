# StrikeFluency Agent Notes

This file captures durable project context for future Codex/agent work. It was created from `CLAUDE.md`, the README files, and direct inspection of backend/frontend source on 2026-07-07.

## Project Summary

StrikeFluency is a virtual options trading simulator for Indian retail traders. The core product is a NIFTY/BANKNIFTY/SENSEX option-chain trading desk with discipline rules enforced before each virtual order.

- Backend: FastAPI, SQLAlchemy, Alembic, PostgreSQL, Python 3.11+
- Frontend: React 18, Vite, Zustand, React Router v6, Axios, Recharts
- Default market data provider: mock
- Backend dev port: 8000
- Frontend dev port: 5173, with Vite allowed through 5176 in backend CORS
- Database stack: `docker-compose.yml` starts PostgreSQL 16 on 5432 and pgAdmin on 5050

## Running Locally

Backend:

```powershell
cd backend
.venv\Scripts\activate
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
npm run build
```

Tests:

```powershell
cd backend
pip install -r requirements-dev.txt
pytest
```

Do not commit any `.env` file, `fyers_token.json`, `access_token.txt`, or `fyers_logs/`.

## Backend Architecture

Main entry point: `backend/app/main.py`

- FastAPI app uses lifespan startup/shutdown.
- Startup calls `start_market_scheduler()`.
- Shutdown calls `stop_market_scheduler()`.
- CORS allows localhost 5173-5176 and 3000.
- Routers are included under `/api/v1`.
- OAuth router exists but is currently commented out in `main.py`.
- Health check is at `/health`.

Registered routers:

- `/api/v1/auth`
- `/api/v1/market`
- `/api/v1/trading`
- `/api/v1/discipline`
- `/api/v1/journal`
- `/api/v1/analytics`

Settings are in `backend/app/config.py` using `pydantic-settings` and `.env`.

Important current settings:

- `MARKET_DATA_PROVIDER`: `mock`, `fyers`, or `truedata` in comments, but provider factory currently handles `fyers` and falls back to mock otherwise.
- `NIFTY_LOT_SIZE` defaults to 50 in settings, but canonical lot sizes in constants are NIFTY 65, BANKNIFTY 30, SENSEX 20.
- `GOOGLE_REDIRECT_URI` defaults to `http://localhost:8000/api/v1/oauth/google/callback`; OAuth is mounted under `/api/v1/oauth`.

## Backend Domain Rules

Constants live in `backend/app/core/constants.py`.

Lot sizes:

- NIFTY: 65
- BANKNIFTY: 30
- SENSEX: 20

Market times are represented as hour/minute constants:

- Open: 09:15 IST
- Close: 15:30 IST
- EOD square-off: 15:29 IST

Capital tiers:

- `TIER_1`: 100000
- `TIER_2`: 500000
- `TIER_3`: 1000000
- Unlock streak: 15 consecutive disciplined trades

Implemented discipline rule codes:

- `MAX_TRADES_PER_DAY`
- `MANDATORY_SL`
- `NO_AVERAGING_DOWN`
- `NO_DIRECTION_FLIP`
- `REVENGE_COOLDOWN`
- `MAX_DAILY_LOSS`
- `MANDATORY_SETUP_TAG`

Note: older docs/`CLAUDE.md` mention `MARKET_HOURS` as one of the 7 iron rules. Current source does not implement `MARKET_HOURS` as a discipline rule. Market-hour blocking is handled in `virtual_order_service.place_order()` and is bypassed in development.

## Trading Flow

Order schema: `backend/app/schemas/virtual_order.py`

`PlaceOrderRequest` expects:

- `instrument`: NIFTY, BANKNIFTY, or SENSEX
- `expiry_date`
- `strike_price`
- `option_type`: CE or PE
- `action`: BUY or SELL
- `quantity`: number of lots, not raw contract quantity
- `sl_price`
- optional `target_price`
- `setup_tag`: OI_BASED, PRICE_ACTION, LEVEL_TRADE, EXPIRY_PLAY, OTHER

Order service: `backend/app/services/virtual_order_service.py`

Placement flow:

1. Block outside market hours only when not in development.
2. Load virtual account, today session, and open positions.
3. Fetch option-chain LTP from current market provider.
4. Run `DisciplineEngine.check_order()`.
5. Apply slippage.
6. Calculate margin as gross value / 5.
7. Validate balance.
8. Calculate entry brokerage.
9. Create `VirtualOrder` and `VirtualPosition`.
10. Deduct margin and increment session trade count.

Close flow:

1. Fetch order and position.
2. Get current/exit LTP from market provider.
3. Apply exit slippage.
4. Calculate gross P&L and exit brokerage.
5. Update order status, exit price/time, P&L, brokerage, and exit reason.
6. Close position.
7. Release margin and apply net P&L to account balance.
8. Update session realized P&L.
9. Activate cooldown only for `SL_HIT`.
10. Update discipline score.
11. Auto-create journal entry.

## Market Data

Provider factory: `backend/app/market/provider_factory.py`

- Singleton provider instance.
- `MARKET_DATA_PROVIDER=fyers` attempts Fyers if app ID and access token are present.
- Missing or invalid Fyers credentials fall back to mock.
- Other provider names currently fall back to mock.

Scheduler: `backend/app/market/market_scheduler.py`

- APScheduler AsyncIOScheduler, timezone `Asia/Kolkata`.
- Broadcasts every 3 seconds.
- Instruments: NIFTY, BANKNIFTY, SENSEX.
- Skips outside market hours unless in development.
- Does nothing when no WebSocket clients are connected.

REST market routes:

- `GET /api/v1/market/option-chain`
- `GET /api/v1/market/spot`
- `GET /api/v1/market/status`
- `GET /api/v1/market/debug/raw-fyers` is marked temporary in source.

WebSocket:

- Current backend endpoint: `ws://localhost:8000/api/v1/market/ws`
- No auth on WebSocket in Phase 1.
- Scheduler broadcasts messages shaped like `{ type, instrument, data }`.

## Frontend Architecture

Entry/routing: `frontend/src/App.jsx`

Routes currently wired:

- `/login`
- `/register`
- `/`
- `/dashboard`
- `/trading`
- `/discipline`
- `/journal`
- `/analytics`
- `/settings`

All non-auth routes are wrapped in `ProtectedRoute` and `AppLayout`.

No `/auth/callback` route is currently wired, despite older docs mentioning it.

Layout:

- `AppLayout` has fixed 220px sidebar and sticky 52px top bar.
- `AppLayout` polls `/market/status` every 30 seconds and stores `isMarketOpen`.
- `TopBar` only displays status/clock; it does not open a WebSocket.

State stores:

- `authStore`: localStorage-backed `sf_access_token` and `sf_user`.
- `marketStore`: option chain, spot price, ATM strike, market status, last update.
- `tradingStore`: account, positions, orders, session.

API client:

- `frontend/src/api/client.js` uses the Vite `/api` proxy by default.
- It does not currently read `VITE_API_BASE_URL`.
- It does not currently perform refresh-token retry.
- On any 401, it removes local access token/user and redirects to `/login`.
- Auth API has `logout(refreshToken)`, but refresh tokens are not stored by `authStore` in current code.

## Frontend Trading Desk

Page: `frontend/src/pages/trading/TradingDeskPage.jsx`

- Instrument tabs: NIFTY, BANKNIFTY, SENSEX.
- Loads account and positions on mount.
- Loads option chain on instrument change.
- Uses page-local `positions`, not the Zustand `positions` from `tradingStore`.
- `OrderFormPanel` submits directly through `placeOrder()`.
- Position closing calls `closeOrder()` directly.

Order form:

- Uses lot count as backend `quantity`.
- Sends `ltp` and `notes`, but current backend schema ignores/rejects extra fields depending Pydantic config. The backend fetches LTP from provider, not from request.
- Requires strike, LTP, SL, and setup tag in UI.

Option-chain display currently expects frontend rows shaped like:

- `row.call.ltp`
- `row.call.open_interest`
- `row.put.ltp`
- `row.put.open_interest`

Current mock backend emits rows shaped like:

- `row.ce.ltp`
- `row.ce.oi`
- `row.pe.ltp`
- `row.pe.oi`

This is a current integration mismatch. Also, `GET /market/option-chain` returns `{ success: true, data }`, but `TradingDeskPage` currently stores `r.data` directly instead of `r.data.data`. Future work should normalize either API response handling or provider output before debugging table rendering.

## Design System

Current frontend is a light, dense trading-workstation style.

CSS variables are in `frontend/src/styles/index.css`.

Core palette:

- Background: `#f1f5f9`
- Panels: `#ffffff`
- Sidebar: `#f8fafc`
- Primary blue: `#3b82f6`
- Text: `#1e293b`
- Subtext: `#64748b`
- Muted: `#94a3b8`
- Gain: `#16a34a`
- Loss: `#dc2626`

Fonts:

- Inter for UI
- JetBrains Mono for numeric cells via `.num`

Existing conventions:

- Sidebar fixed at 220px.
- TopBar height 52px.
- Inline styles are common in page/components.
- Existing card components often use 8-12px radii.
- Keep trading UI dense and scannable, not marketing-style.

## Known Gotchas And Drift

- `CLAUDE.md` has mojibake characters in several places, but the underlying meaning is still readable.
- Backend uses `/api/v1` prefixes; older docs sometimes omit that prefix.
- WebSocket is `/api/v1/market/ws`, not `/ws/market`.
- OAuth backend router is commented out and frontend callback route is absent.
- Frontend API base URL is hardcoded and does not use `.env` today.
- Refresh-token retry is not implemented in frontend today.
- Implemented seventh discipline rule is `MANDATORY_SETUP_TAG`, not `MARKET_HOURS`.
- Mock option-chain shape does not match `OptionChainTable` expectations.
- Market REST response wrapper does not match `TradingDeskPage` direct store assignment.
- `Config.NIFTY_LOT_SIZE` default is 50 but constants and frontend use 65.
- `MockMarketDataProvider._nearest_expiry()` uses `date.replace(day=today.day + days_until_thursday)`, which can fail near month boundaries.
- `market.py` has a temporary `/debug/raw-fyers` endpoint that should not ship as production API.

## Development Priorities For Next Work

When continuing implementation, prioritize these integration fixes before adding new features:

1. Normalize option-chain response shape between backend providers and frontend table.
2. Fix frontend REST handling for `/market/option-chain` wrapper.
3. Decide whether API client should read `VITE_API_BASE_URL` and implement refresh-token storage/retry.
4. Decide whether OAuth should be mounted and add frontend callback route, or remove stale OAuth references.
5. Align docs with implemented discipline rules and `/api/v1` route prefixes.
6. Fix mock nearest-expiry date logic for month/year boundaries.

## Safety Rules

- Never commit secrets or local tokens.
- Do not start duplicate market WebSockets from TopBar/AppLayout.
- Do not revert user changes in the repo unless explicitly asked.
- Prefer existing architecture: routers thin, business logic in services, frontend API functions per domain, Zustand for shared state.
- For frontend changes, preserve the current compact trading-app visual style.
