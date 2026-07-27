"""
Integration coverage for the read-only admin surface.

The tests that matter are the scoping ones. A tenant_admin must not be able to
see another tenant's users, ledger or audit trail, and no request input may
widen the scope — it is derived from the admin's own row.
"""

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.constants import DEFAULT_DISCIPLINE_RULES, UserRole
from app.core.error_handlers import register_error_handlers
from app.database import get_db
from app.dependencies import get_current_user
from app.models.discipline_rule import DisciplineRule
from app.models.tenant import Tenant
from app.models.user import User
from app.models.virtual_account import VirtualAccount
from app.routers.admin import router
from app.services import audit_service, ledger_service
from app.services.audit_service import AuditAction

P = "/api/v1"


def _make_user(db, role: str, *, tenant=None, balance=Decimal("100000")):
    """A committed-to-the-savepoint user with a funded, ledgered account."""
    if tenant is None:
        tenant = Tenant(id=uuid.uuid4(), name="T",
                        tenant_code="t-" + uuid.uuid4().hex[:8])
        db.add(tenant)
        db.flush()
    user = User(id=uuid.uuid4(), tenant_id=tenant.id,
                email=f"{uuid.uuid4().hex}@t.com", hashed_password="x",
                full_name="Admin Test", role=role)
    db.add(user)
    db.flush()
    account = VirtualAccount(id=uuid.uuid4(), user_id=user.id,
                             tenant_id=tenant.id, balance=Decimal("0.00"),
                             initial_balance=balance)
    db.add(account)
    db.flush()
    ledger_service.open_account(db, account, balance)
    for code, val in DEFAULT_DISCIPLINE_RULES.items():
        db.add(DisciplineRule(id=uuid.uuid4(), user_id=user.id,
                              tenant_id=tenant.id, rule_code=code,
                              rule_value=val, is_active=True))
    db.flush()
    return user, tenant


def _client(db_session, as_user):
    app = FastAPI()
    register_error_handlers(app)
    app.include_router(router, prefix=P)
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_current_user] = lambda: as_user
    return TestClient(app)


@pytest.fixture
def tenant_admin(db_session):
    user, tenant = _make_user(db_session, UserRole.TENANT_ADMIN)
    return user, tenant


@pytest.fixture
def other_tenant(db_session):
    """A separate tenant whose data must never leak into the first."""
    user, tenant = _make_user(db_session, UserRole.TRADER)
    audit_service.record(db_session, action=AuditAction.LOGIN,
                         user_id=user.id, tenant_id=tenant.id)
    db_session.flush()
    return user, tenant


# ── authorisation ─────────────────────────────────────────────

@pytest.mark.parametrize("path", [
    "/admin/overview", "/admin/audit", "/admin/users",
    "/admin/ledger", "/admin/snapshots", "/admin/health",
])
def test_a_trader_is_refused_every_admin_route(db_session, seeded_user, path):
    """seeded_user has role='trader'."""
    r = _client(db_session, seeded_user).get(f"{P}{path}")
    assert r.status_code == 403, f"{path} returned {r.status_code}"


@pytest.mark.parametrize("path", [
    "/admin/overview", "/admin/audit", "/admin/users",
    "/admin/ledger", "/admin/snapshots", "/admin/health",
])
def test_an_admin_is_allowed_every_admin_route(db_session, tenant_admin, path):
    admin, _ = tenant_admin
    r = _client(db_session, admin).get(f"{P}{path}")
    assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:120]}"


# ── scoping ───────────────────────────────────────────────────

def test_tenant_admin_sees_only_their_own_tenants_users(
        db_session, tenant_admin, other_tenant):
    admin, tenant = tenant_admin
    stranger, _ = other_tenant

    r = _client(db_session, admin).get(f"{P}/admin/users")
    assert r.status_code == 200
    ids = {u["id"] for u in r.json()["users"]}
    assert str(admin.id) in ids
    assert str(stranger.id) not in ids, "another tenant's user leaked"


def test_super_admin_sees_across_tenants(db_session, tenant_admin, other_tenant):
    admin, _ = tenant_admin
    stranger, _ = other_tenant
    admin.role = UserRole.SUPER_ADMIN
    db_session.flush()

    r = _client(db_session, admin).get(f"{P}/admin/users", params={"page_size": 200})
    ids = {u["id"] for u in r.json()["users"]}
    assert str(stranger.id) in ids


def test_tenant_admin_cannot_see_another_tenants_audit_rows(
        db_session, tenant_admin, other_tenant):
    admin, _ = tenant_admin
    stranger, _ = other_tenant

    r = _client(db_session, admin).get(f"{P}/admin/audit", params={"page_size": 200})
    assert r.status_code == 200
    user_ids = {e["user_id"] for e in r.json()["entries"]}
    assert str(stranger.id) not in user_ids


def test_tenant_admin_cannot_widen_scope_via_user_id(
        db_session, tenant_admin, other_tenant):
    """
    The scope comes from the admin's own row, so naming another tenant's user
    must return nothing rather than that user's data.
    """
    admin, _ = tenant_admin
    stranger, _ = other_tenant

    r = _client(db_session, admin).get(
        f"{P}/admin/audit", params={"user_id": str(stranger.id)})
    assert r.status_code == 200
    assert r.json()["entries"] == []


def test_ledger_scope_cannot_be_widened_either(
        db_session, tenant_admin, other_tenant):
    admin, _ = tenant_admin
    stranger, _ = other_tenant

    r = _client(db_session, admin).get(
        f"{P}/admin/ledger", params={"user_id": str(stranger.id)})
    # The account is outside scope, so it is not found rather than disclosed.
    assert r.status_code == 404


def test_overview_reports_its_own_scope(db_session, tenant_admin):
    admin, tenant = tenant_admin
    body = _client(db_session, admin).get(f"{P}/admin/overview").json()
    assert body["scope"] == "tenant"
    assert body["tenant_id"] == str(tenant.id)
    assert body["users"] >= 1


# ── the ledger reconciliation surface ─────────────────────────

def test_ledger_reports_reconciliation_for_one_user(db_session, tenant_admin):
    admin, _ = tenant_admin
    r = _client(db_session, admin).get(
        f"{P}/admin/ledger", params={"user_id": str(admin.id)})
    assert r.status_code == 200
    body = r.json()
    assert body["reconciles"] is True
    assert body["total"] >= 1
    assert body["entries"][0]["transaction_type"] == "INITIAL_CREDIT"


def test_ledger_reconciliation_is_absent_when_unscoped(db_session, tenant_admin):
    """`reconciles` is meaningless across accounts, so it stays null."""
    admin, _ = tenant_admin
    body = _client(db_session, admin).get(f"{P}/admin/ledger").json()
    assert body["reconciles"] is None


def test_ledger_detects_a_balance_that_does_not_reconcile(
        db_session, tenant_admin):
    """
    The point of surfacing this: a balance mutated outside the ledger shows up
    as reconciles=False rather than passing unnoticed.
    """
    admin, _ = tenant_admin
    account = db_session.query(VirtualAccount).filter(
        VirtualAccount.user_id == admin.id).one()
    # Deliberately bypass ledger_service to simulate the bug it guards against.
    VirtualAccount.balance.__set__(account, Decimal("12345.00"))
    db_session.flush()

    body = _client(db_session, admin).get(
        f"{P}/admin/ledger", params={"user_id": str(admin.id)}).json()
    assert body["reconciles"] is False


# ── audit filters ─────────────────────────────────────────────

def test_audit_can_be_filtered_by_action_and_outcome(db_session, tenant_admin):
    admin, tenant = tenant_admin
    audit_service.record(db_session, action=AuditAction.LOGIN,
                         user_id=admin.id, tenant_id=tenant.id)
    audit_service.record(db_session, action=AuditAction.ORDER_REJECTED,
                         outcome="FAILURE", user_id=admin.id, tenant_id=tenant.id)
    db_session.flush()

    client = _client(db_session, admin)
    only_login = client.get(f"{P}/admin/audit", params={"action": "LOGIN"}).json()
    assert {e["action"] for e in only_login["entries"]} == {"LOGIN"}

    failures = client.get(f"{P}/admin/audit", params={"outcome": "FAILURE"}).json()
    assert {e["outcome"] for e in failures["entries"]} == {"FAILURE"}


def test_audit_is_newest_first(db_session, tenant_admin):
    admin, tenant = tenant_admin
    for _ in range(3):
        audit_service.record(db_session, action=AuditAction.LOGIN,
                             user_id=admin.id, tenant_id=tenant.id)
    db_session.flush()

    entries = _client(db_session, admin).get(f"{P}/admin/audit").json()["entries"]
    seqs = [e["seq"] for e in entries]
    assert seqs == sorted(seqs, reverse=True)


# ── health ────────────────────────────────────────────────────

def test_health_reports_operational_state(db_session, tenant_admin):
    admin, _ = tenant_admin
    body = _client(db_session, admin).get(f"{P}/admin/health").json()
    assert body["environment"]
    assert "provider_connected" in body
    assert isinstance(body["websocket_connections"], int)
