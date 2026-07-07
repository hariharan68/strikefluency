# StrikeFluency — Software Requirements Specification (SRS)
**Version:** 1.0  
**Author:** Hari  
**Scope:** Phase 1 MVP — Live Virtual Trading + Discipline Engine + Auto-Journal  
**Status:** Approved for Development

---

## Table of Contents
1. [Introduction](#1-introduction)
2. [System Overview](#2-system-overview)
3. [User Roles & Personas](#3-user-roles--personas)
4. [Functional Requirements](#4-functional-requirements)
5. [Non-Functional Requirements](#5-non-functional-requirements)
6. [Database Schema](#6-database-schema)
7. [API Contract Summary](#7-api-contract-summary)
8. [Business Rules & Constraints](#8-business-rules--constraints)
9. [Out of Scope — Phase 1](#9-out-of-scope--phase-1)
10. [Glossary](#10-glossary)

---

## 1. Introduction

### 1.1 Purpose
This document defines the complete software requirements for StrikeFluency Phase 1 MVP. It is the single source of truth for backend engineers, frontend engineers, and QA. All implementation decisions must trace back to a requirement in this document.

### 1.2 Product Summary
StrikeFluency is a multi-tenant SaaS platform that allows Indian retail options traders to practice trading NIFTY weekly options in a fully virtual environment, with enforced discipline rules, automatic trade journaling, and a progression system that gates access to larger virtual capital.

### 1.3 Phase 1 Deliverable
A working web application where a user can:
- Register, log in, and get a virtual trading account (₹1,00,000 starting capital)
- View a live (mocked in Phase 1, real Kite data in Phase 2) NIFTY option chain
- Place virtual CE/PE buy/sell orders with realistic slippage and brokerage
- Be blocked or warned when they violate any of the 7 discipline rules
- See their discipline score, violation history, and consecutive disciplined trade streak
- View an auto-populated journal of all closed trades
- Manually add emotion tags, mistake categories, and notes to journal entries

### 1.4 Definitions
| Term | Meaning |
|---|---|
| Tenant | An organisation or individual admin account under which multiple traders operate |
| Virtual Account | A user's isolated P&L ledger with virtual (not real) rupees |
| Discipline Score | A 0–100 rolling metric based on rule adherence over the last 20 trades |
| Lot | NIFTY: 1 lot = 50 units. BANKNIFTY: 1 lot = 15 units (Phase 2+) |
| SL | Stop Loss — mandatory price at which a position auto-closes |
| Consecutive Disciplined Trades | Unbroken streak of trades where zero discipline rules were violated |
| Market Hours | 09:15 IST to 15:30 IST, Monday–Friday, on NSE trading days |

---

## 2. System Overview

### 2.1 High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        React Frontend                            │
│   (Trading Desk │ Journal │ Discipline Dashboard │ Analytics)    │
└─────────────────────────┬────────────────────────────────────────┘
                          │ REST API + WebSocket
┌─────────────────────────▼────────────────────────────────────────┐
│                      FastAPI Backend                             │
│                                                                  │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────────-──┐ │
│  │ Auth Router │  │ Trading      │  │ Discipline Engine        │ │
│  │             │  │ Router       │  │ (Rule Evaluator)         │ │
│  └─────────────┘  └──────────────┘  └────────────────────────-─┘ │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────=─┐ │
│  │ Journal     │  │ Market Data  │  │ Analytics Router         │ │
│  │ Router      │  │ Router       │  │                          │ │
│  └─────────────┘  └──────────────┘  └────────────────────────=─┘ │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │               Service Layer (Business Logic)                │ │
│  │  VirtualOrderService │ DisciplineEngine │ JournalService    │ │
│  │  SlippageEngine      │ BrokerageCalc    │ AnalyticsService  │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────┬────────────────────────────────────────┘
                          │ SQLAlchemy ORM
┌─────────────────────────▼────────────────────────────────────────┐
│                      PostgreSQL Database                         │
│    (Multi-tenant schema — tenant_id on ALL tables)               │
└──────────────────────────────────────────────────────────────────┘

                          ┌────────────────────-─┐
                          │   Market Data Layer  │
                          │   Phase 1: Mock      │
                          │   Phase 2: Kite WS   │
                          └───────────────────-──┘
```

### 2.2 Multi-Tenancy Model
Every database table that stores user data carries a `tenant_id` column. All queries at the service layer are scoped by `tenant_id`. A user cannot see or interact with any data outside their tenant. Tenant context is extracted from the authenticated JWT on every request.

---

## 3. User Roles & Personas

| Role | Description | Permissions |
|---|---|---|
| `super_admin` | Anthropic/Platform operator | Create tenants, platform-wide config |
| `tenant_admin` | The person who signs up a team | Manage users in their tenant, configure discipline rules |
| `trader` | The end user | Trade, view journal, view own analytics |

**Phase 1 active roles:** `tenant_admin` + `trader` only. `super_admin` is scaffolded but not surfaced in UI.

---

## 4. Functional Requirements

### FR-001 — User Registration & Authentication

**FR-001.1** A new user can register with: full name, email, password, and an optional tenant_code (for joining an existing tenant). If no tenant_code, a new tenant is created for them automatically and they become the `tenant_admin`.

**FR-001.2** Passwords must be minimum 8 characters, bcrypt-hashed before storage. Plaintext passwords are never stored or logged.

**FR-001.3** Login returns a JWT access token (expires: 24h) and a refresh token (expires: 7d). Both are returned in the response body (not cookies, for SPA compatibility).

**FR-001.4** All protected routes require a valid `Authorization: Bearer <token>` header.

**FR-001.5** On registration, the system automatically creates a `VirtualAccount` for the user with `initial_balance = ₹1,00,000` and creates default `DisciplineRules` records for all 7 rules.

**FR-001.6** On registration, the system automatically creates a `TradingSession` for today's date for the user.

---

### FR-002 — Virtual Account Management

**FR-002.1** Each user has exactly one virtual account (per tenant). The account stores their current `balance`, `tier`, `discipline_score`, and `consecutive_disciplined_trades`.

**FR-002.2** Account `balance` is the available capital. When an order is placed, the margin required is reserved (deducted from balance). When a position is closed, the margin is released and P&L is applied.

**FR-002.3** Account balance can never go below ₹0. Any order that would result in insufficient balance is rejected with error code `INSUFFICIENT_BALANCE`.

**FR-002.4** Capital tiers:
| Tier | Virtual Capital | Unlock Condition |
|---|---|---|
| TIER_1 | ₹1,00,000 | Default on registration |
| TIER_2 | ₹5,00,000 | 15 consecutive disciplined trades from TIER_1 |
| TIER_3 | ₹10,00,000 | 15 consecutive disciplined trades from TIER_2 |

**FR-002.5** Margin calculation for Phase 1: SPAN + Exposure margin approximation. For simplicity in Phase 1, use a flat **5× leverage** model: `margin_required = (LTP × lot_size × quantity) / 5`. Exact SPAN calculation is Phase 3.

---

### FR-003 — Market Data

**FR-003.1** The system exposes live NIFTY option chain data. In Phase 1, this is served from a mock data generator that simulates realistic price movement. The mock is designed so that switching to Kite API in Phase 2 requires only changing the data source, not the consumer code.

**FR-003.2** The mock option chain provides: Strike Price, CE LTP, CE OI, CE Volume, CE IV, PE LTP, PE OI, PE Volume, PE IV, for 10 strikes above and below ATM.

**FR-003.3** Market data is pushed via WebSocket to connected clients. The backend maintains a broadcast channel. Data refreshes every 3 seconds during simulated market hours.

**FR-003.4** The system must expose a `GET /market/option-chain` REST endpoint returning a point-in-time snapshot (for initial page load before WebSocket connects).

**FR-003.5** Market hours gate: `POST /trading/orders` returns `MARKET_CLOSED` error outside 09:15–15:30 IST on weekdays. The mock data generator simulates price movement only during market hours.

**FR-003.6** The system exposes NIFTY spot price, ATM strike, and current PCR in the market data feed.

---

### FR-004 — Virtual Order Placement & Execution

**FR-004.1** A trader can submit an order with: instrument (`NIFTY`), expiry_date, strike_price, option_type (`CE`/`PE`), action (`BUY`/`SELL`), quantity (in lots), sl_price (mandatory), target_price (optional), setup_tag (mandatory).

**FR-004.2** Before any order is accepted, it passes through the **Discipline Engine** (see FR-005). If any rule is violated, the order is rejected with a structured error describing which rule was violated.

**FR-004.3** Slippage simulation:
- For liquid strikes (within 5 strikes of ATM): slippage = 0.5–1.5% of LTP (random in range)
- For illiquid strikes (> 5 strikes from ATM): slippage = 2–4% of LTP
- Slippage direction: always against the trader (increases buy price, decreases sell price)

**FR-004.4** Brokerage calculation (per order):
- Flat brokerage: ₹20 per order
- STT (on sell only): 0.05% of (LTP × lot_size × quantity)  
- Exchange charges: 0.053% of turnover  
- SEBI charges: ₹10 per crore  
- GST: 18% on (brokerage + exchange charges)
- Total brokerage is stored on the order and deducted from P&L.

**FR-004.5** An order in status `OPEN` creates a corresponding `VirtualPosition` record. The position tracks current unrealized P&L against the live LTP.

**FR-004.6** A position is closed when:
- User submits a `SELL` order against the position (manual exit)
- LTP hits `sl_price` (SL hit — auto-close, triggered by market data feed)
- LTP hits `target_price` (auto-close, triggered by market data feed)
- Market closes at 15:30 (all open positions auto-squared off at 15:29 LTP)

**FR-004.7** On position close: calculate final P&L, subtract brokerage, update `VirtualAccount.balance`, create `JournalEntry`, update `DisciplineScore`, update `TradingSession`.

**FR-004.8** A `BUY` order for a strike where the user already has an open `BUY` position is treated as averaging down — blocked by the Discipline Engine (Rule 3).

---

### FR-005 — Discipline Engine

The Discipline Engine is the core differentiator. It runs synchronously before every order is accepted. All 7 rules are enforced as hard blocks (not warnings) in Phase 1.

**FR-005.1 Rule 1 — MAX_TRADES_PER_DAY**
- Default value: 3 trades per day
- Check: `TradingSession.trades_count >= rule_value.max_trades`
- Error code: `DISCIPLINE_MAX_TRADES_EXCEEDED`

**FR-005.2 Rule 2 — MANDATORY_SL**
- Every order must include `sl_price`
- `sl_price` must be valid: for BUY orders, `sl_price < entry_price`; for SELL orders, `sl_price > entry_price`
- Error code: `DISCIPLINE_SL_REQUIRED`

**FR-005.3 Rule 3 — NO_AVERAGING_DOWN**
- If user has an open LONG position on NIFTY 19500 CE, they cannot place another BUY on NIFTY 19500 CE
- Check: any open position with same (instrument, strike, option_type, action=BUY) exists
- Error code: `DISCIPLINE_NO_AVERAGING`

**FR-005.4 Rule 4 — NO_DIRECTION_FLIP**
- If user has an open LONG CE position, they cannot open a LONG PE position simultaneously (net direction flip)
- Logic: if any open BUY CE position exists, reject new BUY PE (and vice versa)
- Error code: `DISCIPLINE_NO_DIRECTION_FLIP`

**FR-005.5 Rule 5 — REVENGE_TRADING_COOLDOWN**
- After any SL is hit, user enters a cooldown period (default: 15 minutes)
- During cooldown, no new orders accepted
- Check: `TradingSession.is_cooldown_active == True AND TradingSession.cooldown_until > now()`
- Error code: `DISCIPLINE_REVENGE_COOLDOWN` (includes `cooldown_until` timestamp in error body)

**FR-005.6 Rule 6 — MAX_DAILY_LOSS**
- Default: 2% of virtual account balance (₹2,000 on a ₹1L account)
- Check: `TradingSession.realized_pnl <= -(initial_balance × 0.02)`
- Error code: `DISCIPLINE_MAX_LOSS_EXCEEDED`

**FR-005.7 Rule 7 — MANDATORY_SETUP_TAG**
- Every order must include a `setup_tag` from the allowed enum: `OI_BASED`, `PRICE_ACTION`, `LEVEL_TRADE`, `EXPIRY_PLAY`, `OTHER`
- Error code: `DISCIPLINE_SETUP_TAG_REQUIRED`

**FR-005.8 Discipline Score Calculation**
- Score is recalculated after every trade close
- Formula: `score = (compliant_trades / total_trades_in_window) × 100` over last 20 trades
- On a 0–100 scale. A perfect 20 trades = 100. Any violation reduces score proportionally.
- Stored daily in `DisciplineScores` table for trend analysis.

**FR-005.9 Consecutive Disciplined Trades**
- A "disciplined trade" = closed with zero rule violations attempted (including attempts that were blocked)
- Counter increments on each disciplined close, resets to 0 on any violation
- At 15: system notifies user they are eligible for tier upgrade
- Counter stored on `VirtualAccount.consecutive_disciplined_trades`

**FR-005.10 Violation Logging**
- Every attempted violation (blocked or not) is logged to `DisciplineViolations` table
- Logged fields: user_id, rule_code, what was attempted (order details), timestamp, was_blocked

---

### FR-006 — Auto-Journal

**FR-006.1** A `JournalEntry` record is automatically created on every trade close. No user action required for this.

**FR-006.2** Auto-populated fields on creation:
- `order_id`, `user_id`, `tenant_id`
- `entry_price`, `exit_price`, `pnl`, `brokerage`
- `setup_tag` (from the order)
- `is_discipline_compliant` (true/false)
- `violations_attempted` (list of rule codes violated, if any)
- `entry_time`, `exit_time`, `duration_minutes`
- `exit_reason`: `MANUAL`, `SL_HIT`, `TARGET_HIT`, `EOD_SQUAREOFF`
- `created_at`

**FR-006.3** User-editable fields (via `PUT /journal/{entry_id}`):
- `emotion_tag`: `CONFIDENT`, `FEARFUL`, `GREEDY`, `CALM`, `IMPATIENT`, `FOMO`
- `mistake_category`: `EARLY_EXIT`, `SL_TOO_TIGHT`, `IGNORED_LEVEL`, `FOMO_ENTRY`, `OVERSIZE`, `NONE`
- `pre_trade_thesis` (text, what the user thought before entering)
- `post_trade_review` (text, what they learned)

**FR-006.4** Journal entries are paginated and filterable by: date range, setup_tag, is_discipline_compliant, emotion_tag, exit_reason.

**FR-006.5** The journal list endpoint returns summary stats alongside entries: period win rate, period avg P&L, most common setup_tag, most common mistake_category.

---

### FR-007 — Analytics (Phase 1 Scope)

**FR-007.1** `GET /analytics/summary` returns:
- Total trades (all time, this week, this month)
- Win rate (%, all time and this month)
- Average P&L per trade
- Total net P&L
- Best trade (highest P&L)
- Worst trade (lowest P&L)
- Most used setup_tag
- Most violated discipline rule

**FR-007.2** `GET /analytics/discipline-trend` returns discipline score per day for the last 30 days (for chart rendering on frontend).

**FR-007.3** `GET /analytics/pnl-curve` returns cumulative P&L per trade (chronological), suitable for drawing an equity curve chart.

**FR-007.4** `GET /analytics/mistakes` returns breakdown of mistake_category frequency for the last 30/all-time trades.

---

## 5. Non-Functional Requirements

### NFR-001 — Multi-Tenancy
Every table that stores business data MUST have a `tenant_id (UUID, NOT NULL)` column. The service layer ALWAYS applies `WHERE tenant_id = :current_tenant_id` to every query. A query without tenant_id scope is a critical security bug.

### NFR-002 — Performance
- REST API response time: < 200ms for all endpoints (p95) under normal load
- WebSocket market data update: broadcast within 3 seconds of data generation
- Database: all foreign key columns indexed. `(tenant_id, user_id)` composite index on high-read tables.

### NFR-003 — Security
- Passwords: bcrypt with cost factor 12
- JWT: RS256 or HS256 with a secret loaded from environment variable (never hardcoded)
- Access token TTL: 24 hours. Refresh token TTL: 7 days.
- All inputs validated at the Pydantic schema layer before reaching service layer
- SQL injection: prevented by SQLAlchemy ORM parameterized queries (never raw string SQL)
- Rate limiting: `POST /auth/login` — max 5 attempts per minute per IP (Phase 1: basic implementation)

### NFR-004 — Data Integrity
- Virtual account balance: enforced non-negative at the database level via CHECK constraint and at the service layer via explicit validation
- Order status transitions: only valid state machines allowed (OPEN → CLOSED, OPEN → CANCELLED, OPEN → SL_HIT, OPEN → TARGET_HIT). Invalid transitions rejected.
- Brokerage and P&L: Decimal precision 2dp, stored as NUMERIC(12,2) in PostgreSQL. Never use FLOAT for financial values.

### NFR-005 — Environment Configuration
All configuration via environment variables. No hardcoded values in code. `.env.example` committed to repo with all required variable names (no values). Actual `.env` never committed.

Required environment variables:
```
DATABASE_URL=postgresql://user:password@localhost:5432/strikefluency
SECRET_KEY=<jwt_secret>
ACCESS_TOKEN_EXPIRE_MINUTES=1440
REFRESH_TOKEN_EXPIRE_DAYS=7
ENVIRONMENT=development
MOCK_MARKET_DATA=true
NIFTY_LOT_SIZE=50
DEFAULT_MAX_TRADES_PER_DAY=3
DEFAULT_COOLDOWN_MINUTES=15
DEFAULT_MAX_DAILY_LOSS_PCT=2.0
DEFAULT_INITIAL_CAPITAL=100000
```

### NFR-006 — Market Hours
The application is aware of NSE market hours: 09:15–15:30 IST, Monday–Friday. This is enforced in the order placement service. The system uses IST (Asia/Kolkata) timezone throughout. UTC timestamps stored in DB, converted to IST in API responses.

---

## 6. Database Schema

### 6.1 ERD (Text representation)

```
tenants ──< users ──< virtual_accounts
              │
              ├──< virtual_orders ──< virtual_positions
              │         │
              │         └──< journal_entries
              │
              ├──< discipline_rules
              ├──< discipline_violations
              ├──< discipline_scores
              └──< trading_sessions
```

### 6.2 Table Definitions

#### `tenants`
```sql
CREATE TABLE tenants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL,
    tenant_code     VARCHAR(20) UNIQUE NOT NULL,  -- used for invite
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### `users`
```sql
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    email           VARCHAR(255) NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    full_name       VARCHAR(100) NOT NULL,
    role            VARCHAR(20) NOT NULL DEFAULT 'trader',  -- trader | tenant_admin | super_admin
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, email)   -- email unique per tenant, not globally
);
CREATE INDEX idx_users_tenant_id ON users(tenant_id);
```

#### `virtual_accounts`
```sql
CREATE TABLE virtual_accounts (
    id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                         UUID NOT NULL REFERENCES users(id),
    tenant_id                       UUID NOT NULL REFERENCES tenants(id),
    balance                         NUMERIC(12,2) NOT NULL DEFAULT 100000.00,
    initial_balance                 NUMERIC(12,2) NOT NULL DEFAULT 100000.00,
    tier                            VARCHAR(10) NOT NULL DEFAULT 'TIER_1',
    consecutive_disciplined_trades  INT NOT NULL DEFAULT 0,
    discipline_score                NUMERIC(5,2) NOT NULL DEFAULT 100.00,
    created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT balance_non_negative CHECK (balance >= 0),
    CONSTRAINT valid_tier CHECK (tier IN ('TIER_1', 'TIER_2', 'TIER_3')),
    UNIQUE(user_id)  -- one virtual account per user
);
CREATE INDEX idx_virtual_accounts_tenant_id ON virtual_accounts(tenant_id);
```

#### `virtual_orders`
```sql
CREATE TABLE virtual_orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    account_id      UUID NOT NULL REFERENCES virtual_accounts(id),
    instrument      VARCHAR(20) NOT NULL DEFAULT 'NIFTY',
    expiry_date     DATE NOT NULL,
    strike_price    NUMERIC(10,2) NOT NULL,
    option_type     VARCHAR(2) NOT NULL,   -- CE | PE
    action          VARCHAR(4) NOT NULL,   -- BUY | SELL
    quantity        INT NOT NULL,          -- number of lots
    lot_size        INT NOT NULL DEFAULT 50,
    entry_ltp       NUMERIC(10,2) NOT NULL,  -- LTP at order time (pre-slippage)
    entry_price     NUMERIC(10,2) NOT NULL,  -- actual fill price (post-slippage)
    exit_price      NUMERIC(10,2),
    sl_price        NUMERIC(10,2) NOT NULL,
    target_price    NUMERIC(10,2),
    status          VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    entry_time      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    exit_time       TIMESTAMPTZ,
    pnl             NUMERIC(10,2),
    brokerage       NUMERIC(10,2) NOT NULL DEFAULT 0,
    slippage_points NUMERIC(10,2) NOT NULL DEFAULT 0,
    setup_tag       VARCHAR(30) NOT NULL,
    exit_reason     VARCHAR(20),           -- MANUAL | SL_HIT | TARGET_HIT | EOD_SQUAREOFF
    is_discipline_compliant  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT valid_option_type CHECK (option_type IN ('CE', 'PE')),
    CONSTRAINT valid_action CHECK (action IN ('BUY', 'SELL')),
    CONSTRAINT valid_status CHECK (status IN ('OPEN','CLOSED','CANCELLED','SL_HIT','TARGET_HIT')),
    CONSTRAINT valid_quantity CHECK (quantity > 0)
);
CREATE INDEX idx_virtual_orders_user_id ON virtual_orders(user_id);
CREATE INDEX idx_virtual_orders_tenant_id ON virtual_orders(tenant_id);
CREATE INDEX idx_virtual_orders_status ON virtual_orders(status);
CREATE INDEX idx_virtual_orders_user_status ON virtual_orders(user_id, status);
```

#### `virtual_positions`
```sql
CREATE TABLE virtual_positions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID NOT NULL REFERENCES virtual_orders(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    account_id      UUID NOT NULL REFERENCES virtual_accounts(id),
    instrument      VARCHAR(20) NOT NULL,
    expiry_date     DATE NOT NULL,
    strike_price    NUMERIC(10,2) NOT NULL,
    option_type     VARCHAR(2) NOT NULL,
    quantity        INT NOT NULL,
    avg_entry_price NUMERIC(10,2) NOT NULL,
    current_ltp     NUMERIC(10,2) NOT NULL,
    unrealized_pnl  NUMERIC(10,2) NOT NULL DEFAULT 0,
    margin_blocked  NUMERIC(10,2) NOT NULL,
    is_open         BOOLEAN NOT NULL DEFAULT TRUE,
    opened_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at       TIMESTAMPTZ,
    UNIQUE(order_id)
);
CREATE INDEX idx_virtual_positions_user_open ON virtual_positions(user_id, is_open);
CREATE INDEX idx_virtual_positions_tenant_id ON virtual_positions(tenant_id);
```

#### `discipline_rules`
```sql
CREATE TABLE discipline_rules (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id),
    tenant_id   UUID NOT NULL REFERENCES tenants(id),
    rule_code   VARCHAR(50) NOT NULL,
    rule_value  JSONB NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, rule_code)
);
-- rule_code values and their JSONB structure:
-- MAX_TRADES_PER_DAY    → {"max_trades": 3}
-- MANDATORY_SL          → {"enabled": true}
-- NO_AVERAGING_DOWN     → {"enabled": true}
-- NO_DIRECTION_FLIP     → {"enabled": true}
-- REVENGE_COOLDOWN      → {"cooldown_minutes": 15}
-- MAX_DAILY_LOSS        → {"loss_pct": 2.0}
-- MANDATORY_SETUP_TAG   → {"enabled": true}
```

#### `discipline_violations`
```sql
CREATE TABLE discipline_violations (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(id),
    tenant_id        UUID NOT NULL REFERENCES tenants(id),
    rule_code        VARCHAR(50) NOT NULL,
    attempted_action JSONB NOT NULL,   -- snapshot of the attempted order
    was_blocked      BOOLEAN NOT NULL DEFAULT TRUE,
    session_date     DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_violations_user_date ON discipline_violations(user_id, session_date);
```

#### `discipline_scores`
```sql
CREATE TABLE discipline_scores (
    id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                         UUID NOT NULL REFERENCES users(id),
    tenant_id                       UUID NOT NULL REFERENCES tenants(id),
    score_date                      DATE NOT NULL,
    score                           NUMERIC(5,2) NOT NULL,
    trades_analyzed                 INT NOT NULL DEFAULT 0,
    violations_count                INT NOT NULL DEFAULT 0,
    consecutive_disciplined_streak  INT NOT NULL DEFAULT 0,
    created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, score_date)
);
```

#### `trading_sessions`
```sql
CREATE TABLE trading_sessions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    session_date        DATE NOT NULL DEFAULT CURRENT_DATE,
    trades_count        INT NOT NULL DEFAULT 0,
    realized_pnl        NUMERIC(10,2) NOT NULL DEFAULT 0,
    is_cooldown_active  BOOLEAN NOT NULL DEFAULT FALSE,
    cooldown_until      TIMESTAMPTZ,
    last_sl_hit_at      TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, session_date)
);
```

#### `journal_entries`
```sql
CREATE TABLE journal_entries (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id                UUID NOT NULL REFERENCES virtual_orders(id),
    user_id                 UUID NOT NULL REFERENCES users(id),
    tenant_id               UUID NOT NULL REFERENCES tenants(id),
    -- Auto-populated fields
    entry_price             NUMERIC(10,2) NOT NULL,
    exit_price              NUMERIC(10,2),
    pnl                     NUMERIC(10,2),
    brokerage               NUMERIC(10,2),
    setup_tag               VARCHAR(30),
    exit_reason             VARCHAR(20),
    is_discipline_compliant BOOLEAN NOT NULL DEFAULT TRUE,
    violations_attempted    TEXT[],               -- array of rule_code strings
    duration_minutes        INT,
    trade_date              DATE NOT NULL DEFAULT CURRENT_DATE,
    -- User-editable fields
    emotion_tag             VARCHAR(20),
    mistake_category        VARCHAR(30),
    pre_trade_thesis        TEXT,
    post_trade_review       TEXT,
    is_reviewed             BOOLEAN NOT NULL DEFAULT FALSE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(order_id)   -- one journal entry per order
);
CREATE INDEX idx_journal_user_date ON journal_entries(user_id, trade_date);
CREATE INDEX idx_journal_tenant ON journal_entries(tenant_id);
```

---

## 7. API Contract Summary

> Full API documentation will be auto-generated via FastAPI's `/docs` (Swagger UI) and `/redoc`. This section provides the contract summary for design alignment.

### Auth Endpoints
| Method | Path | Description | Auth Required |
|---|---|---|---|
| POST | `/auth/register` | Register new user + create tenant | No |
| POST | `/auth/login` | Login, get JWT | No |
| POST | `/auth/refresh` | Refresh access token | No (refresh token in body) |
| GET | `/auth/me` | Get current user profile | Yes |
| POST | `/auth/logout` | Invalidate refresh token | Yes |

### Virtual Trading Endpoints
| Method | Path | Description | Auth Required |
|---|---|---|---|
| GET | `/trading/account` | Get virtual account summary | Yes |
| POST | `/trading/orders` | Place a new order (runs discipline check) | Yes |
| GET | `/trading/orders` | List all orders (paginated, filterable) | Yes |
| GET | `/trading/orders/{id}` | Get single order detail | Yes |
| POST | `/trading/orders/{id}/close` | Manually close an open position | Yes |
| GET | `/trading/positions` | Get all open positions | Yes |
| GET | `/trading/positions/{id}` | Get single position detail | Yes |
| GET | `/trading/sessions/today` | Get today's trading session | Yes |

### Market Data Endpoints
| Method | Path | Description | Auth Required |
|---|---|---|---|
| GET | `/market/option-chain` | Current NIFTY option chain snapshot | Yes |
| GET | `/market/status` | Market open/closed + current time | Yes |
| WS | `/ws/market` | WebSocket stream for live option chain | Yes (token in query param) |

### Discipline Endpoints
| Method | Path | Description | Auth Required |
|---|---|---|---|
| GET | `/discipline/rules` | Get user's active discipline rules | Yes |
| PUT | `/discipline/rules/{rule_code}` | Update a rule value | Yes |
| GET | `/discipline/score` | Current discipline score + streak | Yes |
| GET | `/discipline/violations` | Violation history (paginated) | Yes |
| GET | `/discipline/violations/today` | Today's violations | Yes |

### Journal Endpoints
| Method | Path | Description | Auth Required |
|---|---|---|---|
| GET | `/journal` | List journal entries (paginated, filterable) | Yes |
| GET | `/journal/{entry_id}` | Single journal entry detail | Yes |
| PUT | `/journal/{entry_id}` | Update emotion tag, notes, review | Yes |

### Analytics Endpoints
| Method | Path | Description | Auth Required |
|---|---|---|---|
| GET | `/analytics/summary` | Overall trading stats summary | Yes |
| GET | `/analytics/discipline-trend` | Discipline score per day (30d) | Yes |
| GET | `/analytics/pnl-curve` | Cumulative P&L per trade | Yes |
| GET | `/analytics/mistakes` | Mistake category breakdown | Yes |

---

## 8. Business Rules & Constraints

| Rule | Value | Configurable? |
|---|---|---|
| NIFTY lot size | 50 | No (hardcoded per exchange) |
| Default starting capital | ₹1,00,000 | Yes (per tenant) |
| Max trades per day | 3 | Yes (per user) |
| Revenge cooldown | 15 minutes | Yes (per user) |
| Max daily loss cap | 2% of account balance | Yes (per user) |
| Discipline score window | Last 20 trades | No |
| Tier unlock streak | 15 consecutive disciplined trades | No |
| Slippage (ATM±5) | 0.5–1.5% of LTP | No |
| Slippage (far OTM) | 2–4% of LTP | No |
| Brokerage per order | ₹20 flat | No |
| Market hours (IST) | 09:15 – 15:30 | No |
| Access token TTL | 24 hours | No |
| Refresh token TTL | 7 days | No |

---

## 9. Out of Scope — Phase 1

The following items are explicitly deferred and must NOT be built in Phase 1:

- Historical data ingestion or replay mode (Phase 2)
- BANKNIFTY or SENSEX instruments (Phase 2)
- Strategy Builder (Phase 3)
- Gamification / XP / Skill Tree / Badges (Phase 4)
- AI-powered post-trade feedback (Phase 5)
- Community leaderboard, mentor review (Phase 6)
- Kite live API integration (Phase 2 — mock only in Phase 1)
- Multi-leg order types: straddle, strangle, Iron Condor (Phase 2+)
- SPAN margin calculation (Phase 3)
- Email notifications
- Mobile app

---

## 10. Glossary

| Term | Definition |
|---|---|
| ATM | At The Money — the strike price closest to the current spot price |
| LTP | Last Traded Price |
| OI | Open Interest — number of open contracts at a strike |
| PCR | Put-Call Ratio — total PE OI / total CE OI |
| CE | Call option |
| PE | Put option |
| SL | Stop Loss |
| P&L | Profit and Loss |
| IST | Indian Standard Time (UTC+5:30) |
| SEBI | Securities and Exchange Board of India |
| NSE | National Stock Exchange of India |
| Lot | The minimum tradeable unit; NIFTY = 50 units per lot |

---

*End of SRS v1.0 — Phase 1 MVP*  
*Next document: Directory Map + Project Scaffold*  
*Next after that: FastAPI route stubs with full Pydantic schemas*