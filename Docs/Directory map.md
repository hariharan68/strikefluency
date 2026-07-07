# StrikeFluency — Complete Directory Map (Final)
# Phase 1 MVP · FastAPI + PostgreSQL + React + Vite
# Includes: JWT Auth + OAuth 2.0 (Google)
# Legend: ← AUTH = added for auth system

strikefluency/
│
├── backend/
│   │
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                          # FastAPI app, router registration, CORS, lifespan events
│   │   ├── config.py                        # pydantic-settings: reads all .env variables
│   │   ├── database.py                      # SQLAlchemy engine, SessionLocal, Base, get_db()
│   │   ├── dependencies.py                  # get_current_user(), get_current_tenant() — used in every  protected route
│   │   │
│   │   ├── models/                          # SQLAlchemy ORM — one file per table
│   │   │   ├── __init__.py                  # re-exports all models so Alembic can discover them
│   │   │   ├── tenant.py                    # Tenant
│   │   │   ├── user.py                      # User
│   │   │   ├── refresh_token.py             # RefreshToken ← AUTH
│   │   │   ├── virtual_account.py           # VirtualAccount
│   │   │   ├── virtual_order.py             # VirtualOrder
│   │   │   ├── virtual_position.py          # VirtualPosition
│   │   │   ├── discipline_rule.py           # DisciplineRule
│   │   │   ├── discipline_violation.py      # DisciplineViolation
│   │   │   ├── discipline_score.py          # DisciplineScore
│   │   │   ├── trading_session.py           # TradingSession
│   │   │   └── journal_entry.py             # JournalEntry
│   │   │
│   │   ├── schemas/                         # Pydantic — request validation + response shapes
│   │   │   ├── __init__.py
│   │   │   ├── common.py                    # PaginatedResponse, ErrorResponse, SuccessResponse
│   │   │   ├── auth.py                      # RegisterRequest, LoginRequest, UserProfile
│   │   │   ├── token.py                     # TokenResponse, RefreshTokenRequest, TokenData ← AUTH
│   │   │   ├── virtual_account.py           # VirtualAccountResponse, AccountSummary
│   │   │   ├── virtual_order.py             # PlaceOrderRequest, OrderResponse, CloseOrderRequest
│   │   │   ├── virtual_position.py          # PositionResponse
│   │   │   ├── discipline.py                # DisciplineRuleResponse, UpdateRuleRequest, ScoreResponse, ViolationResponse
│   │   │   ├── journal.py                   # JournalEntryResponse, UpdateJournalRequest, JournalListResponse
│   │   │   ├── market.py                    # OptionChainResponse, StrikeData, MarketStatusResponse
│   │   │   └── analytics.py                 # SummaryResponse, DisciplineTrendPoint, PnLCurvePoint
│   │   │
│   │   ├── routers/                         # FastAPI route handlers — thin layer, calls services
│   │   │   ├── __init__.py
│   │   │   ├── auth.py                      # POST /auth/register, /login, /refresh, /logout · GET /auth/me
│   │   │   ├── oauth.py                     # GET /oauth/google, /oauth/google/callback ← AUTH
│   │   │   ├── trading.py                   # /trading/account, /orders, /positions, /sessions/today
│   │   │   ├── market.py                    # GET /market/option-chain, /market/status · WS /ws/market
│   │   │   ├── discipline.py                # /discipline/rules, /score, /violations
│   │   │   ├── journal.py                   # /journal, /journal/{id}
│   │   │   └── analytics.py                 # /analytics/summary, /discipline-trend, /pnl-curve, /mistakes
│   │   │
│   │   ├── services/                        # Business logic — all heavy lifting lives here
│   │   │   ├── __init__.py
│   │   │   ├── auth_service.py              # register_user(), authenticate_user()
│   │   │   ├── token_service.py             # create_refresh_token(), verify_refresh_token(), revoke_token() ← AUTH
│   │   │   ├── oauth_service.py             # exchange_google_code(), get_or_create_oauth_user() ← AUTH
│   │   │   ├── virtual_order_service.py     # place_order(), close_order(), auto_close_positions()
│   │   │   ├── discipline_engine.py         # DisciplineEngine — check_order() runs all 7 rules before any order fills
│   │   │   ├── slippage_engine.py           # calculate_slippage(ltp, strike, atm) → slippage points
│   │   │   ├── brokerage_calculator.py      # calculate_brokerage(ltp, qty, lot_size) → BrokerageBreakdown
│   │   │   ├── journal_service.py           # create_journal_entry() auto on close · update_journal_entry() user edit
│   │   │   ├── trading_session_service.py   # get_or_create_session(), increment_trade(), activate_cooldown()
│   │   │   └── analytics_service.py         # get_summary(), get_discipline_trend(), get_pnl_curve()
│   │   │
│   │   ├── market/                          # Market data abstraction layer
│   │   │   ├── __init__.py
│   │   │   ├── base.py                      # MarketDataProvider ABC — interface both providers implement
│   │   │   ├── mock_provider.py             # MockMarketDataProvider — realistic fake NIFTY data (Phase 1)
│   │   │   ├── kite_provider.py             # KiteMarketDataProvider — real Kite WebSocket (Phase 2)
│   │   │   ├── websocket_manager.py         # ConnectionManager — broadcast option chain to all connected clients
│   │   │   └── market_scheduler.py          # APScheduler job: push market data every 3s, EOD square-off at 15:29
│   │   │
│   │   ├── core/                            # Cross-cutting infrastructure
│   │   │   ├── __init__.py
│   │   │   ├── security.py                  # create_access_token(), verify_token(), hash_password(), verify_password() ← AUTH
│   │   │   ├── oauth2_schemes.py            # OAuth2PasswordBearer instance — used as FastAPI dependency ← AUTH
│   │   │   ├── oauth_config.py              # GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, REDIRECT_URI from .env ← AUTH
│   │   │   ├── exceptions.py                # DisciplineViolationError, InsufficientBalanceError, MarketClosedError, etc.
│   │   │   ├── error_handlers.py            # Maps custom exceptions → structured HTTP error responses
│   │   │   ├── middleware.py                # TenantContextMiddleware, RequestLoggingMiddleware
│   │   │   ├── constants.py                 # NIFTY_LOT_SIZE, MARKET_OPEN/CLOSE, TIER_THRESHOLDS, DisciplineRuleCodes, SetupTags
│   │   │   └── utils.py                    # get_ist_now(), is_market_open(), calculate_pnl()
│   │   │
│   │   └── migrations/                      # Alembic — database version control
│   │       ├── env.py
│   │       ├── script.py.mako
│   │       └── versions/
│   │           ├── 0001_initial_schema.py   # Creates all Phase 1 tables
│   │           └── 0002_add_refresh_tokens.py  # Adds refresh_tokens table ← AUTH
│   │
│   ├── tests/
│   │   ├── __init__.py
│   │   ├── conftest.py                      # pytest fixtures: test DB, test client, seed users/tenants
│   │   │
│   │   ├── unit/
│   │   │   ├── test_security.py             # JWT create/verify, bcrypt hash/verify ← AUTH
│   │   │   ├── test_discipline_engine.py    # All 7 discipline rules in isolation
│   │   │   ├── test_slippage_engine.py      # ATM vs OTM slippage bands
│   │   │   ├── test_brokerage_calculator.py # Fee calculation correctness
│   │   │   └── test_utils.py               # is_market_open(), get_ist_now() edge cases
│   │   │
│   │   └── integration/
│   │       ├── test_auth.py                 # Register → login → refresh → logout full flow ← AUTH
│   │       ├── test_oauth.py                # Google OAuth callback mock test ← AUTH
│   │       ├── test_order_placement.py      # Place → discipline check → fill → close → journal
│   │       └── test_journal.py             # Auto-create on close, user update, filter/pagination
│   │
│   ├── alembic.ini
│   ├── requirements.txt                     # Production dependencies
│   ├── requirements-dev.txt                 # pytest, httpx, factory-boy, ruff, black
│   ├── .env.example                         # All required variable names, no values committed
│   ├── .gitignore
│   └── README.md
│
├── frontend/
│   │
│   ├── public/
│   │   └── favicon.svg
│   │
│   ├── src/
│   │   ├── main.jsx                         # React root, createRoot, BrowserRouter
│   │   ├── App.jsx                          # Route definitions, ProtectedRoute wrapping
│   │   │
│   │   ├── pages/
│   │   │   ├── auth/
│   │   │   │   ├── LoginPage.jsx            # Email/password form + Google login button
│   │   │   │   ├── RegisterPage.jsx         # Registration form
│   │   │   │   └── OAuthCallbackPage.jsx    # Handles /auth/callback — extracts JWT from URL ← AUTH
│   │   │   ├── dashboard/
│   │   │   │   └── DashboardPage.jsx        # Account balance, discipline score, quick stats
│   │   │   ├── trading/
│   │   │   │   └── TradingDeskPage.jsx      # Option chain + order form + open positions
│   │   │   ├── journal/
│   │   │   │   ├── JournalPage.jsx          # Trade log list with filters
│   │   │   │   └── JournalEntryPage.jsx     # Single entry detail + user notes form
│   │   │   ├── discipline/
│   │   │   │   └── DisciplinePage.jsx       # Score ring, violation log, rule config
│   │   │   └── analytics/
│   │   │       └── AnalyticsPage.jsx        # P&L curve, win rate, mistake breakdown
│   │   │
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── AppLayout.jsx            # Sidebar + top bar + main content area
│   │   │   │   ├── Sidebar.jsx              # Nav links with active state
│   │   │   │   ├── TopBar.jsx               # Balance, market status badge, user avatar
│   │   │   │   └── ProtectedRoute.jsx       # Redirect to /login if not authenticated
│   │   │   │
│   │   │   ├── trading/
│   │   │   │   ├── OptionChainTable.jsx     # Full option chain with CE/PE columns
│   │   │   │   ├── StrikeRow.jsx            # Single strike row: CE data | ATM | PE data
│   │   │   │   ├── OrderFormPanel.jsx       # Slide-in panel: strike, qty, SL, setup tag
│   │   │   │   ├── OpenPositionCard.jsx     # Live unrealized P&L card per open position
│   │   │   │   ├── PositionsList.jsx        # List of OpenPositionCards
│   │   │   │   └── MarketStatusBadge.jsx    # "OPEN" green / "CLOSED" gray pill
│   │   │   │
│   │   │   ├── discipline/
│   │   │   │   ├── DisciplineScoreRing.jsx  # SVG circular progress 0–100
│   │   │   │   ├── DisciplineStreakBadge.jsx # "12 consecutive disciplined trades"
│   │   │   │   ├── RuleViolationToast.jsx   # Blocks order with rule name + explanation
│   │   │   │   ├── RuleCard.jsx             # Single rule: toggle + value edit
│   │   │   │   └── ViolationList.jsx        # Paginated table of past violations
│   │   │   │
│   │   │   ├── journal/
│   │   │   │   ├── JournalEntryCard.jsx     # Summary card in list view
│   │   │   │   ├── TradeDetailPanel.jsx     # Auto-populated trade data display
│   │   │   │   ├── EmotionTagPicker.jsx     # Pill selector: CALM / FOMO / FEARFUL etc.
│   │   │   │   ├── MistakeCategoryPicker.jsx # Pill selector: EARLY_EXIT / OVERSIZE etc.
│   │   │   │   └── ReviewNotesForm.jsx      # Pre-trade thesis + post-trade notes textareas
│   │   │   │
│   │   │   ├── analytics/
│   │   │   │   ├── PnLCurveChart.jsx        # Recharts line chart — cumulative P&L per trade
│   │   │   │   ├── DisciplineTrendChart.jsx  # Score per day bar chart (30d)
│   │   │   │   ├── StatCard.jsx             # Reusable: label + big number + delta
│   │   │   │   └── MistakeBreakdownChart.jsx # Pie chart of mistake categories
│   │   │   │
│   │   │   └── common/
│   │   │       ├── Button.jsx
│   │   │       ├── Input.jsx
│   │   │       ├── Select.jsx
│   │   │       ├── Badge.jsx
│   │   │       ├── Modal.jsx
│   │   │       ├── Spinner.jsx
│   │   │       ├── ErrorMessage.jsx
│   │   │       ├── Pagination.jsx
│   │   │       ├── EmptyState.jsx
│   │   │       └── GoogleLoginButton.jsx    # Styled "Sign in with Google" button ← AUTH
│   │   │
│   │   ├── hooks/
│   │   │   ├── useAuth.js                   # login(), logout(), refreshToken(), user state, isAuthenticated
│   │   │   ├── useMarketWebSocket.js         # WS connect/disconnect, reconnect, optionChain state
│   │   │   ├── useVirtualTrading.js          # placeOrder(), closePosition(), account + positions state
│   │   │   ├── useDiscipline.js              # rules, score, violations, updateRule()
│   │   │   └── useJournal.js               # journal list, single entry, updateEntry()
│   │   │
│   │   ├── store/                           # Zustand global state stores
│   │   │   ├── authStore.js                 # user, accessToken, isAuthenticated, setTokens(), clearAuth()
│   │   │   ├── marketStore.js               # optionChain, spotPrice, atmStrike, isMarketOpen
│   │   │   └── tradingStore.js             # openPositions, orders, accountBalance
│   │   │
│   │   ├── api/                             # Axios functions — one file per domain
│   │   │   ├── client.js                    # Axios instance: baseURL, auth header inject, 401 refresh interceptor
│   │   │   ├── auth.js                      # register(), login(), refreshToken(), getMe(), logout()
│   │   │   ├── oauth.js                     # getGoogleRedirectUrl(), handleOAuthCallback() ← AUTH
│   │   │   ├── trading.js                   # getAccount(), placeOrder(), getOrders(), closeOrder(), getPositions()
│   │   │   ├── discipline.js               # getRules(), updateRule(), getScore(), getViolations()
│   │   │   ├── journal.js                   # getJournal(), getEntry(), updateEntry()
│   │   │   └── analytics.js                # getSummary(), getDisciplineTrend(), getPnLCurve(), getMistakes()
│   │   │
│   │   ├── utils/
│   │   │   ├── formatters.js               # formatCurrency(), formatDate(), formatPnL() with red/green color
│   │   │   ├── constants.js                # API_BASE_URL, SETUP_TAGS, EMOTION_TAGS, MISTAKE_CATEGORIES
│   │   │   └── validators.js               # Client-side order form validation (mirrors backend rules)
│   │   │
│   │   └── styles/
│   │       ├── index.css                   # Tailwind directives + CSS custom properties
│   │       └── theme.js                    # Color tokens: trading green, loss red, neutral palette
│   │
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── package.json
│   ├── .env.example                        # VITE_API_BASE_URL=http://localhost:8000
│   └── .gitignore
│
├── docker-compose.yml                      # postgres:16 on 5432, pgadmin on 5050
├── .gitignore
└── README.md


# ──────────────────────────────────────────────────────
# FILE COUNT SUMMARY
# ──────────────────────────────────────────────────────
#
# backend/app/models/          11 files  (10 original + 1 auth)
# backend/app/schemas/         10 files  (9 original + 1 auth)
# backend/app/routers/          8 files  (7 original + 1 auth)
# backend/app/services/        10 files  (8 original + 2 auth)
# backend/app/market/           5 files
# backend/app/core/             8 files  (6 original + 2 auth)
# backend/app/migrations/       4 files  (3 original + 1 auth)
# backend/tests/unit/           5 files  (4 original + 1 auth)
# backend/tests/integration/    4 files  (2 original + 2 auth)
#
# frontend/src/pages/          10 files  (9 original + 1 auth)
# frontend/src/components/     24 files  (23 original + 1 auth)
# frontend/src/hooks/           5 files
# frontend/src/store/           3 files
# frontend/src/api/             7 files  (6 original + 1 auth)
# frontend/src/utils/           3 files
# frontend/src/styles/          2 files
#
# ← AUTH files added = 12 total
#   backend: refresh_token.py, token.py, oauth.py (router),
#            token_service.py, oauth_service.py, security.py (expanded),
#            oauth2_schemes.py, oauth_config.py,
#            0002_add_refresh_tokens.py, test_security.py, test_oauth.py
#   frontend: OAuthCallbackPage.jsx, GoogleLoginButton.jsx, oauth.js


# ──────────────────────────────────────────────────────
# .env.example (backend) — ALL required variables
# ──────────────────────────────────────────────────────
#
# DATABASE_URL=postgresql://user:password@localhost:5432/strikefluency
# SECRET_KEY=your-super-secret-key-min-32-chars
# ALGORITHM=HS256
# ACCESS_TOKEN_EXPIRE_MINUTES=1440
# REFRESH_TOKEN_EXPIRE_DAYS=7
# ENVIRONMENT=development
# MOCK_MARKET_DATA=true
# NIFTY_LOT_SIZE=50
# DEFAULT_MAX_TRADES_PER_DAY=3
# DEFAULT_COOLDOWN_MINUTES=15
# DEFAULT_MAX_DAILY_LOSS_PCT=2.0
# DEFAULT_INITIAL_CAPITAL=100000
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=
# GOOGLE_REDIRECT_URI=http://localhost:8000/oauth/google/callback


# ──────────────────────────────────────────────────────
# requirements.txt (backend)
# ──────────────────────────────────────────────────────
#
# fastapi==0.111.0
# uvicorn[standard]==0.29.0
# sqlalchemy==2.0.30
# alembic==1.13.1
# psycopg2-binary==2.9.9
# pydantic==2.7.1
# pydantic-settings==2.2.1
# python-jose[cryptography]==3.3.0   ← AUTH
# passlib[bcrypt]==1.7.4             ← AUTH
# python-multipart==0.0.9            ← AUTH
# httpx==0.27.0                      ← AUTH (Google OAuth API calls)
# apscheduler==3.10.4


# ──────────────────────────────────────────────────────
# package.json dependencies (frontend)
# ──────────────────────────────────────────────────────
#
# react + react-dom
# react-router-dom
# axios
# zustand
# recharts
# react-hook-form
# zod
# tailwindcss + postcss + autoprefixer
# @vitejs/plugin-react
# vite


# ──────────────────────────────────────────────────────
# BUILD ORDER — Week by week
# ──────────────────────────────────────────────────────
#
# WEEK 1 — Foundation + Auth
#   1.  docker-compose.yml → PostgreSQL running locally
#   2.  backend/ scaffold  → main.py, config.py, database.py
#   3.  All SQLAlchemy models (all 11 files)
#   4.  Alembic 0001 migration → all tables created
#   5.  Alembic 0002 migration → refresh_tokens table
#   6.  core/security.py    → JWT + bcrypt functions
#   7.  core/oauth2_schemes.py → OAuth2PasswordBearer
#   8.  services/auth_service.py + token_service.py
#   9.  routers/auth.py     → register, login, refresh, logout, me
#   10. dependencies.py     → get_current_user() working
#   11. Test: register → login → call protected route → refresh → logout
#
# WEEK 2 — Google OAuth + Virtual Trading Engine
#   12. core/oauth_config.py + services/oauth_service.py
#   13. routers/oauth.py    → /oauth/google + callback
#   14. Market mock provider + WebSocket manager
#   15. services/virtual_order_service.py + slippage + brokerage
#   16. routers/trading.py  → place + close order working
#
# WEEK 3 — Discipline Engine + Journal + Analytics
#   17. services/discipline_engine.py (all 7 rules)
#   18. services/journal_service.py (auto on close)
#   19. services/trading_session_service.py (cooldown, trade count)
#   20. routers/discipline.py + journal.py + analytics.py
#
# WEEK 4 — Frontend
#   21. React + Vite scaffold, Zustand, Axios client with interceptors
#   22. Auth pages (login + register + Google button + OAuth callback)
#   23. Trading Desk (option chain + order form)
#   24. Dashboard + Discipline page
#   25. Journal + Analytics pages
#
# WEEK 5 — Tests + Polish
#   26. Backend unit tests (security, discipline, slippage, brokerage)
#   27. Backend integration tests (auth flow, order flow, journal)
#   28. End-to-end manual testing
#   29. README, .env.example, deploy notes