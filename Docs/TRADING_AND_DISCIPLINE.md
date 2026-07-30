# Trading, funds, and discipline contracts

**Verified:** 2026-07-30

This document describes application behavior, not financial advice or exchange
rules. Exchange contract values are code configuration and must be reviewed when
official specifications change.

## 1. Instrument registry

`backend/app/core/instruments.py::get_spec()` is the only authoritative contract
registry. Unknown symbols raise; callers must not invent defaults.

| Underlying | Exchange | Lot | Strike grid | Weekly | Monthly | Expiry weekday |
|---|---|---:|---:|---:|---:|---|
| NIFTY | NSE | 65 | 50 | Yes | Yes | Tuesday |
| BANKNIFTY | NSE | 30 | 100 | No | Yes | Tuesday |
| SENSEX | BSE | 20 | 100 | Yes | Yes | Thursday |

Provider expiry lists are preferred because they reflect exchange holidays and
changes. The fallback calendar is weekday-based and holiday-blind.

## 2. Trading day and execution boundary

- Execution opens at 09:15 IST and closes at 15:30 IST on weekdays.
- EOD strategy expiry and INTRADAY square-off run at 15:29.
- The trading-day boundary and stale DAY-limit cleanup run at 08:30. Before
  08:30, the effective trading day is the previous weekday.
- Daily account/open-position snapshots run at 15:35.

There is no configurable `MARKET_HOURS` discipline rule. Market hours are an
independent safety boundary in `core.utils.require_market_open()`. MARKET entry,
LIMIT placement/fill, strategy execution, manual/emergency exit, automated
exit, EOD, and expiry execution all use it. Mock quotes may display off-hours in
development but cannot weaken the execution guard.

## 3. Order vocabulary

| Concept | Values/meaning |
|---|---|
| Action | `BUY`, `SELL` |
| Option type | `CE`, `PE`; strategy legs may also be `FUT` |
| Entry type | `MARKET`, `LIMIT` |
| Product | `INTRADAY`, `NRML` |
| Open-order status | `OPEN`; closes use `CLOSED`, `SL_HIT`, or `TARGET_HIT` as applicable |
| Pending status | `PENDING`, `FILLED`, `CANCELLED`, `EXPIRED`, `REJECTED` |
| Exit reason | `MANUAL`, `EMERGENCY_EXIT`, `SL_HIT`, `TARGET_HIT`, `LIMIT_EXIT`, `EOD_SQUAREOFF` plus service-specific expiry reasons where stored |
| Setup tag | `OI_BASED`, `PRICE_ACTION`, `LEVEL_TRADE`, `EXPIRY_PLAY`, `OTHER` |

`quantity` on orders is lots. Contract units are `quantity * lot_size`. The lot
size is snapshotted onto each order/leg so later registry changes do not revalue
historical trades.

## 4. MARKET entry

`virtual_order_service.place_order()` follows this order:

1. require market open;
2. lock the user's virtual account (`FOR UPDATE`);
3. check user-scoped `client_order_id`;
4. get/create the current trading session and lock current standalone positions;
5. fetch the option chain and exact strike premium;
6. run provider-specific and generic orderability checks;
7. validate stop/target relationships;
8. run discipline rules unless in free-play;
9. calculate simulated slippage;
10. calculate margin using the user's leverage preference;
11. check available balance, calculate entry brokerage, and create order and
    position rows;
12. post margin and brokerage debits to the funds ledger and increment the
    session trade count.

The router records an audit event and commits. Only then does it publish
`order_placed`.

### LTP and slippage

The service searches the selected chain for the exact strike/type. It returns no
price when the strike is absent; it never substitutes the underlying spot for an
option premium.

The slippage model applies 0.5-1.5% to strikes within five grid intervals of ATM
and 2-4% farther away. BUY fills move upward and SELL fills downward. These are
simulation constants, not a live bid/ask execution engine.

### Margin and fees

For standalone orders:

```text
contract value = fill price × lots × snapshotted lot size
margin = contract value / 5   when leverage_enabled is true
margin = contract value       when leverage_enabled is false
```

The fee model charges a flat ₹20 per leg, 0.05% STT on SELL turnover, 0.053%
exchange charges, ₹10/crore SEBI charges, and 18% GST on brokerage plus exchange
charges. These values are source constants and require deliberate maintenance
when the simulation policy changes.

Entry brokerage is debited immediately for standalone orders. On close, the
reported round trip preserves separate entry and exit costs.

### Idempotency

`client_order_id` identifies immutable intent. Replaying the same ID and input
returns the original fill with HTTP 200 and does not reprice, re-audit, or
republish. Reusing it for different immutable intent raises a conflict. Market
fields such as observed quote, fill, and slippage are excluded from comparison.

## 5. Resting LIMIT entry

Placement uses the same market/freshness and discipline expectations, then
reserves margin priced from the quantized limit and writes `pending_orders`.
It creates neither `virtual_orders` nor `virtual_positions` until triggered.

- BUY triggers when premium is at or below the limit.
- SELL triggers when premium is at or above the limit.
- A marketable limit waits for the next five-second scan.
- Limits are DAY validity.
- Margin is released when the order fills, is cancelled, expires, or is
  rejected.

At fill time the scanner rechecks market hours/freshness and calls the MARKET
service after releasing the reservation. Discipline therefore runs twice. If
session/cooldown/loss state changed, the triggered order becomes `REJECTED` with
a reason instead of filling.

`scan_and_fill()` owns its transaction and commits each order separately so one
bad pending order cannot roll back earlier fills. A close-of-session race rolls
back the attempt and leaves it pending for another valid tick rather than
incorrectly rejecting it.

## 6. Position close

All standalone close paths serialize with the lock order:

```text
virtual account -> virtual order -> virtual position -> trading session
```

The service gets an exit premium, applies side-aware slippage, computes gross
P&L, calculates exit fees, changes the order/position to closed state, releases
margin, settles net P&L through the ledger, updates session realized P&L,
activates cooldown after `SL_HIT`, updates discipline score/streak, and creates
the journal entry.

During market hours a close may use the position's bounded `current_ltp` when a
fresh provider quote is unavailable. That deliberate availability choice does
not permit an off-hours close.

## 7. Protection and exits

### Stop loss and target

`PATCH /trading/orders/{id}/protection` replaces only `sl_price` and
`target_price` on an open, standalone, single-leg order. It uses the normal lock
order. It cannot edit strategy legs. With Discipline Mode ON and mandatory SL
enabled, the update cannot remove the SL.

### Full-position exit limit

`PATCH /trading/orders/{id}/exit-limit` creates, replaces, or cancels one exit
instruction. Saving is allowed outside market hours because no execution occurs.

- BUY position exits when premium is at or above the limit.
- SELL position exits when premium is at or below the limit.
- Stop-loss has first priority on the same tick, target second, exit limit third.
- Slippage can improve the fill but cannot make it worse than the saved limit.

### Emergency exit

The emergency endpoint selects all open standalone BUY orders joined to open
positions and closes them in one transaction using `close_position()`.
Standalone SELL positions and every strategy leg are excluded by database
predicates. An empty eligible set is a valid result.

### EOD and expiry

At 15:29, the leader closes INTRADAY positions and cash-settles expiring option
positions. NRML positions may remain open and are captured by the 15:35 daily
snapshots. Pre-market cleanup closes stranded prior-day INTRADAY state and
expires stale pending DAY orders if EOD work was missed.

## 8. Quote freshness policy

The normalized age is derived in priority order from `age_ms`, `as_of`, then
`timestamp`. Unknown age is stale in production.

| Path | Behavior |
|---|---|
| MARKET/LIMIT entry placement | Raise a quote-unavailable client error. |
| Pending fill and automatic protection trigger | Skip without changing the order; retry on another tick. |
| Manual, EOD, or expiry close | No freshness gate; market hours still apply and bounded current LTP may be used. |
| Mark-to-market display | Continue updating from the available chain; staleness pauses triggers, not display. |

Kite's 30-second order threshold is stricter than the generic 120-second
backstop. Fyers's structural cache can live for 95 seconds, which is why the
generic threshold must remain above it. Streamed Fyers LTP overlays do not
rewrite the structural REST timestamp.

## 9. Funds ledger

Every `virtual_accounts.balance` change calls `ledger_service.post()` or a typed
wrapper. The invariant per account is:

```text
balance = SUM(virtual_fund_ledger.amount)
```

`post()` takes a signed delta and records before/after balances, type,
reference, description, and sequence. A negative result raises before mutation.
Accounts start at zero and receive an `INITIAL_CREDIT`, making the first row
reconcilable.

PostgreSQL and ORM listeners prohibit UPDATE on ledger rows. DELETE remains
possible for account deletion/test teardown and intentionally produces a visible
sequence gap. Correct mistakes with a compensating `MANUAL_ADJUSTMENT`; never
rewrite history.

Transaction types are `INITIAL_CREDIT`, `TRADE_DEBIT`, `TRADE_CREDIT`, `CHARGE`,
`REFUND`, `MANUAL_ADJUSTMENT`, and `RESET`. References identify virtual orders,
pending orders, strategy positions, accounts, or manual operations.

## 10. Discipline rules

Rules are per-user JSONB rows seeded at registration.

| Rule | Default | Standalone behavior |
|---|---|---|
| `MAX_TRADES_PER_DAY` | 3 | Blocks once today's session count reaches the configured maximum. |
| `MANDATORY_SL` | enabled | Requires SL below LTP for BUY and above LTP for SELL. |
| `NO_AVERAGING_DOWN` | enabled | Blocks a new BUY in the same instrument/strike/type while that position is open. |
| `NO_DIRECTION_FLIP` | enabled | Blocks a BUY in the opposite option type while an open position exists. |
| `REVENGE_COOLDOWN` | 15 minutes | Blocks while the post-stop-loss cooldown remains active. |
| `MAX_DAILY_LOSS` | 2% | Blocks after session realized P&L reaches the negative percentage of `initial_balance`. |
| `MANDATORY_SETUP_TAG` | enabled | Requires a non-empty setup tag. |

The engine stops at and records the first failing rule. Violations are durable
records of attempted action and whether it was blocked.

Strategies deliberately evaluate only maximum trades, maximum daily loss, and
mandatory setup tag. A strategy counts as one trade; per-leg direction and
averaging checks would make valid spreads impossible.

## 11. Discipline Mode, scoring, and tiers

Mode ON is the default. Mode OFF:

- bypasses all discipline checks in execution paths;
- tops available balance up to Tier 3 capital minus already blocked margin, but
  never lowers a larger balance;
- sets tier to `TIER_3`, sets `capital_unlocked`, and raises `initial_balance` to
  keep the daily-loss denominator aligned;
- marks orders `was_free_play`.

Turning ON only re-enables rules. It does not reduce balance or tier.

On a completed non-free-play standalone trade, compliance updates the consecutive
streak. Score is compliant completed orders divided by up to the latest 20
completed non-free-play orders. Free-play trades are reported separately and do
not affect score, streak, cooldown analytics, or tier progression.

| Tier | Capital | Next unlock |
|---|---:|---|
| `TIER_1` | ₹1,00,000 | 15 consecutive compliant trades |
| `TIER_2` | ₹5,00,000 | 15 more consecutive compliant trades at the tier |
| `TIER_3` | ₹10,00,000 | Maximum tier |

## 12. Strategies

A strategy draft has 1-10 option/future legs. Execution requires market hours,
locks the account, runs the three strategy-level rules, prices the legs, computes
strategy margin and brokerage, blocks funds, creates one strategy position, and
opens/mirrors the legs.

Legs may close individually; the strategy closes when all legs are closed and
releases remaining margin. Mark-to-market runs every 15 seconds for open
strategies. Strategy entry brokerage is currently netted at strategy close,
unlike standalone order entry brokerage. This is an accepted semantic
inconsistency and must be changed only with migration/reporting tests.

## 13. Journal and snapshots

Closing a standalone order creates one journal row containing fill, P&L, fees,
setup, exit reason, compliance, attempted violations, duration, and trade date.
The trader may add an emotion tag, mistake category, thesis, review, and reviewed
flag.

At 15:35, `portfolio_snapshots` stores:

```text
equity = balance + blocked margin + unrealized P&L
```

`pnl_snapshots` stores attribution for each still-open position. Both are
derived, idempotent daily observations and may be updated on a same-day rerun;
they are not append-only ledgers.
