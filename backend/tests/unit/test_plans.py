"""
Unit coverage for the subscription seam.

The gate is inert today (BILLING_ENABLED=False), so these tests exist to prove
it is inert *deliberately* rather than broken — and that it becomes correct the
moment the flag flips, without anyone having to debug it under pressure.
"""

import pytest
from fastapi import HTTPException

from app.config import settings
from app.core.plans import Plan, has_plan, require_plan


class FakeUser:
    def __init__(self, plan=None):
        if plan is not None:
            self.plan = plan


@pytest.fixture
def billing_on(monkeypatch):
    monkeypatch.setattr(settings, "BILLING_ENABLED", True)


# ── ordering ──────────────────────────────────────────────────

def test_plans_are_ordered_cheapest_first():
    assert Plan.ORDER == [Plan.FREE, Plan.PRO]
    assert Plan.rank(Plan.PRO) > Plan.rank(Plan.FREE)


def test_an_unknown_plan_ranks_lowest():
    """Fail closed: a bad value must not accidentally unlock a paid feature."""
    assert Plan.rank("enterprise-typo") == -1
    assert Plan.rank("enterprise-typo") < Plan.rank(Plan.FREE)


def test_has_plan_is_inclusive_of_the_named_tier():
    assert has_plan(FakeUser(Plan.FREE), Plan.FREE) is True
    assert has_plan(FakeUser(Plan.PRO), Plan.FREE) is True
    assert has_plan(FakeUser(Plan.FREE), Plan.PRO) is False


def test_a_user_without_the_attribute_is_treated_as_free():
    """Defensive: a stub or partially-built user must not rank as paid."""
    assert has_plan(FakeUser(), Plan.FREE) is True
    assert has_plan(FakeUser(), Plan.PRO) is False


# ── the gate ──────────────────────────────────────────────────

def test_gate_allows_everyone_while_billing_is_disabled():
    """
    The whole point of the seam: require_plan can be wired onto a route today
    and change nothing.
    """
    assert settings.BILLING_ENABLED is False
    gate = require_plan(Plan.PRO)
    user = FakeUser(Plan.FREE)
    assert gate(user) is user


def test_gate_enforces_once_billing_is_enabled(billing_on):
    gate = require_plan(Plan.PRO)
    with pytest.raises(HTTPException) as exc:
        gate(FakeUser(Plan.FREE))
    assert exc.value.status_code == 402


def test_gate_admits_a_sufficient_plan(billing_on):
    gate = require_plan(Plan.PRO)
    user = FakeUser(Plan.PRO)
    assert gate(user) is user


def test_gate_admits_everyone_at_the_free_tier(billing_on):
    gate = require_plan(Plan.FREE)
    user = FakeUser(Plan.FREE)
    assert gate(user) is user


# ── scope discipline ──────────────────────────────────────────

def test_no_billing_machinery_was_built():
    """
    The seam is a column and a check. If a subscriptions/payments model appears,
    that is a deliberate product decision and this test should be updated in the
    same commit — not a drive-by addition.
    """
    import app.models as models
    speculative = [
        name for name in models.__all__
        if any(word in name.lower() for word in ("subscription", "payment", "invoice"))
    ]
    assert speculative == [], (
        f"billing machinery appeared without a decision: {speculative}"
    )
