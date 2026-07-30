# Security architecture and operating guidance

**Verified:** 2026-07-30

This document describes controls implemented in the repository. It is not a
claim of independent certification or a substitute for deployment hardening,
dependency monitoring, penetration testing, or legal/compliance review.

## 1. Assets and trust boundaries

Primary protected assets are user credentials, session tokens, broker
credentials/tokens, tenant-scoped records, the virtual funds ledger, trading
history, audit history, and user-authored journal data.

Trust boundaries:

- untrusted browser input to FastAPI/Pydantic;
- bearer and cookie credentials to authentication dependencies;
- public OAuth/broker redirects to server-side state validation;
- API process to PostgreSQL and Redis;
- API process to broker SDK/API;
- market data to paper execution decisions;
- tenant admin to tenant-scoped operator data;
- scheduler process to shared database mutation.

## 2. Fail-closed route security

`core/security_kernel.py` walks every FastAPI HTTP and WebSocket dependency tree
after router registration. A route must contain `get_current_user`,
`get_current_auth`, `get_current_active_admin`, or `get_ws_user`, or match the
method/path public registry with a written reason. Otherwise import raises and
the process cannot bind.

At the verification date the audit reports 101 authenticated and 12 declared
public operations. Tests pin authenticated routes, public reasons, router-level
dependencies, WebSocket behavior, and stale registry entries.

Do not bypass this mechanism with manual header parsing. Use `CurrentUser` or
`CurrentAdmin`; add a public registry entry only when the transport cannot carry
a bearer token or the data is intentionally public.

## 3. Authentication and session security

### Passwords and identities

- Passwords are bcrypt hashes via Passlib; registration requires at least eight
  characters.
- Emails are Unicode NFC-normalized, trimmed, lowercased, and globally unique.
- An inactive user fails authentication.
- OAuth supports Google, GitHub, and Facebook. Transactions expire after ten
  minutes and are single-use. Google token exchange includes the PKCE verifier.
- Matching provider email does not silently link an existing password account;
  a short-lived challenge requires that account's password.

### Access JWT

Access claims include subject/user, tenant, role, type, issued/expiry times,
session family ID, token version, and unique JTI. Default lifetime is five
minutes. Verification checks signature, expiry, type, user activity, token
version, and optional JTI denial.

The frontend keeps the token in memory. The user profile in local storage is a
display cache only and is never accepted by the server as authorization.

### Refresh JWT

Refresh tokens are long random signed JWTs but only SHA-256 hashes are stored.
They form a parent/family chain, rotate on every refresh, and are claimed under
a row lock. Persistent and ephemeral policies have distinct cookie/idle/absolute
lifetimes. Presenting an older replaced token after a ten-second race tolerance
revokes the family, records audit/notification state, and attempts a security
email.

The cookie is httpOnly, SameSite=Lax, scoped to `/api/v1/auth`, and Secure when
configured. Login, refresh, and logout check Origin or Referer against the same
normalized list used by CORS. Logout-all also increments `users.token_version`,
invalidating every existing access JWT after its next server check.

## 4. Authorization and tenant isolation

Most user endpoints filter by `current_user.id`; clients do not submit an owner
ID. Admin routes require `tenant_admin` or `super_admin`:

- tenant admins are filtered to `current_admin.tenant_id`;
- super admins may read globally;
- user filters can narrow, never widen, that scope;
- unattributable audit rows are global-only;
- naming an out-of-scope user yields no rows or 404.

The frontend guard is not security enforcement. Every admin request is checked
again by the backend.

Role assignment exists only in registration behavior. There is no supported
HTTP privilege-escalation or role-management endpoint.

## 5. Permanent paper-trading boundary

`core/paper_trading_policy.py` makes broker execution unavailable by
construction:

- settings literals admit only `paper_only` and `market_data_read_only`;
- provider/adapters are checked for disallowed methods;
- raw broker SDK clients are wrapped by `ReadOnlyBrokerClient` with explicit
  read allowlists;
- unknown attributes and execution/portfolio methods fail closed;
- outbound market-data payloads are recursively rejected if they contain paper
  ledger keys such as user/order IDs, P&L, balance, discipline, or journal data;
- `/health` exposes the safe capability mode.

Adding a broker order method is an architectural redesign, not a configuration
change. It requires a new threat model, data classification, authorization,
audit model, tests, and explicit replacement of this invariant.

## 6. Market-data execution safety

Production refuses new entries on mock, fallback, unavailable, unknown-age, or
over-age chains. Kite applies a stricter provider check. Scheduler triggers skip
stale chains rather than act on them. The independent market-hours guard applies
to both entry and exit execution.

These controls protect financial correctness of the virtual ledger even though
no real capital is sent to a broker.

## 7. Secrets and broker credentials

Never commit:

- backend/frontend `.env` files;
- `fyers_token.json` or `access_token.txt`;
- `fyers_logs/`;
- database, Redis, OAuth, SMTP, JWT, or broker secrets.

Broker token/credential fields are Fernet encrypted before persistence. The
configured `BROKER_TOKEN_ENC_KEY` is preferred; derivation from `SECRET_KEY`
exists for compatibility outside the strict Kite production requirement.
Retain the encryption key across deployments and backups.

Current broker connection persistence is global (`user_id` nullable/unused for
the active credential), so broker setup is a trusted-operator action even where
a Fyers route accepts a normal authenticated user. Treat access to broker setup
screens/routes as sensitive and review this assumption before multi-tenant
production use.

## 8. Request and response defenses

- Pydantic validates types, literals, ranges, and extra-field behavior.
- CORS allows credentials only for configured trusted origins.
- Auth throttling is per process and client IP: login 5/minute, registration
  3/minute, refresh 20/minute, OAuth callback 10/minute, link confirmation
  5/minute.
- Responses add `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, a
  strict-origin referrer policy, disabled camera/microphone/geolocation, and
  `Cache-Control: no-store` on `/api/`.
- Production adds one-year HSTS with subdomains.
- Debug Fyers endpoints return 404 outside development.
- Swagger, ReDoc, and OpenAPI JSON are disabled outside development.

The rate limiter is in-memory and explicitly single-process. A horizontally
scaled public deployment needs an ingress or shared-store rate limit; per-worker
limits are not a global abuse control.

## 9. Audit and ledger integrity

Security/trading-sensitive actions use an append-only audit table. Successful
state changes record inside the same transaction; failures that will roll back
use a separate best-effort session. Recorded actions cover login/logout/session,
registration/OAuth linking, token reuse, order placement/rejection/protection/
exit/close, emergency exit, LIMIT placement/cancellation, discipline mode, and
fund adjustments.

Audit failure never blocks login or trading. This availability choice means
operators should monitor audit-write errors; absence of an audit row is possible
during a database/audit failure.

Funds integrity is independently protected by the append-only ledger and the
balance/ledger reconciliation surface. Direct balance writes fail an AST test.

## 10. Production configuration guard

`Settings.validate_security()` refuses production startup without secure
cookies, strong JWT secret, HTTPS origins/frontend/configured OAuth redirects,
and Redis. Kite additionally requires Redis and a dedicated broker encryption
key. The app also fails on unsafe execution literals and unaudited routes.

See [Configuration reference](CONFIGURATION.md) for the exact checks.

## 11. WebSocket considerations

The access JWT is in the WebSocket URL query because of browser API limits.
Authentication occurs before accept, with policy-violation close code 1008.
Query strings can appear in browser history, reverse-proxy access logs, APM,
exception reports, or infrastructure telemetry.

Operational controls must:

- use WSS/TLS;
- redact the `token` query parameter from access/APM logs;
- avoid logging full request URLs at the proxy;
- keep the five-minute access lifetime;
- rotate/refresh before reconnect;
- restrict log and trace access/retention.

The connection manager and replay cache are in-process. Redis leadership does
not distribute targeted events across workers.

## 12. Security review checklist

For every change:

1. classify every new route as authenticated/admin/public;
2. scope every query from authenticated identity, not client owner fields;
3. keep broker adapters read-only and run the paper boundary tests;
4. validate market source/age before a new execution trigger;
5. use the ledger for funds and audit sensitive state;
6. keep secrets and tokens out of logs, errors, URLs where avoidable, and git;
7. preserve refresh rotation, family reuse handling, and frontend single-flight;
8. consider concurrency and idempotency for retries/schedulers;
9. run route-security, auth-hardening, paper-boundary, ledger, and relevant
   integration tests;
10. update this document when the trust model changes.

## 13. Incident first actions

| Signal | First actions |
|---|---|
| Suspected refresh-token theft | Revoke affected family or logout-all; inspect `audit_logs` and `security_notifications`; rotate JWT secret only with a deliberate all-session invalidation plan. |
| Broker token exposure | Disconnect/revoke at broker, clear stored token, rotate broker app secret and encryption key only with a migration/reconnect plan. |
| Ledger mismatch | Stop state-changing API/scheduler work, preserve DB snapshot/logs, query the account ledger by sequence, and correct only with a compensating adjustment after root cause. |
| Unknown public endpoint/startup audit failure | Do not add a blanket public entry; identify the intended auth dependency and add a reasoned registry entry only when truly public. |
| Redis outage in production | State jobs pause by design; restore Redis, verify leadership, then inspect pending limits/exits/EOD jobs before manual intervention. |

Detailed operating procedures are in [Operations and deployment](OPERATIONS.md).
