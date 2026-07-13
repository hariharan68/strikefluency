# StrikeFluency

> *Become fluent in the strike zone — before you trade with real money.*

A virtual options trading simulator for Indian retail traders (NIFTY / BANKNIFTY / SENSEX). It combines realistic order execution with a discipline enforcement layer so traders build good habits before risking real capital.

---

## What it does

- **Virtual trading** — place CE/PE orders against live or mock option chain prices with realistic slippage and brokerage
- **Discipline engine** — 7 configurable rules (max trades/day, mandatory stop-loss, no averaging down, no revenge trading, daily loss cap, etc.) enforced on every order before it fills
- **Discipline score** — rolling metric based on rule adherence; 15 consecutive disciplined trades unlocks the next virtual capital tier
- **Auto trade journal** — every closed trade is logged automatically; traders add emotion tags, mistake categories, and notes
- **Analytics** — P&L curve, win rate, discipline trend, mistake breakdown charts
- **WebSocket market data** — real-time option chain with OI bars, LTP flash animations, PCR; mock mode on by default

---

## Tech stack

| Layer | Tech |
|---|---|
| Backend | FastAPI, Python 3.11+, SQLAlchemy 2.x, Alembic, PostgreSQL 16 |
| Auth | JWT (access + refresh tokens), Google OAuth 2.0 |
| Market data | Mock provider (Phase 1) / Fyers API v3 (Phase 2) |
| Scheduling | APScheduler — pushes market data every 3 s, EOD square-off at 15:29 IST |
| Frontend | React 18, Vite, Tailwind CSS, Zustand, Recharts, React Router v6, Axios |
| Fonts | Inter (UI) + JetBrains Mono (prices / numbers) |

---

## Project structure

```
strikefluency/
├── backend/               # FastAPI app
│   ├── app/
│   │   ├── main.py        # App factory, CORS, lifespan
│   │   ├── models/        # SQLAlchemy ORM models
│   │   ├── schemas/       # Pydantic request/response schemas
│   │   ├── routers/       # HTTP route handlers
│   │   ├── services/      # Business logic (discipline, trading, journal)
│   │   ├── market/        # Market data abstraction (mock + Fyers providers)
│   │   ├── core/          # JWT, bcrypt, middleware, constants, exceptions
│   │   └── migrations/    # Alembic migration history
│   ├── tests/             # pytest unit + integration tests
│   ├── .env.example       # Required variables (no secrets)
│   ├── requirements.txt
│   └── requirements-dev.txt
├── frontend/              # React + Vite SPA
│   ├── src/
│   │   ├── pages/         # Dashboard, Trading Desk, Journal, Analytics, Discipline, Settings
│   │   ├── components/    # Layout (Sidebar, TopBar), trading, discipline, journal, common UI
│   │   ├── store/         # Zustand stores (auth, market, trading)
│   │   ├── api/           # Axios functions per domain
│   │   ├── hooks/         # useAuth, useMarketWebSocket, useVirtualTrading, etc.
│   │   └── styles/        # Tailwind + CSS custom properties (light design system)
│   └── .env.example       # VITE_API_BASE_URL
├── Docs/                  # SRS, design layout, directory map
├── docker-compose.yml     # PostgreSQL 16 + pgAdmin
└── .gitignore
```

---

## Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL 16 (or use Docker)
- Git

---

## Quick start

### 1. Clone

```bash
git clone <repo-url>
cd strikefluency
```

### 2. Start PostgreSQL

```bash
docker-compose up -d
```

This starts PostgreSQL on port 5432 and pgAdmin on port 5050.

### 3. Backend setup

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt

cp .env.example .env
# Edit .env and fill in DATABASE_URL and SECRET_KEY at minimum
```

Run migrations and start the server:

```bash
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

API is available at `http://localhost:8000`. Swagger docs at `http://localhost:8000/docs`.

### 4. Frontend setup

```bash
cd frontend
npm install

cp .env.example .env
# .env.example already has: VITE_API_BASE_URL=http://localhost:8000
```

Start the dev server:

```bash
npm run dev
```

App is available at `http://localhost:5173`.

---

## Environment variables

Copy `backend/.env.example` to `backend/.env` and fill in the values below. **Never commit `.env`.**

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | `postgresql://user:pass@localhost:5432/strikefluency` |
| `SECRET_KEY` | Yes | Random string, min 32 chars |
| `ALGORITHM` | No | Default: `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | Default: `1440` (24 h) |
| `REFRESH_TOKEN_EXPIRE_DAYS` | No | Default: `7` |
| `ENVIRONMENT` | No | `development` or `production` |
| `MARKET_DATA_PROVIDER` | No | `mock` (default) or `fyers` |
| `NIFTY_LOT_SIZE` | No | Default: `65` |
| `DEFAULT_MAX_TRADES_PER_DAY` | No | Default: `3` |
| `DEFAULT_COOLDOWN_MINUTES` | No | Default: `15` |
| `DEFAULT_MAX_DAILY_LOSS_PCT` | No | Default: `2.0` |
| `DEFAULT_INITIAL_CAPITAL` | No | Default: `100000` (₹1L) |
| `GOOGLE_CLIENT_ID` | OAuth only | Google Cloud Console client ID |
| `GOOGLE_CLIENT_SECRET` | OAuth only | Google Cloud Console client secret |
| `GOOGLE_REDIRECT_URI` | OAuth only | `http://localhost:8000/api/v1/oauth/google/callback` |

---

## Lot sizes

| Instrument | Lot size |
|---|---|
| NIFTY | 65 |
| BANKNIFTY | 30 |
| SENSEX | 20 |

---

## Discipline rules (defaults)

1. Maximum trades per day (default: 3)
2. Mandatory stop-loss on every order
3. No averaging down on a losing position
4. No direction flip mid-trade (CE to PE or vice versa)
5. Revenge trading cooldown after a loss (default: 15 min)
6. Maximum daily loss cap (default: 2% of capital)
7. No trading outside market hours (09:15-15:30 IST)

All rules are configurable per user from the Discipline page.

---

## Virtual capital tiers

| Tier | Capital | Unlock condition |
|---|---|---|
| Starter | Rs 1,00,000 | Default |
| Intermediate | Rs 5,00,000 | 15 consecutive disciplined trades |
| Advanced | Rs 10,00,000 | 15 consecutive disciplined trades at previous tier |

---

## API overview

| Method | Path | Description |
|---|---|---|
| POST | `/auth/register` | Create account |
| POST | `/auth/login` | Login, returns access + refresh tokens |
| POST | `/auth/refresh` | Rotate refresh token |
| POST | `/auth/logout` | Revoke refresh token |
| GET | `/auth/me` | Current user profile |
| GET | `/oauth/google` | Start Google OAuth flow |
| GET | `/oauth/google/callback` | OAuth callback |
| GET | `/trading/account` | Virtual account balance + P&L |
| POST | `/trading/orders` | Place a virtual order |
| GET | `/trading/orders` | Order history |
| POST | `/trading/orders/{id}/close` | Close an open position |
| GET | `/trading/positions` | Open positions |
| GET | `/trading/sessions/today` | Today's session stats |
| GET | `/market/option-chain` | Option chain snapshot |
| GET | `/market/status` | Market open/closed + spot price |
| WS | `/ws/market` | Live option chain WebSocket |
| GET | `/discipline/rules` | User's configured rules |
| PATCH | `/discipline/rules/{code}` | Update a rule value |
| GET | `/discipline/score` | Current discipline score |
| GET | `/discipline/violations` | Violation history |
| GET | `/journal` | Paginated trade journal |
| GET | `/journal/{id}` | Single journal entry |
| PATCH | `/journal/{id}` | Update emotion/mistake/notes |
| GET | `/analytics/summary` | Aggregate stats |
| GET | `/analytics/pnl-curve` | Daily P&L series |
| GET | `/analytics/discipline-trend` | Score per day (30d) |
| GET | `/analytics/mistakes` | Mistake category breakdown |

Full interactive docs at `http://localhost:8000/docs` when the backend is running.

---

## Using live market data (Fyers)

By default the app runs in mock mode. To connect real option chain data:

1. Create a Fyers app at `myapi.fyers.in`
2. Set `MARKET_DATA_PROVIDER=fyers` in `backend/.env`
3. Add `FYERS_APP_ID` and `FYERS_SECRET_ID` to `backend/.env`
4. Run the token generation script:
   ```bash
   cd backend
   python generate_fyers_token.py
   ```
   This writes `fyers_token.json` and `access_token.txt` (both gitignored).
5. Restart the backend.

---

## Running tests

```bash
cd backend
pip install -r requirements-dev.txt
pytest
```

---

## Security notes

- `.env` files are gitignored at root, backend, and frontend level
- `fyers_token.json`, `access_token.txt`, and `fyers_logs/` are gitignored
- `.env.example` files contain placeholder values only — safe to commit
- JWTs are short-lived (24 h); refresh tokens are stored hashed in the database and rotated on each use
- All protected routes require `Authorization: Bearer <token>`

---

## License

Private project.
