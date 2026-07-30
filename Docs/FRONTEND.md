# Frontend engineering guide

**Verified:** 2026-07-30

**Runtime:** React 18.2, Vite 5, JavaScript/JSX (no TypeScript)

## 1. Application composition

`src/main.jsx` mounts `App` inside `React.StrictMode`. `src/App.jsx` owns:

- global toast context;
- browser routing;
- a module-deduplicated auth bootstrap;
- scroll restoration;
- lazy loading with one Suspense fallback;
- a render error boundary;
- authenticated layout and admin role guards.

All routed page modules are lazy imports. Public pages use a transition layout;
protected pages pass through `ProtectedRoute` and `AppLayout`. `/admin` also
passes through `AdminRoute`. These guards improve UX but do not replace backend
authorization.

## 2. Route inventory

### Public routes

| Route | Page |
|---|---|
| `/` | Landing |
| `/product` | Product overview |
| `/discipline-engine` | Discipline information |
| `/scope` | Product scope |
| `/docs` | Public product documentation page |
| `/blog` | Blog page |
| `/varsity` | Education page |
| `/pricing` | Pricing page; billing is not implemented |
| `/login` | Password/OAuth login |
| `/register` | Registration and optional tenant join |
| `/auth/oauth-callback` | Frontend completion after server OAuth callback |

### Protected routes

| Route | Behavior |
|---|---|
| `/dashboard` | Account, session, position, discipline, and analytics overview. |
| `/terminal-1` | Three-index spot terminal with WS-first and REST-fallback metrics. |
| `/positions` | Open-position management and emergency exit. |
| `/option-chain` | Enriched option-chain intelligence. |
| `/tools` | Placeholder; no tools implemented. |
| `/trading` | Dense order, pending order, position, and tradebook workspace. |
| `/strategy-builder` | Templates, legs, payoff, analytics, saved work, and paper execution. |
| `/discipline` | Rules, score, violations, and progress. |
| `/discipline-mode` | Master mode explanation and toggle. |
| `/journal` | Journal list; entry details are rendered within journal components. |
| `/analytics` | Summary and trend charts. |
| `/settings` | Profile, preferences, sessions, brokers, and appearance. |
| `/admin` | Admin-only read surface. |
| `/api-key` | Placeholder; credential management is not implemented. |
| `/reports` | Placeholder; generated reports are not implemented. |

The catch-all route `*` redirects unknown paths to `/`.

## 3. State ownership

| Store | Durable? | Responsibility |
|---|---|---|
| `authStore` | User profile in `localStorage`; access token memory-only | Auth initialization, user, access token mirror, auth epoch, logout safety. |
| `marketStore` | No | Chains by instrument, status, broker state, metrics, analytics, arrival timestamps. |
| `tradingStore` | No | `eventSeq` and last trading-event reason used to trigger REST reloads. |
| `preferencesStore` | Server-backed | Complete defaults, one-time load, optimistic save, server-confirmed merge. |

Page-local UI state remains in components. REST data is generally loaded by
domain hooks/pages rather than copied into a global entity cache.

## 4. Authentication lifecycle

The access token is stored in a module variable in `authStore.js`; it is never
written to `localStorage`. The persisted `sf_user` profile supports initial UI
shape but does not establish authentication.

On page load:

1. `AuthBootstrap` creates one module-scoped refresh promise;
2. `authApi.refresh()` calls `refreshAccessToken()`, which rotates the cookie and
   installs the returned access token before any follow-up;
3. `/auth/me` loads the authoritative user;
4. the store becomes initialized and authenticated, or clears auth on failure.

The Axios response interceptor single-flights one refresh for concurrent 401s
and retries each non-auth request at most once. An auth epoch prevents a refresh
that started before logout from installing a late token. Browser back-forward
cache restoration forces a reload so a stale protected screen is revalidated.

Do not change `api/auth.js::refresh()` to use the raw Axios client. That loses
the new in-memory token and can rotate the single-use cookie twice during
bootstrap.

## 5. API client organization

`src/api/client.js` creates one credentialed Axios client. With no explicit
base URL it calls `/api/v1`, which Vite/ingress must proxy.

Domain modules mirror backend surfaces:

- `auth.js`, `oauth.js`, `broker.js`;
- `market.js`, `options.js`;
- `trading.js`, `strategy.js`;
- `discipline.js`, `journal.js`, `analytics.js`;
- `settings.js`, `admin.js`.

Keep transport details here rather than scattering URL construction through
components. Abort signals are supported by selected long-running analytics and
strategy simulation calls.

## 6. WebSocket behavior

`useMarketWebSocket()` derives `ws`/`wss` from the REST base and appends the
current access JWT as a query parameter. It:

- connects only while authenticated;
- uses exponential reconnect backoff from 1 to 15 seconds plus jitter;
- sends `ping` every 15 seconds;
- closes a half-open socket after 30 seconds without any frame/ack;
- fetches the latest access token for each reconnect;
- updates `marketStore` for market frames;
- bumps `tradingStore.eventSeq` for `trading_update`.

Frame types are `option_chain`, `market_status`, `broker_status`,
`option_metrics`, `option_analytics`, `trading_update`, and server `ack`.
Trading events are notify-then-refetch; do not derive balances or positions from
the event itself.

## 7. Error and loading behavior

Use `getApiErrorMessage()` or `toDisplayMessage()` from `utils/apiError.js`.
FastAPI 422 responses can contain arrays of objects; rendering raw `detail`
causes a React render failure. The root `AppErrorBoundary` provides a recovery
screen, but component-level error messages should prevent reaching it.

Preserve request cancellation and stale-response guards on pages that refetch
when instruments, periods, or WebSocket events change. A previous request must
not overwrite a newer selection.

## 8. Components and page ownership

Shared controls live in `components/common` (buttons, inputs, select, modal,
toast, spinner, error, badge, pagination, empty state). Domain components are
grouped under analytics, broker, discipline, journal, layout, optionchain,
positions, strategy, and trading.

The trading and positions workspaces use dedicated CSS alongside JSX because
they are dense interaction surfaces. Much of the rest of the application uses
idiomatic inline style objects backed by CSS custom properties.

When adding a feature:

1. add/extend a domain API function;
2. decide whether data is page-local, preference state, market state, or a
   trading-event invalidation concern;
3. normalize errors before render;
4. support loading, empty, error, and stale/reconnect states;
5. add the route and sidebar item only when the page is functional;
6. verify both an authenticated refresh and a direct URL navigation.

## 9. Themes and design system

`useTheme.js` stores `sf-theme` and the preferred light variant, applies a class
and `data-theme` to `<html>`, and dispatches `sf-theme-change`.

| Theme key | Description |
|---|---|
| `dark` | Default charcoal/lavender trading theme. |
| `light` | Misty teal light theme. |
| `forest-light` | Warm paper and forest theme. |
| `aqua-light` | Crisp aqua/cloud theme. |

Use semantic custom properties from `styles/index.css`, especially `--text`,
`--text-sub`, `--bg`, `--color-surface`, `--border`, `--primary`,
`--on-primary`, `--gain`, `--loss`, and `--warn`. Text placed on a primary fill
must use `--on-primary`.

New UI should not add literal colors. Current source contains legacy literals in
`styles/theme.js` and per-index accents in `Terminal1Page.jsx`; treat them as
existing exceptions, not examples to copy. Validate all four themes because a
token that works on dark may fail contrast on a light variant.

Layout constants are a 220px sidebar and 52px top bar. The product surface is
dense and scannable; marketing layouts are intentionally more spacious.

## 10. Testing and visual verification

Frontend unit tests use Node's built-in test runner:

```powershell
npm test
```

The production compile is the main static integration check:

```powershell
npm run build
```

`npm run visual-check` uses Playwright automation and expects the relevant app
state/server described by the script. Screenshots under `frontend/screenshots`
are artifacts, not executable visual assertions.

High-risk manual checks after auth/trading changes:

- cold page load with valid and expired refresh cookies;
- concurrent 401 recovery;
- logout while a refresh is in flight;
- WebSocket reconnect after access-token rotation;
- 422 errors rendered on forms;
- event-triggered reloads on trading, positions, dashboard, and journal;
- direct access to `/admin` as trader and admin;
- responsive sidebar and each theme.
