# StrikeFluency — Backend

FastAPI backend for the StrikeFluency virtual options trading simulator.

- **Port:** 8000
- **Docs:** `http://localhost:8000/docs` (Swagger UI)
- **Database:** PostgreSQL 16
- **Python:** 3.11+

---

## Setup

```bash
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
# Fill in DATABASE_URL and SECRET_KEY at minimum
```

---

## Environment variables

All variables are documented in `.env.example`. Minimum required to run:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/strikefluency
SECRET_KEY=change-this-to-a-random-32-char-string
```

Set `MARKET_DATA_PROVIDER=mock` (default) to run without a Fyers account.

---

## Database setup

Start PostgreSQL via Docker (from repo root):

```bash
docker-compose up -d
```

Then create the database and run all migrations:

```bash
# Create the database (first time only)
psql -U postgres -c "CREATE DATABASE strikefluency;"

# Run all migrations
alembic upgrade head
```

### Migration commands

| Command | Effect |
|---|---|
| `alembic upgrade head` | Apply all pending migrations |
| `alembic downgrade -1` | Roll back one migration |
| `alembic revision --autogenerate -m "description"` | Generate migration from model changes |
| `alembic history` | Show migration history |
| `alembic current` | Show current database revision |

### Migration files

| File | Description |
|---|---|
| `0001_initial_schema.py` | All Phase 1 tables (users, accounts, orders, positions, discipline, journal) |
| `0002_add_refresh_tokens.py` | Refresh token table for JWT rotation |

---

## Running the server

```bash
uvicorn app.main:app --reload --port 8000
```

CORS is configured to allow `http://localhost:5173` through `http://localhost:5176` (Vite dev server range).

---

## Architecture

```
app/
├── main.py              # App factory, router registration, lifespan events
├── config.py            # pydantic-settings reads .env
├── database.py          # SQLAlchemy engine, SessionLocal, get_db()
├── dependencies.py      # get_current_user(), get_current_tenant() FastAPI deps
├── models/              # SQLAlchemy ORM — one file per table
├── schemas/             # Pydantic request validation + response shapes
├── routers/             # Thin HTTP handlers — call services, return schemas
├── services/            # All business logic
├── market/              # Market data abstraction layer
└── core/                # JWT, bcrypt, middleware, exceptions, constants
```

### Key services

| Service | Responsibility |
|---|---|
| `auth_service.py` | User registration, password authentication |
| `token_service.py` | JWT access token creation, refresh token rotation, revocation |
| `oauth_service.py` | Google OAuth code exchange, get-or-create user |
| `virtual_order_service.py` | Place order (discipline check → slippage → fill), close order, EOD square-off |
| `discipline_engine.py` | `check_order()` runs all 7 rules before any order fills |
| `slippage_engine.py` | `calculate_slippage(ltp, strike, atm)` — ATM gets tighter spread than OTM |
| `brokerage_calculator.py` | `calculate_brokerage(ltp, qty, lot_size)` — STT, exchange charges, GST |
| `journal_service.py` | Auto-creates journal entry on trade close; handles user note updates |
| `trading_session_service.py` | Tracks daily trade count, cooldown activation, session reset at EOD |
| `analytics_service.py` | Aggregate P&L, discipline trend, mistake breakdown queries |

### Market data layer

```
app/market/
├── base.py              # MarketDataProvider ABC
├── mock_provider.py     # Realistic fake NIFTY option chain — no external dependency
├── fyers_provider.py    # Real Fyers v3 WebSocket (set MARKET_DATA_PROVIDER=fyers)
├── websocket_manager.py # Broadcasts option chain to all connected browser clients
└── market_scheduler.py  # APScheduler: push every 3 s, square-off at 15:29 IST
```

---

## API routes

### Auth (`/auth`)

| Method | Path | Auth required | Description |
|---|---|---|---|
| POST | `/auth/register` | No | Create account with email + password |
| POST | `/auth/login` | No | Returns an access token and sets an httpOnly refresh cookie |
| POST | `/auth/refresh` | No | Rotate refresh token, get new access token |
| POST | `/auth/logout` | No | Revoke the current refresh-token family |
| GET | `/auth/me` | Bearer | Current user profile |
| GET | `/auth/sessions` | Bearer | List active device sessions |
| DELETE | `/auth/sessions/{family_id}` | Bearer | Revoke one device session |
| POST | `/auth/logout-all` | Bearer | Revoke every session and access-token version |

### Google OAuth (`/oauth`)

| Method | Path | Description |
|---|---|---|
| GET | `/oauth/google` | Returns Google authorization URL |
| GET | `/oauth/google/callback` | Exchanges code, creates/logs in user, redirects to frontend with token |

### Trading (`/trading`)

| Method | Path | Description |
|---|---|---|
| GET | `/trading/account` | Virtual balance, total P&L, equity |
| POST | `/trading/orders` | Place order (discipline check runs here) |
| GET | `/trading/orders` | Paginated order history |
| POST | `/trading/orders/{id}/close` | Close open position at current LTP |
| GET | `/trading/positions` | Currently open positions with unrealized P&L |
| GET | `/trading/sessions/today` | Today's trade count, cooldown status, session P&L |

#### Place order request body

```json
{
  "instrument": "NIFTY",
  "expiry": "2025-01-30",
  "strike": 23500,
  "option_type": "CE",
  "action": "BUY",
  "lots": 1,
  "stop_loss": 45.00,
  "setup_tag": "OI_REVERSAL"
}
```

### Market (`/market`)

| Method | Path | Description |
|---|---|---|
| GET | `/market/option-chain` | Full option chain snapshot |
| GET | `/market/status` | `{ is_open, spot_price, atm_strike, expiry }` |
| WS | `/ws/market` | WebSocket — pushes updated chain every 3 s |

### Discipline (`/discipline`)

| Method | Path | Description |
|---|---|---|
| GET | `/discipline/rules` | All 7 rules with current configured values |
| PATCH | `/discipline/rules/{code}` | Update a rule value |
| GET | `/discipline/score` | Current score (0-100) + streak count |
| GET | `/discipline/violations` | Paginated violation history |

### Journal (`/journal`)

| Method | Path | Description |
|---|---|---|
| GET | `/journal` | Paginated — supports `?instrument=`, `?result=WIN/LOSS`, date filters |
| GET | `/journal/{id}` | Single entry with full trade data |
| PATCH | `/journal/{id}` | Update emotion tag, mistake category, pre/post notes |

### Analytics (`/analytics`)

| Method | Path | Description |
|---|---|---|
| GET | `/analytics/summary` | Total trades, win rate, avg P&L, total P&L |
| GET | `/analytics/pnl-curve` | `[{ date, pnl, cumulative }]` daily series |
| GET | `/analytics/discipline-trend` | Discipline score per day for last 30 days |
| GET | `/analytics/mistakes` | `[{ category, count, pct }]` breakdown |

---

## Discipline rules reference

| Code | Rule | Default |
|---|---|---|
| `MAX_TRADES` | Maximum trades per day | 3 |
| `MANDATORY_SL` | Stop-loss required on every order | enabled |
| `NO_AVERAGING` | No adding to a losing position | enabled |
| `NO_DIRECTION_FLIP` | Cannot switch CE to PE while in a trade | enabled |
| `REVENGE_COOLDOWN` | Cooldown minutes after a loss | 15 min |
| `MAX_DAILY_LOSS` | Maximum daily loss as % of capital | 2% |
| `MARKET_HOURS` | No orders outside 09:15-15:30 IST | enabled |

---

## Lot sizes and constants

Defined in `app/core/constants.py`:

```python
LOT_SIZES = { "NIFTY": 65, "BANKNIFTY": 30, "SENSEX": 20 }
MARKET_OPEN    = time(9, 15)
MARKET_CLOSE   = time(15, 30)
EOD_SQUAREOFF  = time(15, 29)
```

---

## Connecting Fyers (live data)

1. Create an app at `myapi.fyers.in` and note the App ID and Secret
2. Add to `.env`:
   ```env
   MARKET_DATA_PROVIDER=fyers
   FYERS_APP_ID=your-app-id
   FYERS_SECRET_ID=your-secret
   ```
3. Run the token script (opens a browser for login):
   ```bash
   python generate_fyers_token.py
   ```
   This writes `fyers_token.json` and `access_token.txt` — both are gitignored.
4. Restart the backend.

---

## Running tests

```bash
pip install -r requirements-dev.txt
pytest

# With coverage report:
pytest --cov=app --cov-report=html
```

### Test layout

```
tests/
├── conftest.py                     # Test DB, client fixture, seed data
├── unit/
│   ├── test_security.py            # JWT create/verify, bcrypt
│   ├── test_discipline_engine.py   # All 7 rules in isolation
│   ├── test_slippage_engine.py     # ATM vs OTM bands
│   ├── test_brokerage_calculator.py
│   └── test_utils.py               # is_market_open(), get_ist_now() edge cases
└── integration/
    ├── test_auth.py                # Register -> login -> refresh -> logout
    ├── test_oauth.py               # Google callback mock
    ├── test_order_placement.py     # Place -> discipline check -> fill -> close -> journal
    └── test_journal.py             # Auto-create on close, user update, filters
```

---

## Code quality

```bash
# Lint
ruff check app/

# Format
black app/
```

Dev dependencies (`requirements-dev.txt`): `pytest`, `httpx`, `factory-boy`, `ruff`, `black`.
