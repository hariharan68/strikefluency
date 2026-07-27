"""
Integration coverage for the append-only funds ledger.

The point of the ledger is that `balance == SUM(ledger.amount)` is provable,
so most of these tests are variations on "do a thing, then reconcile".
"""

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.error_handlers import register_error_handlers
from app.core.exceptions import InsufficientBalanceError
from app.database import get_db
from app.dependencies import get_current_user
from app.market.provider_factory import get_market_provider
from app.models.virtual_account import VirtualAccount
from app.models.virtual_fund_ledger import LedgerImmutableError, VirtualFundLedger
from app.routers.trading import router
from app.services import ledger_service
from tests.conftest import assert_ledger_reconciles

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
    chain = get_market_provider().get_option_chain("NIFTY")
    return int(chain["atm_strike"])


def _order_payload(**changes):
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


def _rows(db, user_id):
    return db.query(VirtualFundLedger).filter(
        VirtualFundLedger.user_id == user_id
    ).order_by(VirtualFundLedger.seq).all()


# ── the invariant ─────────────────────────────────────────────

def test_new_account_opens_with_an_initial_credit(db_session, seeded_user):
    rows = _rows(db_session, seeded_user.id)
    assert len(rows) == 1
    assert rows[0].transaction_type == ledger_service.LedgerTxnType.INITIAL_CREDIT
    assert rows[0].balance_before == Decimal("0.00")
    assert rows[0].amount == Decimal("1000000.00")
    assert_ledger_reconciles(db_session, seeded_user.id)


def test_place_and_close_reconciles(api_client, db_session, seeded_user):
    r = api_client.post(f"{P}/trading/orders", json=_order_payload())
    assert r.status_code == 201, r.text
    order_id = r.json()["id"]
    assert_ledger_reconciles(db_session, seeded_user.id)

    r = api_client.post(f"{P}/trading/orders/{order_id}/close")
    assert r.status_code == 200, r.text
    assert_ledger_reconciles(db_session, seeded_user.id)


def test_place_writes_a_margin_debit_referencing_the_order(
        api_client, db_session, seeded_user):
    r = api_client.post(f"{P}/trading/orders", json=_order_payload())
    order_id = uuid.UUID(r.json()["id"])

    debits = [row for row in _rows(db_session, seeded_user.id)
              if row.transaction_type == ledger_service.LedgerTxnType.TRADE_DEBIT]
    assert len(debits) == 1
    assert debits[0].amount < 0
    assert debits[0].reference_type == ledger_service.LedgerRef.VIRTUAL_ORDER
    assert debits[0].reference_id == order_id


def test_close_posts_margin_release_and_pnl_as_separate_rows(
        api_client, db_session, seeded_user):
    r = api_client.post(f"{P}/trading/orders", json=_order_payload())
    order_id = r.json()["id"]
    before = len(_rows(db_session, seeded_user.id))

    api_client.post(f"{P}/trading/orders/{order_id}/close")
    new_rows = _rows(db_session, seeded_user.id)[before:]

    # A margin release, plus a P&L settlement unless the trade was exactly flat.
    kinds = [row.transaction_type for row in new_rows]
    assert ledger_service.LedgerTxnType.TRADE_CREDIT in kinds
    assert 1 <= len(new_rows) <= 2
    assert_ledger_reconciles(db_session, seeded_user.id)


def test_limit_place_then_cancel_refunds_and_reconciles(
        api_client, db_session, seeded_user):
    # Far below the market so it rests unfilled; SL must sit below the LIMIT
    # (not the LTP) for a BUY, because that is what the order commits to pay.
    payload = _order_payload(sl_price=0.05)
    payload["limit_price"] = 1.00
    r = api_client.post(f"{P}/trading/pending", json=payload)
    assert r.status_code == 201, r.text
    pending_id = r.json()["id"]
    assert_ledger_reconciles(db_session, seeded_user.id)

    r = api_client.post(f"{P}/trading/pending/{pending_id}/cancel")
    assert r.status_code == 200, r.text

    refunds = [row for row in _rows(db_session, seeded_user.id)
               if row.transaction_type == ledger_service.LedgerTxnType.REFUND]
    assert len(refunds) == 1
    assert refunds[0].reference_type == ledger_service.LedgerRef.PENDING_ORDER
    assert_ledger_reconciles(db_session, seeded_user.id)


# ── immutability ──────────────────────────────────────────────

def test_orm_update_of_a_ledger_row_is_blocked(db_session, seeded_user):
    row = _rows(db_session, seeded_user.id)[0]
    row.description = "tampered"
    with pytest.raises(LedgerImmutableError):
        db_session.flush()
    db_session.rollback()


def test_raw_sql_update_of_a_ledger_row_is_blocked(db_session, seeded_user):
    """The DB trigger holds even when the ORM is bypassed entirely."""
    row_id = _rows(db_session, seeded_user.id)[0].id
    with pytest.raises(Exception) as exc:
        db_session.execute(
            text("UPDATE virtual_fund_ledger SET description = 'tampered' WHERE id = :i"),
            {"i": row_id},
        )
    assert "append-only" in str(exc.value)
    db_session.rollback()


# ── the arithmetic constraint ─────────────────────────────────

def test_a_row_that_misstates_its_own_arithmetic_cannot_be_stored(
        db_session, seeded_user):
    account = db_session.query(VirtualAccount).filter(
        VirtualAccount.user_id == seeded_user.id).one()
    with pytest.raises(Exception) as exc:
        db_session.execute(
            text("""
                INSERT INTO virtual_fund_ledger
                    (id, tenant_id, user_id, account_id, transaction_type, amount,
                     balance_before, balance_after, description)
                VALUES (gen_random_uuid(), :t, :u, :a, 'CHARGE', -10.00,
                        100.00, 500.00, 'lying row')
            """),
            {"t": account.tenant_id, "u": account.user_id, "a": account.id},
        )
    assert "ck_vfl_balance_arithmetic" in str(exc.value)
    db_session.rollback()


# ── the guard that replaced an IntegrityError 500 ─────────────

def test_overdraft_raises_insufficient_balance_not_integrity_error(
        db_session, seeded_user):
    account = db_session.query(VirtualAccount).filter(
        VirtualAccount.user_id == seeded_user.id).one()

    with pytest.raises(InsufficientBalanceError):
        ledger_service.post(
            db_session, account,
            txn_type=ledger_service.LedgerTxnType.TRADE_DEBIT,
            amount=-(Decimal(str(account.balance)) + Decimal("1.00")),
            description="overdraft attempt",
        )
    # Rejected before mutating anything.
    assert_ledger_reconciles(db_session, seeded_user.id)


def test_zero_amount_post_is_a_caller_bug(db_session, seeded_user):
    account = db_session.query(VirtualAccount).filter(
        VirtualAccount.user_id == seeded_user.id).one()
    with pytest.raises(ValueError):
        ledger_service.post(
            db_session, account,
            txn_type=ledger_service.LedgerTxnType.CHARGE,
            amount=Decimal("0.00"),
            description="nothing happened",
        )
