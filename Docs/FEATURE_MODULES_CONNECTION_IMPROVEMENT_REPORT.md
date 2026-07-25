# StrikeFluency `feature/modules-connection` Improvement Report

**Audience:** Claude Code or another implementation agent working in this repository  
**Branch reviewed:** `feature/modules-connection`  
**Repository:** `hariharan68/strikefluency`  
**Report date:** 2026-07-21  
**Purpose:** Turn the current branch into a safe, internally consistent, tested, merge-ready implementation.

---

## 1. Executive summary

This branch connects several previously separate modules: live option chains, WebSocket updates, the order ticket, user preferences, positions/books, product types (`INTRADAY` and `NRML`), and EOD lifecycle jobs. The overall direction is good, but some of the new connections currently create trading correctness risks.

The two merge blockers are:

1. Orders for a selected non-default expiry can be quoted and closed using the provider's default expiry.
2. The new floating ticket offers a `LIMIT` order even though the backend always executes it immediately as a market order.

The next most important problems are lifecycle safety and consistency:

- The Positions page ignores the user's close-confirmation preference.
- Pre-market recovery does not close stale intraday strategies.
- The stored-price recovery path still requires a live provider call.
- Later-expiry/NRML positions can be marked from the wrong WebSocket chain.
- Manual close, auto-exit, expiry settlement, and EOD jobs are not protected by a single atomic/idempotent close mechanism.
- Several preference controls are either unreliable after asynchronous loading, left optimistic after a failed save, or not connected to any behavior.

Do not add more product features before the Phase 1 and Phase 2 work in this report is complete.

---

## 2. Baseline and review evidence

At review time:

- The GitHub branch had no pull request.
- It was 5 commits ahead and 1 commit behind `main`.
- Frontend production build passed.
- Backend Python compilation passed.
- All 233 backend tests passed using `backend/venv` (Python 3.11.9).
- The frontend build emitted a bundle-size warning: the main JavaScript chunk was approximately 1.01 MB before gzip.
- Graphify structural analysis found 2,074 nodes, 4,631 relationships, and 150 code/document communities.

Passing tests do not prove the new flows are correct because the important failure modes below do not currently have regression tests.

---

## 3. Repository constraints Claude Code must preserve

Before editing, read `AGENTS.md`, `CLAUDE.md`, and the relevant README files.

Preserve these project rules:

- Keep FastAPI routers thin; business logic belongs in services.
- Keep `/api/v1` route prefixes.
- Keep the single app-wide market WebSocket mount in `AppLayout`; do not create a second market socket in pages or `TopBar`.
- Preserve per-user and per-tenant scoping.
- Treat frontend order quantity as lots, not raw units.
- Never trust a client-provided LTP as the authoritative fill price.
- Never commit `.env`, broker credentials, token files, logs, or secrets.
- Keep the compact trading-workstation design.
- Preserve existing user changes and unrelated working-tree changes.

---

## 4. Target architecture

All order and position flows should use one contract identity:

```text
(instrument, expiry_date, strike_price, option_type)
```

The expiry must never be omitted once an order is being quoted, marked, auto-exited, or closed.

The desired state flow is:

```text
UI selection
  -> validated PlaceOrderRequest
  -> expiry-aware provider quote
  -> discipline and margin checks
  -> atomic order + position creation
  -> committed DB transaction
  -> per-user trading_update event
  -> clients refetch authoritative REST state
```

The desired close flow is:

```text
manual close / SL / target / expiry / EOD / pre-market recovery
  -> one idempotent close service
  -> row locked or atomically claimed
  -> expiry-aware quote OR explicit stored recovery price
  -> P&L + brokerage calculated once
  -> margin released once
  -> journal created once
  -> transaction committed
  -> per-user trading_update event
```

---

## 5. Phase 1 — merge blockers and trading correctness

Complete this phase before any UI polish or new feature work.

### 5.1 Make all option pricing expiry-aware

**Problem**

`backend/app/services/virtual_order_service.py` reads `expiry_date` from the request but currently calls:

```python
provider.get_option_chain(instrument)
```

The same omission occurs during close. This means the provider can return the nearest/default expiry while the database stores another expiry.

The problem also exists in `auto_exit_service.py`, which groups orders only by instrument. With `NRML` and later-expiry positions, multiple expiries can be open simultaneously.

Frontend live P&L has the same conceptual problem because `marketStore.chains` is keyed only by instrument.

**Required backend changes**

Files:

- `backend/app/services/virtual_order_service.py`
- `backend/app/services/auto_exit_service.py`
- `backend/app/market/base.py`
- provider implementations under `backend/app/market/`
- relevant mocks and tests

Tasks:

1. Add a small canonical expiry converter, for example:

   ```python
   def provider_expiry(value: date | str | None) -> str | None:
       return value.isoformat() if isinstance(value, date) else value
   ```

2. In `place_order()`, call the provider with the requested expiry.
3. In `close_position()`, call the provider with `order.expiry_date`.
4. Verify that the returned chain represents the requested expiry when the provider includes expiry metadata. Raise `QuoteUnavailableError` if it does not.
5. Change auto-exit batching from `instrument` to `(instrument, expiry_date)`.
6. Cache one chain per `(instrument, expiry_date)` during an auto-exit scan.
7. Ensure strategy pricing paths already pass each leg's expiry; fix any path that does not.
8. Do not fall back from one expiry to another silently.

**Required frontend changes**

Files:

- `frontend/src/store/marketStore.js`
- `frontend/src/utils/livePnl.js`
- `frontend/src/pages/positions/PositionsPage.jsx`
- `frontend/src/pages/trading/TradingDeskPage.jsx`
- `frontend/src/pages/optionchain/OptionChainPage.jsx`

Tasks:

1. Introduce a canonical chain key such as:

   ```js
   const chainKey = (instrument, expiry) => `${instrument}:${expiry || 'default'}`
   ```

2. Store default broadcast chains without pretending they cover every expiry.
3. Before deriving live LTP for a position, confirm that the chain's expiry matches the position's `expiry_date`.
4. If a matching chain is unavailable, use the last server mark rather than a different expiry's LTP.
5. Optionally add an expiry-specific REST refresh for open later-expiry positions. Do not create one WebSocket per expiry.
6. Keep the default-chain alias needed by the Trading Desk and Terminal, but make its meaning explicit.

**Acceptance criteria**

- A later-expiry order is filled using that later expiry's premium.
- Closing the order uses the same expiry.
- Auto-exit checks the correct expiry.
- A default-expiry WebSocket frame cannot change the displayed P&L of a later-expiry position.
- A provider expiry mismatch produces a controlled error and no DB mutation.

### 5.2 Remove the fake LIMIT order path

**Problem**

`FloatingOrderTicket.jsx` offers `MARKET` and `LIMIT`, but the submitted request has no `order_type` and the backend always fetches the live quote and executes immediately.

**Recommended merge-safe solution**

Remove or disable the `LIMIT` selector for this branch. Show only `MARKET` until a real pending-order lifecycle is designed.

Files:

- `frontend/src/components/trading/FloatingOrderTicket.jsx`
- any related CSS or tests

Tasks:

1. Remove the `orderType` state and Limit button.
2. Remove editable `limitPrice` behavior.
3. Keep the displayed market premium read-only.
4. Continue allowing the backend to obtain the authoritative quote.
5. Add UI text such as `Market order — fills at current option premium`.

**Do not implement a partial limit-order solution.** A real limit order requires:

- a pending order status;
- reservation/cancellation semantics;
- a trigger worker;
- partial/failed fill behavior;
- market-session rules;
- idempotent execution;
- corresponding API, DB migration, UI, and tests.

That should be a separate feature branch.

**Acceptance criteria**

- No UI suggests that a limit order can be placed.
- Every visible order mode matches actual backend behavior.

### 5.3 Validate order data consistently

Files:

- `backend/app/schemas/virtual_order.py`
- `backend/app/services/virtual_order_service.py`
- `frontend/src/components/trading/OrderFormPanel.jsx`
- `frontend/src/components/trading/FloatingOrderTicket.jsx`

Tasks:

1. Use strict schema validation for known fields; decide explicitly whether unknown fields are forbidden.
2. Remove client fields the backend does not use (`ltp`, `notes`) or formally add them with documented semantics.
3. Validate that expiry is not in the past.
4. Validate that the selected strike exists in the requested expiry's chain.
5. Validate SL/target direction for both BUY and SELL when risk warnings or discipline rules require it.
6. Keep the server authoritative even if frontend validation passes.

---

## 6. Phase 2 — atomic closing, EOD, and recovery safety

### 6.1 Make closing idempotent and concurrency-safe

**Problem**

Manual close, auto-exit, strategy square-off, EOD square-off, and expiry settlement can target the same position. Checking `status == OPEN` in application code is not sufficient when two DB sessions race.

Files:

- `backend/app/services/virtual_order_service.py`
- `backend/app/services/strategy_execution_service.py`
- `backend/app/services/auto_exit_service.py`
- `backend/app/services/eod_service.py`

Tasks:

1. Lock the order row before closing using `SELECT ... FOR UPDATE`, or atomically claim it with an update conditioned on `status = OPEN`.
2. Apply the same protection to `StrategyPosition` and strategy lifecycle state.
3. Ensure only the successful claimant can:
   - release margin;
   - apply P&L;
   - increment/decrement session values;
   - create the journal entry;
   - send the event.
4. Preserve `OrderAlreadyClosedError` for the losing request.
5. Add a unique journal-entry constraint test and verify no duplicate entry can be created.
6. Do not swallow a DB error and continue using a failed SQLAlchemy transaction. Roll back to a savepoint or fail the batch transaction cleanly.

**Acceptance criteria**

- Concurrent manual and automatic closes settle exactly once.
- Balance and margin are correct after repeated close attempts.
- One order produces at most one journal entry.

### 6.2 Fix pre-market reset for all intraday products

**Problem**

`premarket_reset()` currently finds only standalone `VirtualOrder` rows. It omits `StrategyPosition` rows, despite the service documentation promising to recover every stale intraday position.

Files:

- `backend/app/services/eod_service.py`
- `backend/app/services/strategy_execution_service.py`
- `backend/app/market/market_scheduler.py`

Tasks:

1. Query stale open `StrategyPosition` records whose parent strategy is `INTRADAY`.
2. Close them through the normal strategy close service.
3. Use stored marks in pre-market recovery; do not require a live chain at 08:30.
4. Decide how to handle a missing stored mark:
   - preferred: use the latest persisted non-null mark;
   - fallback: use entry price and emit a high-severity audit log;
   - never use underlying spot as option premium.
5. Notify affected users after the transaction commits.
6. Add a recovery summary log containing counts by standalone order and strategy.

**Acceptance criteria**

- A missed EOD run is recovered at 08:30 for both standalone and strategy positions.
- No stale intraday strategy survives into the new trading day.
- Recovery works while the market provider is unavailable.

### 6.3 Do not fetch a provider chain when an explicit recovery price is supplied

**Problem**

`close_position()` fetches a chain before checking the supplied `exit_ltp`. This defeats the stored-price pre-market path.

Tasks:

1. Split quote resolution from settlement.
2. If `exit_ltp` is explicitly supplied by a trusted backend caller, do not fetch the provider.
3. Pass an appropriate ATM reference into slippage logic without requiring a chain. For recovery settlement, document whether slippage should be zero or based on the stored strike/ATM snapshot.
4. Never expose this trusted-price override directly to an untrusted public API request.

### 6.4 Ensure the scheduler runs only once in production

**Problem**

The scheduler is started in FastAPI lifespan. If production runs multiple workers or replicas, every process can execute EOD and auto-exit jobs.

Files:

- `backend/app/main.py`
- `backend/app/market/market_scheduler.py`
- deployment documentation/configuration

Choose one design:

1. Run the scheduler as a dedicated single worker/process; or
2. Add a PostgreSQL advisory lock/distributed lease around each trading lifecycle job.

For this project, a PostgreSQL advisory lock is acceptable if documented and tested. The lock must be released automatically if the process dies.

**Acceptance criteria**

- Two app workers cannot both settle the same EOD batch.
- The API continues serving if the scheduler lock is held elsewhere.

### 6.5 Clarify the trading-day boundary

`current_trading_day()` subtracts one calendar day before 08:30. That is not always the previous trading day on Mondays or after holidays.

Tasks:

1. Decide the intended UX:
   - logical calendar boundary only; or
   - actual previous exchange trading day.
2. If actual trading-day semantics are required, add an exchange calendar abstraction covering weekends and holidays.
3. Use the same abstraction in orderbook filters, EOD recovery, and tests.
4. Update comments so they do not claim exchange-calendar behavior if only a calendar cutoff is implemented.

---

## 7. Phase 3 — preferences and user-action consistency

### 7.1 Respect close confirmation everywhere

**Problem**

Trading Desk respects `confirm_close`; the new Positions page closes single positions and strategies immediately.

Files:

- `frontend/src/pages/positions/PositionsPage.jsx`
- `frontend/src/pages/trading/TradingDeskPage.jsx`
- preferably a new shared confirmation component/hook

Tasks:

1. Read `prefs.confirm_close` on the Positions page.
2. Gate both `closeOrder()` and strategy `squareOff()` behind confirmation.
3. Use one shared confirmation component so wording and keyboard behavior match.
4. Disable the confirm button during submission.
5. Show the contract/strategy, side, lots, product type, and current mark in the dialog.
6. Do not use a fragile one-click/two-click button state that resets on blur.

**Acceptance criteria**

- With confirmation enabled, no close or square-off API call occurs before confirmation.
- With it disabled, the action remains one click.

### 7.2 Apply `default_lots` after preferences load

**Problem**

The floating ticket hardcodes one lot. `OrderFormPanel` reads the preference only during initial state creation, commonly before `AppLayout` finishes loading settings.

Files:

- `frontend/src/components/trading/FloatingOrderTicket.jsx`
- `frontend/src/components/trading/OrderFormPanel.jsx`
- `frontend/src/store/preferencesStore.js`

Tasks:

1. Initialize both forms from `prefs.default_lots`.
2. When settings finish loading, update lots only if the user has not manually edited the field.
3. Clamp to the server-supported range of 1–50.
4. Add an explicit dirty/touched ref to avoid overwriting user input.

### 7.3 Roll back failed optimistic preference saves

**Problem**

`preferencesStore.save()` applies the patch locally before the request and never restores the previous state when the request fails.

Tasks:

1. Capture the previous preference object.
2. Apply the optimistic patch.
3. On failure, restore the previous object and rethrow.
4. Track `saving` and `saveError` centrally if multiple settings sections can save concurrently.
5. Prevent one settings section's successful save from overwriting unsaved edits in another section.
6. Add tests for network failure and validation failure.

This is especially important for `leverage_enabled`, because frontend margin estimates can otherwise disagree with server enforcement.

### 7.4 Wire or remove notification settings

The following values are persisted but currently have no behavioral consumer:

- `notify_discipline`
- `notify_cooldown`
- `notify_daily_loss`

Choose one of these approaches:

1. Implement the advertised behavior; or
2. Remove/disable the controls until the notification system exists.

Recommended implementation:

- Keep blocking discipline errors visible even if notifications are disabled.
- Use the toggles only to control optional toasts/banners.
- Evaluate preferences in one notification helper rather than scattered conditional statements.
- Add a daily-loss threshold event only when the threshold is crossed, not on every tick.

### 7.5 Harden the user-settings service

Files:

- `backend/app/routers/settings.py`
- `backend/app/models/user_settings.py`
- a new `backend/app/services/user_settings_service.py` if needed

Tasks:

1. Move get/create/merge logic out of the router into a service.
2. Handle concurrent first requests safely with an upsert or `IntegrityError` retry.
3. Decide whether GET should create a DB row. A read-only GET that returns defaults without inserting is simpler.
4. Keep stored JSON validated through the Pydantic schema.
5. Add a forward-compatible policy for removed or renamed keys.
6. Decide whether leverage applies to strategy margin as well as standalone orders, then enforce and document that decision consistently.

---

## 8. Phase 4 — real-time state, books, and frontend resilience

### 8.1 Track freshness per instrument and expiry

`marketStore.lastUpdate` is global. A successful NIFTY frame can make BANKNIFTY look fresh even if BANKNIFTY updates are failing.

Tasks:

1. Track `updatedAt` per chain key.
2. Determine LIVE/stale state using the chain actually displayed.
3. Use per-instrument fallback REST polling.
4. Keep `market_status` freshness independent from chain freshness.

### 8.2 Make Positions page failures visible

The page currently catches individual API failures and substitutes empty data. A server error can therefore look like `No open positions`.

Tasks:

1. Store per-resource error state or one page-level partial-failure state.
2. Show a retryable warning when positions, strategies, books, or violations fail.
3. Preserve successfully loaded sections.
4. Never display an empty-state message as if it were authoritative after a failed request.

### 8.3 Add book pagination and accurate counts

The Positions page loads the first page only, while tab badges use loaded-array lengths.

Tasks:

1. Read and display API `total` values.
2. Add pagination or incremental loading for orderbook and tradebook.
3. Keep activity log construction clear about whether it represents the current page or the full day.
4. Exclude `CANCELLED` orders from the executed tradebook unless the product definition explicitly considers them trades.

### 8.4 Complete WebSocket event coverage

Tasks:

1. Send `trading_update` after committed EOD, expiry, and pre-market actions.
2. Include only a reason and timestamp; REST remains authoritative.
3. Deduplicate frontend refetches when multiple events arrive in one batch.
4. Confirm dead sockets are removed from both global and per-user registries.
5. Add tests for multiple tabs and a dead socket in only one tab.

### 8.5 Harden WebSocket authentication for production

The access token currently travels in the WebSocket query string. Query strings can appear in proxy or access logs.

Preferred long-term options:

- secure same-site cookie authentication; or
- a short-lived, single-use WebSocket ticket obtained over authenticated REST.

If query-token authentication remains temporarily:

- redact query strings from logs;
- use `wss` in production;
- keep token lifetime short;
- validate origin;
- ensure reconnect always reads the current token.

### 8.6 Reduce the frontend bundle

The build succeeds but produces an approximately 1 MB main chunk.

Tasks:

1. Convert large route components to `React.lazy()` and `Suspense`.
2. Prioritize marketing pages, analytics charts, Strategy Builder, Positions, and Option Chain.
3. Consider a chart-library vendor chunk.
4. Verify route navigation, error boundaries, and protected-route loading after splitting.
5. Set a documented bundle budget in CI.

Suggested target: initial app chunk under 500 KB before gzip, without hiding warnings by simply increasing the Vite threshold.

---

## 9. Database and migration cleanup

Files:

- `backend/migrations/versions/20260720_1674dd5f928c_what_changed.py`
- `backend/migrations/versions/20260721_trading_day_product.py`
- `backend/migrations/versions/20260721_user_settings.py`
- affected SQLAlchemy models

Tasks:

1. Rename or replace the vague `what_changed` migration with a descriptive migration.
2. Re-evaluate dropping `idx_virtual_orders_strategy_id`. Strategy leg close logic queries by `strategy_id`; retaining the index is likely appropriate.
3. Ensure model metadata and migrations agree, so future autogeneration does not repeatedly add/drop the same indexes.
4. Consider an index supporting open-order scans by status, instrument, and expiry.
5. Add a migration test that upgrades from the previous head to the new head.
6. Add a downgrade smoke test for the new migrations in an isolated database.
7. Do not rewrite migrations already applied in shared environments. If they have been applied, add corrective migrations instead.

---

## 10. Required test plan

### 10.1 Backend unit tests

Add or extend tests for:

- selected expiry passed to provider on placement;
- selected expiry passed on close;
- provider expiry mismatch rejected;
- auto-exit grouping by `(instrument, expiry_date)`;
- explicit `exit_ltp` path performs no provider call;
- pre-market standalone recovery;
- pre-market strategy recovery;
- EOD idempotency;
- concurrent close settles once;
- one journal per order;
- trading-day boundary around 08:30;
- Monday/weekend behavior according to the chosen policy;
- concurrent user-settings initialization;
- notification preference policy if implemented.

Recommended new files:

- `backend/tests/unit/test_expiry_aware_orders.py`
- `backend/tests/unit/test_eod_service.py`
- `backend/tests/integration/test_close_idempotency.py`
- extend `backend/tests/integration/test_user_settings.py`

### 10.2 Frontend tests

If no test framework is configured, add Vitest and React Testing Library in a focused setup. Cover:

- floating ticket exposes Market only;
- `default_lots` applies after async settings load;
- manually edited lots are not overwritten;
- confirmation enabled blocks API call until confirmed;
- confirmation disabled closes directly;
- failed preference save rolls back UI state;
- later-expiry position ignores a mismatched default-expiry chain;
- API failure shows an error rather than a false empty state;
- notification toggles control the intended optional UI.

### 10.3 Integration scenarios

1. Place a nearest-expiry order and close it.
2. Place a later-expiry NRML order and verify the quote, live mark, SL/target evaluation, and close all use the same expiry.
3. Simulate a missed 15:29 job, then run pre-market recovery with the provider disabled.
4. Race manual close against auto-exit and verify a single settlement.
5. Run two scheduler instances and verify only one obtains the job lock.
6. Open two browser tabs and verify targeted trading updates reach both.

### 10.4 Verification commands

From the repository root:

```powershell
backend\venv\Scripts\python.exe -m pytest -q backend\tests
backend\venv\Scripts\python.exe -m compileall -q backend\app
cd frontend
npm run build
```

If frontend tests are added:

```powershell
npm run test -- --run
```

---

## 11. Recommended implementation sequence and commits

Keep changes reviewable. Do not implement everything in one commit.

### Commit 1 — expiry-safe market execution

- Make placement, close, auto-exit, and strategy pricing expiry-aware.
- Prevent mismatched WebSocket chains from marking later-expiry positions.
- Add backend and frontend regression tests.

Suggested message:

```text
fix: make option pricing expiry-aware end to end
```

### Commit 2 — remove unsupported limit-order UI

- Remove Limit mode from the floating ticket.
- Clean unused state and validation.
- Add UI tests.

Suggested message:

```text
fix: expose only supported market order flow
```

### Commit 3 — atomic close and lifecycle recovery

- Add row locking/atomic claim.
- Fix pre-market strategy recovery.
- Add trusted stored-price close path.
- Add scheduler singleton/lock protection.
- Notify after commit.

Suggested message:

```text
fix: make position settlement idempotent and recoverable
```

### Commit 4 — preference consistency

- Apply default lots correctly.
- Add confirmation to Positions.
- Roll back failed saves.
- Wire or remove notification toggles.
- Harden settings creation.

Suggested message:

```text
fix: apply trading preferences consistently
```

### Commit 5 — frontend resilience and performance

- Per-chain freshness.
- Visible partial-load errors.
- Book pagination and totals.
- Route code splitting.
- Documentation updates.

Suggested message:

```text
refactor: improve live state resilience and route loading
```

After each commit, run the relevant targeted tests. Before pushing, run the complete verification commands.

---

## 12. Definition of done

The branch is ready to merge only when all of the following are true:

- [ ] Every option quote and mark uses the exact requested expiry.
- [ ] No unsupported Limit order appears in the UI.
- [ ] Manual, automatic, EOD, and recovery closes settle exactly once.
- [ ] Pre-market recovery handles standalone and strategy positions without live market data.
- [ ] Multiple app workers cannot run the same lifecycle job concurrently.
- [ ] `confirm_close` applies on every user-triggered close/square-off surface.
- [ ] `default_lots` works after a direct page reload.
- [ ] Failed settings saves visibly roll back.
- [ ] Every displayed notification preference has implemented behavior or is removed.
- [ ] Later-expiry positions never consume default-expiry WebSocket marks.
- [ ] API failures do not appear as valid empty states.
- [ ] Books show accurate totals and have a pagination path.
- [ ] Migration upgrade smoke test passes.
- [ ] All backend tests pass.
- [ ] Frontend tests pass if configured.
- [ ] Frontend production build passes.
- [ ] README/API documentation reflects product types, settings, WebSocket frames, and lifecycle jobs.
- [ ] The branch is updated with the current `main` and conflicts are resolved.

---

## 13. Claude Code execution prompt

Use the following prompt when handing this report to Claude Code:

```text
Read AGENTS.md, CLAUDE.md, and Docs/FEATURE_MODULES_CONNECTION_IMPROVEMENT_REPORT.md.

Work on feature/modules-connection. Implement the report phase by phase, beginning with Phase 1 only. Do not add unrelated features. Preserve the existing FastAPI service-layer architecture, the single AppLayout WebSocket, multi-tenant scoping, lot-based quantities, and the compact trading UI.

For each phase:
1. Inspect the listed files and current tests.
2. State the exact files you will change.
3. Implement the smallest complete solution.
4. Add regression tests for every corrected failure mode.
5. Run targeted tests, then the full backend suite and frontend build.
6. Report results and any remaining risks before moving to the next phase.

Important safety requirements:
- The provider quote must use the order's exact expiry.
- Never treat underlying spot as option premium.
- Do not expose a fake Limit order.
- Settlement and margin release must be idempotent.
- Recovery prices supplied by trusted backend jobs must not require a provider fetch.
- Do not create another market WebSocket.
- Do not commit secrets or local token/log files.

Start with Phase 1: expiry-aware pricing and removal of unsupported Limit order UI.
```

---

## 14. Lower-priority improvements after merge blockers

These are valuable but should not delay the correctness work:

- Add accessible labels, focus trapping, and keyboard support to dialogs and floating ticket controls.
- Reset the app error boundary automatically when route location changes.
- Replace silent catches with structured logging or user-visible errors.
- Add observability counters for provider failures, auto-exits, EOD closures, recovery closures, and dropped WebSocket pushes.
- Add a production health check that reports scheduler leadership separately from API health.
- Add CI checks for backend tests, frontend build/tests, migration upgrade, and bundle budget.
- Document market-data freshness and fallback behavior for users.

These improvements should follow, not replace, the Phase 1–3 safety work.
