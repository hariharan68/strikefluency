"""
app/core/plans.py
─────────────────
The subscription seam.

StrikeFluency is free. There are no paying users, no payment provider, and no
plan/subscription/payment tables — building billing rails nobody uses would be
the clearest over-scope in the architecture doc. What exists here is only the
*shape* of a paid tier, so that introducing one later is a policy change rather
than a migration against a live users table plus a rewrite of every route.

What is real:
  - `users.plan`, defaulting to "free", constrained to the known tiers
  - an ordering, so "at least pro" is expressible
  - `require_plan()`, which enforces correctly when switched on

What is deliberately absent: Stripe/Razorpay, a subscriptions table, a payments
table, invoices, webhooks, proration, trials. Do not add them speculatively.

`BILLING_ENABLED` is False, so `require_plan()` currently allows everything.
That is not a stub that silently does nothing — it is an explicit, testable
kill switch. Turning it on is a deliberate act, and the gate is already correct
when it happens.
"""

from typing import Callable

from fastapi import HTTPException, status

from app.config import settings
from app.models.user import User


class Plan:
    FREE = "free"
    PRO = "pro"

    # Ordered cheapest first. Membership is what ck_users_plan allows.
    ORDER = [FREE, PRO]

    @classmethod
    def rank(cls, plan: str) -> int:
        """Unknown plans rank lowest — fail closed, never open."""
        try:
            return cls.ORDER.index(plan)
        except ValueError:
            return -1


def has_plan(user: User, minimum: str) -> bool:
    """Whether `user` is on `minimum` or better."""
    return Plan.rank(getattr(user, "plan", None) or Plan.FREE) >= Plan.rank(minimum)


def require_plan(minimum: str) -> Callable[[User], User]:
    """
    Dependency factory gating a route behind a subscription tier.

        @router.get("/reports/export")
        def export(user: User = Depends(require_plan(Plan.PRO))):
            ...

    While `settings.BILLING_ENABLED` is False this allows everyone through, so
    adding it to a route today changes nothing. It is wired as a real check so
    that enabling billing does not also require writing and debugging the gate
    under time pressure.

    NOTE: this does NOT authenticate. Compose it with CurrentUser — a route
    depending only on this would not satisfy the Security Kernel and the app
    would refuse to boot, which is the intended failure.
    """
    def dependency(current_user: User) -> User:
        if not settings.BILLING_ENABLED:
            return current_user
        if not has_plan(current_user, minimum):
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=f"This feature requires the {minimum} plan.",
            )
        return current_user

    return dependency
