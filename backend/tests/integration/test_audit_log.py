"""
Integration coverage for the append-only audit trail.

The behaviour that matters most is the transactional one: a successful action's
audit row must roll back with it, and a *failed* action's row must not — which
is why audit_service has two write modes.
"""

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.error_handlers import register_error_handlers
from app.database import get_db
from app.dependencies import get_current_user
from app.market.provider_factory import get_market_provider
from app.models.append_only import AppendOnlyViolation
from app.models.audit_log import AuditLog
from app.routers.trading import router
from app.services import audit_service
from app.services.audit_service import AuditAction, AuditOutcome

P = "/api/v1"


@pytest.fixture(autouse=True)
def market_is_open(monkeypatch):
    for module in (
        "app.services.virtual_order_service",
        "app.services.pending_order_service",
    ):
        monkeypatch.setattr(f"{module}.is_market_open", lambda: True)


@pytest.fixture
def api_client(db_session, seeded_user):
    app = FastAPI()
    register_error_handlers(app)
    app.include_router(router, prefix=P)
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_current_user] = lambda: seeded_user
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def _atm():
    return int(get_market_provider().get_option_chain("NIFTY")["atm_strike"])


def _payload(**changes):
    payload = {
        "client_order_id": str(uuid.uuid4()),
        "instrument": "NIFTY",
        "expiry_date": str(date.today() + timedelta(days=7)),
        "strike_price": _atm(),
        "option_type": "CE",
        "action": "BUY",
        "quantity": 1,
        "sl_price": 0.05,
        "target_price": 100000,
        "setup_tag": "OI_BASED",
    }
    payload.update(changes)
    return payload


def _rows(db, user_id, action=None):
    q = db.query(AuditLog).filter(AuditLog.user_id == user_id)
    if action:
        q = q.filter(AuditLog.action == action)
    return q.order_by(AuditLog.seq).all()


# ── trading actions ───────────────────────────────────────────

def test_placing_an_order_writes_an_audit_row(api_client, db_session, seeded_user):
    r = api_client.post(f"{P}/trading/orders", json=_payload())
    assert r.status_code == 201, r.text

    rows = _rows(db_session, seeded_user.id, AuditAction.ORDER_PLACED)
    assert len(rows) == 1
    assert rows[0].outcome == AuditOutcome.SUCCESS
    assert rows[0].reference_id == uuid.UUID(r.json()["id"])
    assert rows[0].detail["instrument"] == "NIFTY"
    assert rows[0].tenant_id == seeded_user.tenant_id


def test_closing_an_order_writes_an_audit_row(api_client, db_session, seeded_user):
    order_id = api_client.post(f"{P}/trading/orders", json=_payload()).json()["id"]
    api_client.post(f"{P}/trading/orders/{order_id}/close")

    rows = _rows(db_session, seeded_user.id, AuditAction.ORDER_CLOSED)
    assert len(rows) == 1
    assert "pnl" in rows[0].detail


def test_an_idempotent_replay_does_not_write_a_second_row(
        api_client, db_session, seeded_user):
    payload = _payload()
    assert api_client.post(f"{P}/trading/orders", json=payload).status_code == 201
    assert api_client.post(f"{P}/trading/orders", json=payload).status_code == 200

    assert len(_rows(db_session, seeded_user.id, AuditAction.ORDER_PLACED)) == 1


def test_limit_place_and_cancel_are_audited(api_client, db_session, seeded_user):
    payload = _payload(sl_price=0.05)
    payload["limit_price"] = 1.00
    pid = api_client.post(f"{P}/trading/pending", json=payload).json()["id"]
    api_client.post(f"{P}/trading/pending/{pid}/cancel")

    assert len(_rows(db_session, seeded_user.id, AuditAction.LIMIT_PLACED)) == 1
    cancelled = _rows(db_session, seeded_user.id, AuditAction.LIMIT_CANCELLED)
    assert len(cancelled) == 1
    assert Decimal(cancelled[0].detail["margin_released"]) > 0


# ── the transactional contract ────────────────────────────────

def test_record_joins_the_callers_transaction(db_session, seeded_user):
    """
    A row written with record() must be visible in the caller's transaction and
    disappear if it rolls back — an action that did not happen must not be
    audited as though it did.
    """
    audit_service.record(
        db_session, action=AuditAction.ORDER_PLACED, user_id=seeded_user.id,
        detail={"marker": "rollback-me"},
    )
    db_session.flush()
    assert len(_rows(db_session, seeded_user.id, AuditAction.ORDER_PLACED)) == 1

    db_session.rollback()
    assert _rows(db_session, seeded_user.id, AuditAction.ORDER_PLACED) == []


def test_auditing_never_raises_on_bad_input(db_session, seeded_user):
    """An audit failure must never propagate into the caller's code path."""
    audit_service.record(
        db_session, action="X" * 400,   # violates String(50)
        user_id=seeded_user.id,
    )
    # The bad row only fails at flush; the call itself must be silent.
    db_session.rollback()


# ── immutability ──────────────────────────────────────────────

def test_orm_update_of_an_audit_row_is_blocked(api_client, db_session, seeded_user):
    api_client.post(f"{P}/trading/orders", json=_payload())
    row = _rows(db_session, seeded_user.id)[0]
    row.action = "TAMPERED"
    with pytest.raises(AppendOnlyViolation):
        db_session.flush()
    db_session.rollback()


def test_raw_sql_update_of_an_audit_row_is_blocked(
        api_client, db_session, seeded_user):
    api_client.post(f"{P}/trading/orders", json=_payload())
    row_id = _rows(db_session, seeded_user.id)[0].id
    with pytest.raises(Exception) as exc:
        db_session.execute(
            text("UPDATE audit_logs SET action = 'TAMPERED' WHERE id = :i"),
            {"i": row_id},
        )
    assert "append-only" in str(exc.value)
    db_session.rollback()


def test_outcome_is_constrained(db_session, seeded_user):
    with pytest.raises(Exception) as exc:
        db_session.execute(
            text("INSERT INTO audit_logs (id, user_id, action, outcome) "
                 "VALUES (gen_random_uuid(), :u, 'LOGIN', 'MAYBE')"),
            {"u": seeded_user.id},
        )
    assert "ck_audit_logs_outcome" in str(exc.value)
    db_session.rollback()
