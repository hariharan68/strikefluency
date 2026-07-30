# Configuration reference

**Verified against:** `backend/app/config.py`, backend/frontend `.env.example`,
Vite configuration, and provider code on 2026-07-30.

## 1. Loading and precedence

The backend uses Pydantic Settings with case-sensitive names. From `backend/`,
it reads process environment variables and `backend/.env`; process environment
values take precedence. Unknown keys are ignored. `DATABASE_URL` and
`SECRET_KEY` have no code defaults and must be supplied.

The frontend reads `VITE_*` variables at Vite build/start time. Changing them
requires restarting the dev server or rebuilding the production assets.

Never commit real secrets. Treat broker tokens, broker application secrets,
OAuth client secrets, database URLs, JWT secrets, and SMTP credentials as
secrets even in development.

## 2. Backend settings

### Database, application, and permanent safety

| Variable | Default | Required/meaning |
|---|---|---|
| `DATABASE_URL` | none | Required SQLAlchemy PostgreSQL URL. |
| `SECRET_KEY` | none | Required JWT signing secret; production requires at least 32 characters and rejects the example prefix. |
| `ENVIRONMENT` | `development` | Exact string. Only `production` activates production validation; `testing` is neither development nor production. |
| `SQL_ECHO` | `false` | SQLAlchemy SQL logging. Avoid in production because parameters may be sensitive. |
| `EXECUTION_MODE` | `paper_only` | Literal startup invariant; no other value parses. |
| `BROKER_ACCESS_MODE` | `market_data_read_only` | Literal startup invariant; no other value parses. |
| `FRONTEND_URL` | `http://localhost:5173` | OAuth/broker callback destination. Must be HTTPS in production. |
| `BILLING_ENABLED` | `false` | Enables plan ranking checks. It does not implement billing. Leave false until product/payment behavior exists. |

### JWT, cookies, and browser origins

| Variable | Default | Meaning |
|---|---:|---|
| `ALGORITHM` | `HS256` | JWT signing algorithm. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `5` | Access-token lifetime. |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `30` | Persistent refresh-family absolute lifetime and cookie max age. |
| `EPHEMERAL_IDLE_TIMEOUT_MINUTES` | `30` | Idle timeout for non-remembered sessions. |
| `EPHEMERAL_ABSOLUTE_CAP_HOURS` | `12` | Maximum lifetime for an ephemeral family. |
| `COOKIE_SECURE` | `false` | Adds Secure to refresh/OAuth transaction cookies; required in production. |
| `TRUSTED_ORIGINS` | local Vite ports | Comma-separated, normalized origins used by both CORS and login/refresh/logout Origin checks. Every production value must use HTTPS. |
| `JTI_DENYLIST_ENABLED` | `false` | Enables Redis-backed immediate access-token JTI denial. `token_version` invalidation remains active independently. |

The refresh cookie name is `refresh_token`, path is `/api/v1/auth`, SameSite is
`lax`, and it is always httpOnly. An ephemeral session omits cookie `Max-Age`.

### Market provider and freshness

| Variable | Default | Meaning |
|---|---:|---|
| `MARKET_DATA_PROVIDER` | `mock` | `mock`, `fyers`, or `kite`. Unknown values currently fall through to mock; deploy only documented values. |
| `MARKET_TICK_STALE_SECONDS` | `60` | Generic display-staleness threshold used when stamping normalized data. |
| `MARKET_ORDER_BLOCK_SECONDS` | `120` | Provider-agnostic maximum age for new entries and scheduler triggers. |

Provider-specific checks run before the generic backstop and may be stricter.
Mock and `mock_fallback` are executable outside production but rejected for new
production entries.

### Fyers

| Variable | Default | Meaning |
|---|---|---|
| `FYERS_CLIENT_ID` | empty | Compatibility client/application identifier. |
| `FYERS_APP_ID` | empty | Fyers application ID used by auth/provider code. |
| `FYERS_SECRET_ID` | empty | Fyers application secret. |
| `FYERS_REDIRECT_URI` | empty | Must exactly match the broker application and active API callback URL. |
| `FYERS_ACCESS_TOKEN` | empty | Optional configured token; persisted connection state normally supplies it. |
| `FYERS_TOKEN_FILE` | `fyers_token.json` | Legacy/local token file name. |
| `FYERS_ACCESS_TOKEN_FILE` | `access_token.txt` | Legacy/local access-token file name. |

Fyers is deliberately availability-oriented: missing/invalid credentials or a
provider initialization failure selects mock fallback. Production order
freshness still rejects simulated data. Fyers structural option chains cache for
95 seconds; spot for 35 seconds; history/expiry lists for one hour; streamed
quotes expire after 30 seconds.

### Kite

| Variable | Default | Meaning |
|---|---:|---|
| `KITE_API_KEY` | empty | Kite application key. |
| `KITE_API_SECRET` | empty | Kite application secret. |
| `KITE_REDIRECT_URI` | `http://127.0.0.1:8000/api/v1/auth/kite/callback` | Broker callback; HTTPS required in production when Kite is configured. |
| `KITE_ACCESS_TOKEN` | empty | Optional configured token; encrypted persisted state normally supplies it. |
| `KITE_TICK_STALE_SECONDS` | `15` | Kite stale-display threshold. |
| `KITE_ORDER_BLOCK_SECONDS` | `30` | Kite-specific entry threshold. |
| `KITE_OPTION_STRIKES_EACH_SIDE` | `20` | Option-chain depth around ATM. |

Kite is fail-closed and never substitutes mock prices. Redis is required when
Kite is selected. Production with Kite also requires an explicit
`BROKER_TOKEN_ENC_KEY`.

### Broker credential encryption

| Variable | Default | Meaning |
|---|---|---|
| `BROKER_TOKEN_ENC_KEY` | empty | Fernet key for encrypted broker credentials/tokens. Outside the strict Kite production check, connection code can derive a key from `SECRET_KEY`; production should supply and retain a dedicated key. |

Rotating this key without migrating encrypted rows makes saved broker
connections unreadable. Back it up as part of secret-management recovery.

### Discipline defaults

| Variable | Default | Meaning at user/account creation |
|---|---:|---|
| `DEFAULT_MAX_TRADES_PER_DAY` | `3` | Default max-trades rule. |
| `DEFAULT_COOLDOWN_MINUTES` | `15` | Default cooldown after a stop-loss exit. |
| `DEFAULT_MAX_DAILY_LOSS_PCT` | `2.0` | Percent of `initial_balance`. |
| `DEFAULT_INITIAL_CAPITAL` | `100000.0` | Initial virtual-account credit. |

Changing these values affects newly seeded state; it does not rewrite existing
user rules or account rows.

### OAuth and email

| Variable | Default | Meaning |
|---|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | empty | Google OAuth credentials. |
| `GOOGLE_REDIRECT_URI` | `http://localhost:8000/api/v1/oauth/google/callback` | Google callback. |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | empty | GitHub OAuth credentials. |
| `GITHUB_REDIRECT_URI` | `http://localhost:8000/api/v1/oauth/github/callback` | GitHub callback. |
| `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET` | empty | Facebook OAuth credentials. |
| `FACEBOOK_REDIRECT_URI` | `http://localhost:8000/api/v1/oauth/facebook/callback` | Facebook callback. |
| `SMTP_HOST` | empty | SMTP server; empty means security email delivery cannot be configured. |
| `SMTP_PORT` | `587` | SMTP port. |
| `SMTP_USERNAME` / `SMTP_PASSWORD` | empty | SMTP authentication. |
| `SMTP_FROM` | empty | Sender address. |
| `SMTP_STARTTLS` | `true` | Enable STARTTLS. |

OAuth provider start endpoints redirect back with a user-visible
`not_configured` error when credentials are absent. Configured redirect URIs and
`FRONTEND_URL` must use HTTPS in production.

### Redis and scheduler

| Variable | Default | Meaning |
|---|---:|---|
| `REDIS_URL` | empty | Scheduler lease, Kite cache/control/rate slots, and optional JTI denial. Required in production and whenever Kite is selected. |
| `SCHEDULER_LEADER_TTL_SECONDS` | `30` | State-job lease TTL, clamped to a minimum of 9 seconds. |

Without `REDIS_URL`, every process considers itself leader. That is safe only
with a single API process. When Redis is configured but unavailable, production
and Kite pause state-changing jobs; development with a non-Kite provider may
fall back locally.

## 3. Frontend settings

| Variable | Default | Meaning |
|---|---|---|
| `VITE_API_BASE_URL` | empty | Empty uses relative `/api/v1`; otherwise the configured absolute base has its trailing slash removed. |
| `VITE_API_PROXY_TARGET` | `http://localhost:8000` | Vite development proxy for `/api`. |
| `VITE_WS_PROXY_TARGET` | `ws://localhost:8000` | Vite development WebSocket proxy. |
| `VITE_API_TIMEOUT_MS` | `15000` | Axios timeout. Invalid/non-positive values fall back to 15 seconds. Not currently listed in `.env.example`. |

For a same-origin production deployment, leave `VITE_API_BASE_URL` empty and
route `/api` and WebSocket upgrades to the backend at the ingress. For separate
origins, set an HTTPS API base and include the frontend's exact origin in
`TRUSTED_ORIGINS`.

## 4. Production startup validation

With `ENVIRONMENT=production`, startup refuses to continue if any of these are
true:

- `COOKIE_SECURE` is false;
- `SECRET_KEY` is short or retains the example prefix;
- configured OAuth redirect URIs use HTTP;
- `FRONTEND_URL` uses HTTP;
- any trusted origin uses HTTP;
- `REDIS_URL` is empty;
- Kite is selected without `REDIS_URL` or `BROKER_TOKEN_ENC_KEY`;
- Kite credentials are configured with an HTTP redirect URI;
- the paper execution/access literals are changed;
- a route is neither authenticated nor declared public.

Production also disables `/docs`, `/redoc`, and `/openapi.json` and adds HSTS.

## 5. Legacy example keys

`backend/.env.example` currently contains `MOCK_MARKET_DATA` and
`NIFTY_LOT_SIZE`. Neither is a `Settings` field and unknown settings are ignored.
Provider choice comes from `MARKET_DATA_PROVIDER`; instrument lot sizes come
only from `app/core/instruments.py`. Do not copy those legacy keys into new
deployment configuration.

## 6. Environment templates

Development baseline:

```dotenv
ENVIRONMENT=development
DATABASE_URL=postgresql://postgres:<password>@localhost:5432/strikefluency
SECRET_KEY=<random-64-hex-characters>
COOKIE_SECURE=false
TRUSTED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
EXECUTION_MODE=paper_only
BROKER_ACCESS_MODE=market_data_read_only
MARKET_DATA_PROVIDER=mock
REDIS_URL=redis://localhost:6379/0
FRONTEND_URL=http://localhost:5173
```

Production skeleton (values intentionally omitted):

```dotenv
ENVIRONMENT=production
DATABASE_URL=
SECRET_KEY=
COOKIE_SECURE=true
TRUSTED_ORIGINS=https://app.example.com
EXECUTION_MODE=paper_only
BROKER_ACCESS_MODE=market_data_read_only
MARKET_DATA_PROVIDER=
REDIS_URL=
BROKER_TOKEN_ENC_KEY=
FRONTEND_URL=https://app.example.com
```

Supply secrets through the hosting platform's secret manager rather than a
committed file.
