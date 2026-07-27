# Paper Trading SaaS Platform Architecture

## NIFTY 50 | SENSEX | BANK NIFTY

## 1. Product Overview

This application is a production-ready SaaS paper trading platform for the Indian stock market.

It allows users to practise trading using virtual funds while experiencing a workflow similar to a real broker platform.

The platform initially supports:

- NIFTY 50
- SENSEX
- BANK NIFTY

No real money is involved. All trades, orders, positions, balances, profits, and losses are simulated.

## 2. Core User Features

Users can:

- Create a paper trading account
- Receive virtual trading funds
- Search supported instruments
- Add instruments to a watchlist
- View live or delayed market prices
- Place buy and sell orders
- Place market, limit, and stop-loss orders
- View pending, executed, rejected, and cancelled orders
- View open positions
- Exit full or partial positions
- Track realised and unrealised profit and loss
- View portfolio performance
- Maintain a trade journal
- Review trading analytics
- Generate performance reports
- Test trading strategies
- Apply paper-trading risk controls
- Receive notifications and alerts

## 3. High-Level System Architecture

```text
                           INTERNET
                               |
                               v
                      Cloudflare CDN / WAF
                               |
                               v
                    NGINX / API Gateway / LB
                               |
          +--------------------+--------------------+
          |                    |                    |
          v                    v                    v
    React Frontend       FastAPI REST API     WebSocket Gateway
          |                    |                    |
          +--------------------+--------------------+
                               |
                               v
                     Business Services Layer
                               |
  +----------------------------------------------------------------+
  | Authentication and Authorisation                               |
  | User and Tenant Management                                     |
  | Paper Trading Engine                                           |
  | Order Management                                               |
  | Position Management                                            |
  | Portfolio and Virtual Funds                                    |
  | Real-Time P&L Engine                                           |
  | Risk Management                                                |
  | Watchlist Service                                              |
  | Trade Journal                                                  |
  | Analytics and Reporting                                        |
  | Notifications                                                  |
  | Subscription and Billing                                       |
  | Admin and Audit Services                                        |
  +----------------------------------------------------------------+
                               |
                 +-------------+-------------+
                 |                           |
                 v                           v
          PostgreSQL Database          Redis Cache
                 |                           |
                 |                           v
                 |                   Pub/Sub or Streams
                 |                           |
                 +-------------+-------------+
                               |
                               v
                    Background Worker Layer
                               |
          +--------------------+--------------------+
          |                    |                    |
          v                    v                    v
    Order Workers       Analytics Workers     Report Workers
                               |
                               v
                    Market Data Service
                               |
                               v
             Broker API or Licensed Data Provider
```

## 4. Recommended Architecture Principle

The system should not request the same market price separately for every connected user.

For example, if 10,000 users are watching NIFTY, the application should not make 10,000 upstream market-data calls.

Instead, the platform should:

1. Maintain one or a controlled number of upstream market-data connections.
2. Receive each market tick once.
3. Validate and normalise the tick.
4. Store the latest value in Redis.
5. Publish the tick through Redis Pub/Sub or Redis Streams.
6. Broadcast the update to all relevant users through WebSockets.

This is called an internal data fan-out architecture.

## 5. Market Data Architecture

```text
Broker API / Licensed Market Data Provider
                    |
                    v
          Market Data Connector
                    |
                    v
          Raw Tick Validation
                    |
                    v
        Symbol Normalisation Layer
                    |
                    v
       Canonical Market Tick Format
                    |
          +---------+---------+
          |                   |
          v                   v
   Redis Latest Price    Redis Pub/Sub
          |                   |
          |                   v
          |           WebSocket Gateway
          |                   |
          +---------+---------+
                    |
                    v
          Paper Trading Engine
                    |
                    v
        Connected Frontend Clients
```

## 6. Canonical Market Tick Format

All provider-specific responses should be converted into one internal format.

```json
{
  "instrument_id": "NSE_INDEX_NIFTY50",
  "exchange": "NSE",
  "symbol": "NIFTY 50",
  "last_price": 24850.75,
  "open": 24790.25,
  "high": 24920.40,
  "low": 24745.10,
  "previous_close": 24768.35,
  "volume": null,
  "timestamp": "2026-07-27T10:25:31.125Z",
  "provider": "FYERS",
  "market_status": "OPEN",
  "is_stale": false
}
```

This abstraction allows the application to switch from Fyers to another provider without rewriting the paper trading engine.

## 7. Market Data Provider Interface

```python
from typing import Protocol


class MarketDataProvider(Protocol):
    async def connect(self) -> None:
        ...

    async def subscribe(self, symbols: list[str]) -> None:
        ...

    async def unsubscribe(self, symbols: list[str]) -> None:
        ...

    async def get_quote(self, symbol: str) -> dict:
        ...

    async def disconnect(self) -> None:
        ...
```

Possible implementations:

```text
FyersMarketDataProvider
ZerodhaMarketDataProvider
LicensedVendorMarketDataProvider
MockMarketDataProvider
ReplayMarketDataProvider
```

## 8. Important Market Data Licensing Requirement

A broker API may technically provide live prices, but its terms may restrict:

- Commercial use
- Redistribution
- Displaying data to multiple customers
- Storing exchange data
- Providing derived market-data products
- Sharing one broker connection across SaaS users

Before launching a paid SaaS product, obtain written confirmation that the provider permits the intended usage.

Paper trading does not automatically remove market-data licensing obligations.

The safest long-term approach is to use:

- An exchange-authorised market-data vendor
- A vendor licence that permits redistribution
- A commercial agreement that covers the expected number of users
- A delayed-data source where delayed data is acceptable
- User-connected broker accounts where redistribution is not allowed

## 9. Paper Trading Order Flow

```text
User Submits Order
        |
        v
Authentication Check
        |
        v
Subscription and Account Check
        |
        v
Request Validation
        |
        v
Risk Validation
        |
        v
Read Latest Price from Redis
        |
        v
Check Price Freshness
        |
        v
Simulate Order Execution
        |
        v
Store Order in PostgreSQL
        |
        v
Create or Update Position
        |
        v
Update Virtual Funds and Margin
        |
        v
Create Ledger Entry
        |
        v
Publish Order and Position Event
        |
        v
Update Frontend through WebSocket
```

## 10. Order Types

The MVP can support:

- Market order
- Limit order
- Stop-loss market order
- Stop-loss limit order

Future order types can include:

- Bracket orders
- Cover orders
- Good Till Triggered orders
- Trailing stop-loss orders
- One-Cancels-the-Other orders
- Multi-leg strategy orders

## 11. Market Order Simulation

A market order should not always execute blindly at the visible last traded price.

A more realistic fill model can apply:

```text
Simulated Fill Price =
Latest Market Price
+ or - Slippage
+ Applicable Spread Adjustment
```

For a buy order:

```text
Fill Price = Latest Ask or Last Price + Slippage
```

For a sell order:

```text
Fill Price = Latest Bid or Last Price - Slippage
```

The system can initially use a configurable slippage value and later adopt bid-and-ask data.

## 12. Limit Order Simulation

```text
Buy Limit Order:
Execute when market price is less than or equal to the limit price.

Sell Limit Order:
Execute when market price is greater than or equal to the limit price.
```

Pending limit orders should be processed by a background order-matching worker that consumes market ticks.

## 13. Stop-Loss Simulation

```text
Sell Stop-Loss:
Trigger when price falls to or below the trigger price.

Buy Stop-Loss:
Trigger when price rises to or above the trigger price.
```

After triggering, the order should become either:

- A market order
- A limit order

The chosen behaviour depends on the order type.

## 14. Position Management

A position record should include:

```text
Position ID
User ID
Trading Account ID
Instrument ID
Side
Total Buy Quantity
Total Sell Quantity
Net Quantity
Average Buy Price
Average Sell Price
Average Entry Price
Last Market Price
Realised P&L
Unrealised P&L
Total P&L
Position Status
Opened At
Closed At
```

Position status values:

```text
OPEN
PARTIALLY_CLOSED
CLOSED
SQUARED_OFF
```

## 15. Live P&L Flow

```text
New Market Tick
       |
       v
Update Latest Price in Redis
       |
       v
Publish Tick Event
       |
       v
Identify Affected Open Positions
       |
       v
Calculate Unrealised P&L
       |
       v
Update User-Level P&L Snapshot
       |
       v
Send Update through WebSocket
       |
       v
React UI Updates Automatically
```

For a long position:

```text
Unrealised P&L =
Current Price - Average Entry Price
multiplied by Open Quantity
```

For a short position:

```text
Unrealised P&L =
Average Entry Price - Current Price
multiplied by Open Quantity
```

## 16. Realised P&L

Realised P&L is calculated when a position is fully or partially exited.

For a long position:

```text
Realised P&L =
Exit Price - Entry Price
multiplied by Exited Quantity
```

For a short position:

```text
Realised P&L =
Entry Price - Exit Price
multiplied by Exited Quantity
```

Simulated charges can optionally be deducted from the result.

## 17. Charges Simulation

To make paper trading realistic, the platform may simulate:

- Brokerage
- Securities Transaction Tax
- Exchange transaction charges
- GST
- SEBI charges
- Stamp duty
- Slippage
- Spread impact

Charge calculations must be configurable because rates and exchange rules can change.

## 18. Data Freshness Protection

Never execute a simulated order using stale market data.

Redis can store:

```text
market:price:NSE_INDEX_NIFTY50
market:timestamp:NSE_INDEX_NIFTY50
market:status:NSE_INDEX_NIFTY50
```

Before execution:

```text
Current Time - Tick Timestamp <= Maximum Allowed Age
```

When data is stale:

- Reject new market orders
- Pause pending-order execution
- Display a market-data warning
- Prevent inaccurate P&L updates
- Log the provider outage
- Notify administrators

## 19. Market Status Management

The platform should understand:

```text
PRE_OPEN
OPEN
CLOSED
HALTED
HOLIDAY
DATA_UNAVAILABLE
```

Orders submitted outside market hours can either be:

- Rejected
- Queued for the next session
- Accepted as After Market Orders

The selected policy should be visible to users.

## 20. Core Backend Modules

```text
app/
├── api/
│   ├── v1/
│   │   ├── auth.py
│   │   ├── users.py
│   │   ├── accounts.py
│   │   ├── instruments.py
│   │   ├── market_data.py
│   │   ├── watchlists.py
│   │   ├── orders.py
│   │   ├── positions.py
│   │   ├── portfolio.py
│   │   ├── journal.py
│   │   ├── analytics.py
│   │   ├── subscriptions.py
│   │   └── admin.py
│   └── websocket.py
├── core/
│   ├── config.py
│   ├── security.py
│   ├── logging.py
│   ├── exceptions.py
│   └── middleware.py
├── db/
│   ├── base.py
│   ├── session.py
│   └── migrations/
├── models/
│   ├── user.py
│   ├── trading_account.py
│   ├── instrument.py
│   ├── order.py
│   ├── execution.py
│   ├── position.py
│   ├── portfolio_snapshot.py
│   ├── ledger.py
│   ├── journal.py
│   ├── subscription.py
│   └── audit_log.py
├── schemas/
│   ├── auth.py
│   ├── order.py
│   ├── position.py
│   ├── portfolio.py
│   ├── market_data.py
│   └── analytics.py
├── services/
│   ├── auth_service.py
│   ├── market_data_service.py
│   ├── order_service.py
│   ├── matching_engine.py
│   ├── position_service.py
│   ├── pnl_service.py
│   ├── risk_service.py
│   ├── ledger_service.py
│   ├── portfolio_service.py
│   ├── analytics_service.py
│   └── notification_service.py
├── providers/
│   └── market_data/
│       ├── base.py
│       ├── fyers.py
│       ├── mock.py
│       └── replay.py
├── repositories/
│   ├── order_repository.py
│   ├── position_repository.py
│   ├── account_repository.py
│   └── instrument_repository.py
├── workers/
│   ├── market_data_worker.py
│   ├── order_matching_worker.py
│   ├── pnl_worker.py
│   ├── analytics_worker.py
│   └── report_worker.py
├── events/
│   ├── publisher.py
│   ├── consumer.py
│   └── event_types.py
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── websocket/
│   └── load/
└── main.py
```

## 21. PostgreSQL Database Design

### Main Tables

```text
users
roles
user_roles
sessions
refresh_tokens
trading_accounts
virtual_fund_ledger
instruments
watchlists
watchlist_items
orders
order_events
executions
positions
portfolio_snapshots
pnl_snapshots
trade_journal_entries
strategies
notifications
subscription_plans
subscriptions
payments
audit_logs
```

### Orders Table

Recommended fields:

```text
id
tenant_id
user_id
trading_account_id
instrument_id
client_order_id
order_type
side
quantity
filled_quantity
remaining_quantity
limit_price
trigger_price
average_fill_price
status
time_in_force
rejection_reason
placed_at
triggered_at
filled_at
cancelled_at
created_at
updated_at
```

### Executions Table

```text
id
order_id
user_id
instrument_id
quantity
fill_price
slippage
simulated_charges
executed_at
market_timestamp
created_at
```

### Virtual Fund Ledger

Every balance change should create an immutable ledger record.

```text
id
trading_account_id
transaction_type
amount
balance_before
balance_after
reference_type
reference_id
description
created_at
```

Possible transaction types:

```text
INITIAL_CREDIT
TRADE_DEBIT
TRADE_CREDIT
CHARGE
REFUND
MANUAL_ADJUSTMENT
RESET
```

## 22. Redis Design

Recommended keys:

```text
market:price:{instrument_id}
market:tick:{instrument_id}
market:status:{exchange}
market:subscribers:{instrument_id}
user:pnl:{user_id}
user:portfolio:{user_id}
user:connections:{user_id}
order:pending:{instrument_id}
rate_limit:{user_id}:{endpoint}
session:{session_id}
token:blacklist:{token_id}
```

Recommended Redis capabilities:

- Latest-price cache
- Session cache
- Token blacklist
- Distributed locks
- Rate limiting
- WebSocket event fan-out
- P&L snapshot cache
- Pending-order queues
- Short-lived analytics cache

## 23. WebSocket Channels

Possible channel model:

```text
market:index:NIFTY50
market:index:SENSEX
market:index:BANKNIFTY
user:{user_id}:orders
user:{user_id}:positions
user:{user_id}:portfolio
user:{user_id}:notifications
```

Users should only receive channels they are authorised to access.

## 24. WebSocket Event Example

```json
{
  "event": "position.pnl.updated",
  "version": "1.0",
  "timestamp": "2026-07-27T10:25:31.125Z",
  "data": {
    "position_id": "pos_123",
    "instrument_id": "NSE_INDEX_NIFTY50",
    "last_price": 24850.75,
    "unrealised_pnl": 4250.00,
    "realised_pnl": 1200.00,
    "total_pnl": 5450.00
  }
}
```

## 25. Frontend Architecture

```text
src/
├── app/
│   ├── router.tsx
│   ├── providers.tsx
│   └── store.ts
├── pages/
│   ├── DashboardPage.tsx
│   ├── TradingTerminalPage.tsx
│   ├── OrdersPage.tsx
│   ├── PositionsPage.tsx
│   ├── PortfolioPage.tsx
│   ├── JournalPage.tsx
│   ├── AnalyticsPage.tsx
│   ├── SettingsPage.tsx
│   └── AdminPage.tsx
├── features/
│   ├── auth/
│   ├── market-data/
│   ├── order-entry/
│   ├── orders/
│   ├── positions/
│   ├── portfolio/
│   ├── journal/
│   └── analytics/
├── components/
│   ├── charts/
│   ├── tables/
│   ├── forms/
│   ├── layout/
│   └── ui/
├── services/
│   ├── api.ts
│   ├── websocket.ts
│   └── query-client.ts
├── hooks/
├── stores/
├── types/
├── utils/
└── main.tsx
```

## 26. Recommended Frontend Stack

- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- TanStack Query
- Zustand
- React Hook Form
- Zod
- ECharts
- React Router
- Native WebSocket or Socket.IO client

## 27. Authentication Architecture

```text
User Login
    |
    v
FastAPI Authentication Endpoint
    |
    v
Access Token + Refresh Token
    |
    +--> Access Token: short lifetime
    |
    +--> Refresh Token: HttpOnly secure cookie
```

Recommended controls:

- Short-lived access tokens
- Refresh-token rotation
- Server-side refresh-token records
- Logout revocation
- JWT identifier
- Redis token blacklist where required
- Rate limiting
- OAuth state and PKCE validation
- Secure and HttpOnly cookies
- SameSite policy
- CSRF protection where applicable
- Password hashing with Argon2
- Role-based and tenant-based authorisation

## 28. Multi-Tenant SaaS Design

Every tenant-owned table should include:

```text
tenant_id
```

All queries must be scoped by the authenticated tenant.

Example:

```text
User -> Tenant -> Trading Account -> Orders -> Positions
```

Never trust a tenant ID supplied by the frontend. Resolve tenant access from the authenticated session.

## 29. Risk Management Rules

The paper trading engine should support configurable rules such as:

- Maximum quantity per order
- Maximum open positions
- Maximum daily paper loss
- Maximum order value
- Maximum number of daily orders
- Instrument allowlist
- Trading-hours restriction
- Duplicate-order protection
- Stale-price rejection
- Insufficient virtual-fund rejection
- Margin requirement
- Automatic square-off time
- Cooldown after repeated losses

## 30. Idempotency

Order creation must support an idempotency key.

```text
Idempotency-Key: unique-client-generated-value
```

If the frontend retries a request, the backend should return the existing order rather than creating a duplicate order.

## 31. Concurrency Protection

Concurrent orders can cause incorrect balances or quantities.

Use:

- PostgreSQL transactions
- Row-level locking
- Optimistic version fields
- Redis distributed locks only where justified
- Unique client-order IDs
- Atomic ledger operations

Critical operations should be completed in one database transaction:

```text
Validate Funds
Create Order
Create Execution
Update Position
Update Ledger
Commit
```

## 32. Background Workers

Recommended worker responsibilities:

### Market Data Worker

- Connect to upstream provider
- Subscribe to instruments
- Validate incoming ticks
- Reconnect after failures
- Publish normalised events
- Detect stale data

### Order Matching Worker

- Monitor pending limit and stop-loss orders
- Consume relevant market ticks
- Trigger eligible orders
- Execute simulation logic
- Publish order events

### P&L Worker

- Calculate portfolio-level P&L
- Update Redis snapshots
- Store periodic database snapshots
- Broadcast changes

### Analytics Worker

- Generate daily summaries
- Calculate win rate
- Calculate average profit and loss
- Calculate drawdown
- Calculate expectancy
- Build equity curves

### Report Worker

- Generate downloadable reports
- Create monthly statements
- Export orders and trades
- Store generated files in object storage

## 33. Deployment Architecture

```text
                           Internet
                               |
                               v
                         Cloudflare
                               |
                               v
                      NGINX / Load Balancer
                               |
          +--------------------+--------------------+
          |                    |                    |
          v                    v                    v
    React Static App    FastAPI API Pods     WebSocket Pods
          |                    |                    |
          +--------------------+--------------------+
                               |
                    +----------+----------+
                    |                     |
                    v                     v
              Redis Cluster        PostgreSQL
                    |                     |
                    v                     v
             Worker Processes       Read Replica
                    |
                    v
           Market Data Connector
                    |
                    v
          External Data Provider
```

## 34. Initial Deployment Recommendation

For the first production release:

```text
Cloudflare
    |
    v
One Virtual Private Server
    |
    +-- NGINX
    +-- React Static Build
    +-- FastAPI API Container
    +-- FastAPI WebSocket Container
    +-- Market Data Worker
    +-- Order Matching Worker
    +-- Redis
    +-- PostgreSQL
```

For better reliability, use managed PostgreSQL and managed Redis instead of hosting everything on one server.

## 35. Scaling Plan

### Stage 1: MVP

Target:

```text
Up to approximately 100 concurrent users
```

Infrastructure:

- One FastAPI API instance
- One WebSocket instance
- One market-data worker
- One background worker
- One PostgreSQL database
- One Redis instance

### Stage 2: Early SaaS

Target:

```text
Approximately 1,000 concurrent users
```

Infrastructure:

- Load balancer
- Two to four API instances
- Separate WebSocket instances
- Separate market-data worker
- Multiple background workers
- Managed PostgreSQL
- Managed Redis
- Centralised logging

### Stage 3: Growth

Target:

```text
Approximately 10,000 concurrent users
```

Infrastructure:

- Horizontally scaled API services
- Dedicated WebSocket fleet
- Redis Cluster
- PostgreSQL primary and read replicas
- Worker queues
- Object storage
- Autoscaling
- Monitoring and alerting

### Stage 4: Large Scale

Target:

```text
100,000 or more concurrent users
```

Possible infrastructure:

- Kubernetes or equivalent orchestration
- Dedicated market-data processing service
- Event streaming with Kafka or Redpanda
- Redis Cluster
- Partitioned PostgreSQL
- Read replicas
- Dedicated analytics pipeline
- Data warehouse
- Regional WebSocket gateways
- Disaster-recovery environment

Do not introduce Kafka or Kubernetes before the system actually requires them.

## 36. Observability

Use:

- Structured JSON logs
- Request correlation IDs
- OpenTelemetry
- Prometheus
- Grafana
- Sentry
- PostgreSQL monitoring
- Redis monitoring
- Uptime monitoring
- Provider-latency monitoring
- WebSocket connection metrics

Important metrics:

```text
Active users
Active WebSocket connections
Ticks received per second
Tick processing latency
Stale instruments
Provider reconnections
Orders placed per second
Order execution latency
Rejected orders
P&L update latency
Database transaction latency
Redis memory usage
API error rate
Worker queue depth
```

## 37. Audit Logging

Record security-sensitive and trading-sensitive actions:

- Login
- Logout
- Password change
- OAuth connection
- Order submission
- Order modification
- Order cancellation
- Simulated execution
- Position exit
- Virtual-fund adjustment
- Account reset
- Subscription change
- Admin action
- Risk-rule change

Audit logs should be append-only.

## 38. Backup and Recovery

Recommended policy:

- Automated PostgreSQL backups
- Point-in-time recovery
- Regular restore testing
- Redis treated primarily as replaceable cache
- Object-storage versioning
- Encrypted backups
- Separate production and backup credentials
- Documented disaster-recovery procedure

## 39. Testing Strategy

### Unit Tests

Test:

- P&L calculations
- Average-price calculations
- Charge calculations
- Risk rules
- Order-state transitions
- Slippage logic
- Position netting

### Integration Tests

Test:

- Order creation
- Execution and ledger update
- Position update
- Redis price retrieval
- Database rollback
- Authentication and authorisation

### WebSocket Tests

Test:

- Connection authentication
- Subscription authorisation
- Reconnection
- Duplicate subscriptions
- Event ordering
- High connection count

### Load Tests

Use tools such as:

- k6
- Locust
- Artillery

Test:

- Concurrent logins
- Concurrent WebSockets
- Tick fan-out
- Order submission bursts
- P&L broadcast frequency

### Failure Tests

Test:

- Provider disconnection
- Redis failure
- Database timeout
- Worker restart
- Duplicate market ticks
- Out-of-order ticks
- Stale prices
- Network partition

## 40. Security Requirements

- HTTPS everywhere
- Strict CORS allowlist
- Secure security headers
- Input validation using Pydantic
- Parameterised database queries
- SQLAlchemy ORM protections
- Rate limiting
- Refresh-token rotation
- Brute-force protection
- WebSocket authentication
- Tenant-level authorisation
- Admin role separation
- Secret management
- Dependency scanning
- Container scanning
- Audit logging
- Encrypted backups
- Least-privilege database accounts

## 41. Recommended MVP Scope

Build first:

1. User registration and login
2. One paper trading account per user
3. Configurable opening virtual balance
4. NIFTY, SENSEX, and BANK NIFTY price display
5. Market and limit orders
6. Order book
7. Position book
8. Full and partial exit
9. Live realised and unrealised P&L
10. Trade history
11. Basic journal
12. Basic performance dashboard
13. Data-staleness protection
14. Admin monitoring
15. Audit logs

Build later:

- Options trading
- Advanced margin simulation
- Multi-leg strategies
- Strategy backtesting
- Social leaderboards
- AI trade review
- Broker integrations
- Mobile application
- Advanced analytics
- Public APIs

## 42. Development Phases

### Phase 1: Architecture Foundation

- Finalise domain model
- Create PostgreSQL schema
- Configure Alembic
- Configure Redis
- Implement provider abstraction
- Add structured logging
- Add error-handling middleware

### Phase 2: Market Data

- Connect to Fyers or selected provider
- Normalise ticks
- Cache latest prices
- Add stale-data detection
- Build WebSocket price streaming

### Phase 3: Paper Trading Engine

- Implement trading accounts
- Implement virtual ledger
- Implement market orders
- Implement limit orders
- Implement order state machine
- Implement position management
- Implement P&L calculation

### Phase 4: Frontend Terminal

- Build watchlist
- Build order-entry panel
- Build order book
- Build position book
- Build live P&L cards
- Build exit-order workflow
- Handle WebSocket reconnection

### Phase 5: SaaS Features

- Plans and subscriptions
- Tenant controls
- Usage limits
- Admin dashboard
- Notifications
- Audit reports

### Phase 6: Production Hardening

- Load testing
- Security testing
- Backup testing
- Monitoring
- Alerting
- Deployment automation
- Incident procedures

## 43. Final Recommended Architecture Decision

For the current version:

```text
React
   |
   v
FastAPI REST API + WebSocket Gateway
   |
   +--> PostgreSQL for durable business data
   |
   +--> Redis for live prices, events, sessions, and P&L cache
   |
   +--> Background workers for order matching and analytics
   |
   +--> One provider abstraction connected to Fyers
```

For commercial launch:

```text
Replace or formally approve the upstream source through a
market-data agreement that permits commercial SaaS redistribution.
```

## 44. Final Data Flow

```text
External Market Data
        |
        v
Market Data Connector
        |
        v
Normalisation and Validation
        |
        v
Redis Latest Price
        |
        +------------------------+
        |                        |
        v                        v
Paper Trading Engine      WebSocket Broadcast
        |                        |
        v                        v
PostgreSQL                React Frontend
        |
        v
Orders, Positions, Ledger and Reports
```

## 45. Final Summary

The platform should operate as a simulation system powered by one central market-data pipeline.

The central architectural principle is:

```text
Receive market data once,
normalise it once,
cache it once,
and distribute it internally to every authorised user.
```

The paper trading engine should remain independent of the selected broker or data vendor.

This makes the application:

- Easier to scale
- Easier to test
- Easier to maintain
- Safer during provider failures
- Ready for future provider migration
- Suitable for a multi-user SaaS model

Before charging customers for access to live market prices, confirm that the selected provider licence permits commercial redistribution.
