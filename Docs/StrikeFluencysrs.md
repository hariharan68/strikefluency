# StrikeFluency — Product Requirements Document (v1.0)

**Product name:** StrikeFluency
**Author:** Hari
**Purpose:** Transform amateur options traders into disciplined traders through a zero-risk virtual ecosystem combining realistic simulation, structured skill progression, and enforced discipline.

---

**Tagline:** *Become fluent in the strike zone — before you trade with real money.*

## 1. Vision Statement

Most paper trading tools only simulate P&L. They don't simulate the *psychology* of trading — the temptation to average down, revenge trade, or abandon a plan mid-trade. This product is a full ecosystem: realistic virtual markets + a discipline enforcement layer + structured skill progression, so a trader only "graduates" to real capital once they've demonstrably earned it.

**Target users:** Amateur to intermediate Indian retail options traders (NIFTY/BANKNIFTY/SENSEX focus), from day one — not just personal use.

---

## 2. Core Design Decisions (locked in)

| Decision | Choice |
|---|---|
| Data mode | Both **live real-time** and **historical replay** |
| Audience | Multi-user, multi-tenant SaaS from day one |
| Primary instruments | NIFTY, BANKNIFTY, SENSEX weekly options |
| Capital model | Fully virtual, tiered progression |

---

## 3. Core Modules

### 3.1 Virtual Trading Engine
- Virtual order execution against real option chain prices (live tick data via Kite) or historical replay data
- Order types: CE/PE buy/sell, multi-leg (straddle, strangle, Iron Condor, Iron Butterfly, spreads)
- Realistic simulation: brokerage, slippage, bid-ask spread modeling — P&L should feel real, not idealized
- Each user has an isolated virtual capital ledger (per-tenant)

### 3.2 Live Mode
- Real-time NIFTY/SENSEX/BANKNIFTY option chain via Kite ticker (WebSocket) — reuses existing scaffold
- Market-hours gated; live OI, PCR, walls
- Virtual orders fill against live LTP with simulated slippage

### 3.3 Historical Replay Mode
- Requires a historical option-chain snapshot store (new component — doesn't exist yet)
- User selects a past date; system replays that day's option chain tick-by-tick or candle-by-candle
- Adjustable playback speed (1x, 5x, instant-to-candle-close)
- Same order execution logic as live mode, against replayed prices

**New infra needed:** a daily ingestion job that captures and stores option chain snapshots (OI, LTP, IV, volume) at regular intervals for later replay. This is the single biggest new build — everything else assembles from things you've already built.

### 3.4 Strategy Builder
- Form-based (not full visual/no-code initially — scope creep risk) strategy definition:
  - Strategy type: OI-based, price-action-based, indicator-based (EMA/RSI/VWAP), or manual discretionary
  - Entry conditions, exit conditions (SL/target), position sizing rules
  - Reuses logic from your existing OpenAlgo ORB bot and EMA+VWAP+RSI strategy
- Strategies can be tested against historical replay before being "deployed" in live virtual mode

### 3.5 Discipline Engine (core differentiator)
Productizes your existing paper-trading-discipline skill:
- Configurable rule set (defaults to your 7 iron rules): max trades/day, mandatory SL, no averaging down, no direction flipping mid-trade, no revenge trading (cooldown after a loss), max daily loss cap
- Real-time rule enforcement: blocks or warns on violation attempts
- **Discipline Score**: rolling metric based on rule adherence
- **15-consecutive-disciplined-trade** gate — required to unlock next virtual capital tier
- This is the feature that makes the product a *system*, not just a simulator — protect this in scope, don't let it get cut for "MVP speed"

### 3.6 Trading Journal (auto-populated)
- Every virtual trade auto-logs: entry/exit, setup tag, P&L, discipline rule adherence
- User adds: emotion tag, mistake category, notes
- Weekly/monthly auto-generated review summaries (win rate, most common mistake, discipline trend)

### 3.7 Analytics & Feedback Layer
- OI analysis, PCR, max pain, Put/Call walls (from Alphalytic AI patterns)
- Post-trade feedback: e.g., "entered against 3-day PCR trend," "ignored PE wall resistance"
- Confidence scoring on setups pre-entry

### 3.8 Progression & Gamification
- XP and skill tree: Options Basics → OI Reading → Price Action → Multi-leg Strategies → "Certified for Live Capital"
- Virtual capital tiers unlock via discipline score, not just time spent (₹1L → ₹5L → ₹10L virtual)
- Streaks or badges tied to discipline adherence, not just profit (important — don't gamify raw P&L, that reinforces the wrong behavior)

### 3.9 Community/Cohort Layer (Phase 5, later)
- Optional leaderboards — **design carefully**: rank by discipline score/consistency, not raw returns, or you'll reward the exact reckless behavior the product exists to fix
- Mentor review of journals (future monetization angle)

---

## 4. Technical Architecture

**Stack (consistent with your existing projects):**
- Backend: FastAPI
- Database: PostgreSQL, multi-tenant schema (directly extends the TenantContext/BrokerAdapter work already in progress on Strikfin)
- Real-time data: Kite ticker via WebSockets (existing scaffold)
- Historical data: new ingestion pipeline + time-series-friendly storage (consider TimescaleDB extension on Postgres, or partitioned tables)
- Frontend: React (component patterns from Alphalytic AI)
- Auth: multi-tenant user auth (JWT, consistent with your ASP.NET Core learning if you bring any of that in, though FastAPI-native JWT is simpler here)

**Key new components vs. what you already have:**
| Component | Status |
|---|---|
| Multi-tenant DB schema | In progress (Strikfin M0-M2 done) |
| Live option chain via Kite WS | Already scaffolded |
| Discipline rule engine | Already exists as a skill — needs productizing into API + UI |
| Journal auto-logging | TradersBook V2 exists — needs integration, not rebuild |
| Strategy logic (ORB, EMA/VWAP/RSI) | Already coded for OpenAlgo — needs adapting to virtual engine |
| Historical option chain data store + replay engine | **New — biggest lift** |
| Virtual order matching/execution engine | **New** |
| Gamification/XP system | SkillForge OS design exists — needs adapting |

---

## 5. Phased Roadmap

| Phase | Deliverable | Primary new work |
|---|---|---|
| **Phase 1 (MVP)** | Live-mode virtual trading + auto-journal + discipline engine, single instrument (NIFTY) | Virtual order engine, discipline engine productization |
| **Phase 2** | Historical replay mode | Data ingestion + replay engine |
| **Phase 3** | Strategy builder + backtesting against replay | Adapt existing strategy code |
| **Phase 4** | Gamification + skill tree + capital tiers | Adapt SkillForge OS |
| **Phase 5** | Analytics/AI feedback layer | Adapt Alphalytic AI |
| **Phase 6** | Community/cohort features, mentor review | New |

**Recommendation:** Do not attempt all modules at once. Phase 1 alone, done well, is a legitimate product people would pay for — get real users on it before building Phase 2+.

---

## 6. Open Questions to Resolve Before Coding Starts

1. **Monetization model**: freemium (free tier with 1 instrument, paid tier unlocks SENSEX/BANKNIFTY + strategy builder)? Flat subscription? Pay only after "graduating" to real capital?
2. **Historical data sourcing**: does Kite's API provide sufficient historical option chain depth, or do you need a third-party data vendor (this affects Phase 2 cost and timeline significantly)?
3. **Regulatory/compliance angle**: since this is *virtual* money only, SEBI advisory registration shouldn't apply, but worth a quick sanity check once you're taking payments from other users, especially if you start giving trade "signals" of any kind.
4. **Onboarding flow**: does a new user start at the bottom of the skill tree always, or can they self-assess and skip ahead?

---

## 7. Immediate Next Steps

1. Finalize Phase 1 scope precisely (this doc gives direction, but the MVP feature list needs to be nailed to a checklist)
2. Design the DB schema for: virtual accounts, virtual orders/positions, discipline rules, journal entries (multi-tenant from the start)
3. Decide on historical data sourcing (blocks Phase 2 planning)
4. Decide monetization model (affects tiering/gating logic in the discipline engine)