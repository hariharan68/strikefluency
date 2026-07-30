# ADR 0002: retain a plan seam without billing machinery

- **Status:** Accepted
- **Decision date:** 2026-07-27
- **Last source verification:** 2026-07-30
- **Owners:** StrikeFluency maintainers

## Context

StrikeFluency is currently free. The repository has no payment-provider
integration and no subscription, payment, invoice, price, or entitlement
tables. Product details such as paid tiers, gated capabilities, downgrade
behavior, refunds, and provider choice are not defined.

Two elements that are expensive to retrofit do exist:

- `users.plan`, constrained to the recognized plan values and defaulting to
  `free`; and
- `require_plan(minimum)`, which compares ordered plan levels.

`BILLING_ENABLED` defaults to `false`. While disabled, the gate admits users.
When enabled, unknown plan values rank below known plans and therefore fail
closed. The dependency is an authorization layer, not authentication; protected
routes must still take `CurrentUser` or an equivalent authenticated dependency.

## Decision

Keep the user-plan column and plan-gating dependency as an integration seam. Do
not add billing tables, payment webhooks, checkout, or a payment provider until
the product has a specific charging requirement.

## Consequences

- The current product remains free and has no billing lifecycle to operate.
- Routes can be wired to `require_plan()` without changing current access while
  billing is disabled.
- Turning `BILLING_ENABLED` on without first defining and provisioning plan data
  may deny users whose stored plan is below the requested minimum; it does not
  create subscriptions.
- Payment compliance, webhook idempotency, refunds, proration, and downgrade
  behavior remain explicitly outside the implemented system.
- `backend/tests/unit/test_plans.py` detects the accidental introduction of
  subscription or payment models.

## Revisit when

Reconsider this decision only after the team defines a concrete paid capability,
the plans and entitlements that expose it, provider ownership, subscription
lifecycle, downgrade behavior for active trading state, support/refund policy,
and operational/compliance requirements.

The replacement design should be recorded in a new ADR that supersedes this
one.

## Source evidence

- `backend/app/core/plans.py`
- `backend/app/config.py`
- `backend/app/models/user.py`
- `backend/app/dependencies.py`
- `backend/tests/unit/test_plans.py`
