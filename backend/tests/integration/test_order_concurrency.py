"""PostgreSQL concurrency tests for balance, idempotency and close locking."""

import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from decimal import Decimal
from threading import Barrier

import pytest
from sqlalchemy.orm import Session

from app.core.constants import DisciplineRuleCode
from app.core.exceptions import (
    DisciplineViolationError,
    InsufficientBalanceError,
    OrderAlreadyClosedError,
)
from app.models.journal_entry import JournalEntry
from app.models.tenant import Tenant
from app.models.trading_session import TradingSession
from app.models.user import User
from app.models.virtual_account import VirtualAccount
from app.models.virtual_order import VirtualOrder
from app.models.virtual_position import VirtualPosition
from app.models.virtual_fund_ledger import VirtualFundLedger
from app.services import ledger_service
from tests.conftest import assert_ledger_reconciles
from app.services.trading_session_service import get_or_create_today
from app.services.virtual_order_service import close_position, place_order


class FixedProvider:
    def get_option_chain(self, instrument):
        return {
            "instrument": instrument,
            "atm_strike": 22000,
            "strikes": [{
                "strike": 22000,
                "ce": {"ltp": Decimal("300.00")},
                "pe": {"ltp": Decimal("300.00")},
            }],
        }


@pytest.fixture
def committed_user(db_engine):
    tenant_id = uuid.uuid4()
    user_id = uuid.uuid4()
    with Session(db_engine) as db:
        db.add(Tenant(
            id=tenant_id,
            name="Concurrency test",
            tenant_code="concurrency-" + uuid.uuid4().hex[:8],
        ))
        db.add(User(
            id=user_id,
            tenant_id=tenant_id,
            email=f"{uuid.uuid4().hex}@concurrency.test",
            hashed_password="x",
            full_name="Concurrency",
            role="trader",
        ))
        db.flush()
        # Opened at zero and credited through the ledger, mirroring
        # registration, so the balance reconciles against SUM(ledger.amount).
        account = VirtualAccount(
            id=uuid.uuid4(),
            user_id=user_id,
            tenant_id=tenant_id,
            balance=Decimal("0.00"),
            initial_balance=Decimal("100000.00"),
            discipline_mode_enabled=False,
        )
        db.add(account)
        db.flush()
        ledger_service.open_account(db, account, Decimal("100000.00"))
        db.commit()

    yield user_id

    # These tests intentionally commit from independent connections, so clean
    # up their isolated user in dependency order.
    with Session(db_engine) as db:
        # Ledger first: it FKs virtual_accounts, users and tenants. Deleting is
        # allowed (only UPDATE is blocked by trg_vfl_forbid_update).
        db.query(VirtualFundLedger).filter(VirtualFundLedger.user_id == user_id).delete()
        db.query(JournalEntry).filter(JournalEntry.user_id == user_id).delete()
        db.query(VirtualPosition).filter(VirtualPosition.user_id == user_id).delete()
        db.query(VirtualOrder).filter(VirtualOrder.user_id == user_id).delete()
        db.query(TradingSession).filter(TradingSession.user_id == user_id).delete()
        db.query(VirtualAccount).filter(VirtualAccount.user_id == user_id).delete()
        db.query(User).filter(User.id == user_id).delete()
        db.query(Tenant).filter(Tenant.id == tenant_id).delete()
        db.commit()


@pytest.fixture(autouse=True)
def fixed_market(monkeypatch):
    provider = FixedProvider()
    monkeypatch.setattr(
        "app.services.virtual_order_service.get_market_provider",
        lambda: provider,
    )
    monkeypatch.setattr(
        "app.services.virtual_order_service.is_market_open",
        lambda: True,
    )
    return provider


def order_data(client_order_id, *, quantity=1):
    return {
        "client_order_id": client_order_id,
        "instrument": "NIFTY",
        "expiry_date": date.today() + timedelta(days=7),
        "strike_price": 22000,
        "option_type": "CE",
        "action": "BUY",
        "quantity": quantity,
        "lot_size": 65,
        "product_type": "INTRADAY",
        "sl_price": Decimal("100.00"),
        "target_price": Decimal("500.00"),
        "setup_tag": "OI_BASED",
    }


def test_concurrent_retry_creates_exactly_one_order(db_engine, committed_user):
    client_order_id = uuid.uuid4()
    start = Barrier(2)

    def submit():
        with Session(db_engine) as db:
            user = db.get(User, committed_user)
            start.wait()
            order = place_order(db, user, order_data(client_order_id))
            replayed = getattr(order, "_idempotent_replay", False)
            db.commit()
            return order.id, replayed

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = [future.result(timeout=10) for future in (
            pool.submit(submit),
            pool.submit(submit),
        )]

    with Session(db_engine) as db:
        orders = db.query(VirtualOrder).filter(
            VirtualOrder.user_id == committed_user
        ).all()
        session = db.query(TradingSession).filter(
            TradingSession.user_id == committed_user
        ).one()

    assert results[0][0] == results[1][0]
    assert sorted(result[1] for result in results) == [False, True]
    assert len(orders) == 1
    assert session.trades_count == 1


def test_concurrent_distinct_orders_cannot_overspend(db_engine, committed_user):
    with Session(db_engine) as db:
        account = db.query(VirtualAccount).filter(
            VirtualAccount.user_id == committed_user
        ).one()
        # One lot requires roughly 3,900 at the fixed quote; two do not fit.
        # Applied through the ledger so the account still reconciles — a direct
        # write here would look exactly like the bug this test now checks for.
        ledger_service.adjust(
            db, account, Decimal("5000.00") - account.balance,
            "Test setup: constrain balance for the overspend race",
        )
        db.commit()

    start = Barrier(2)

    def submit(client_order_id):
        with Session(db_engine) as db:
            user = db.get(User, committed_user)
            start.wait()
            try:
                order = place_order(db, user, order_data(client_order_id))
                db.commit()
                return ("placed", order.id)
            except InsufficientBalanceError:
                db.rollback()
                return ("rejected", None)

    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = [future.result(timeout=10) for future in (
            pool.submit(submit, uuid.uuid4()),
            pool.submit(submit, uuid.uuid4()),
        )]

    with Session(db_engine) as db:
        account = db.query(VirtualAccount).filter(
            VirtualAccount.user_id == committed_user
        ).one()
        count = db.query(VirtualOrder).filter(
            VirtualOrder.user_id == committed_user
        ).count()

    assert sorted(outcome[0] for outcome in outcomes) == ["placed", "rejected"]
    assert count == 1
    assert account.balance >= 0
    # The rejected thread must not have left a half-posted ledger row behind.
    with Session(db_engine) as db:
        assert_ledger_reconciles(db, committed_user)


def test_concurrent_orders_cannot_bypass_daily_trade_limit(
    db_engine,
    committed_user,
):
    with Session(db_engine) as db:
        user = db.get(User, committed_user)
        account = db.query(VirtualAccount).filter(
            VirtualAccount.user_id == committed_user
        ).one()
        account.discipline_mode_enabled = True
        session = get_or_create_today(db, user)
        session.trades_count = 2
        db.commit()

    start = Barrier(2)

    def submit(client_order_id):
        with Session(db_engine) as db:
            user = db.get(User, committed_user)
            start.wait()
            try:
                order = place_order(db, user, order_data(client_order_id))
                db.commit()
                return ("placed", order.id)
            except DisciplineViolationError as exc:
                db.rollback()
                return ("blocked", exc.rule_code)

    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = [future.result(timeout=10) for future in (
            pool.submit(submit, uuid.uuid4()),
            pool.submit(submit, uuid.uuid4()),
        )]

    with Session(db_engine) as db:
        session = db.query(TradingSession).filter(
            TradingSession.user_id == committed_user
        ).one()
        count = db.query(VirtualOrder).filter(
            VirtualOrder.user_id == committed_user
        ).count()

    assert sorted(outcome[0] for outcome in outcomes) == ["blocked", "placed"]
    blocked = next(outcome for outcome in outcomes if outcome[0] == "blocked")
    assert blocked[1] == DisciplineRuleCode.MAX_TRADES_PER_DAY
    assert count == 1
    assert session.trades_count == 3


def test_manual_close_race_releases_margin_once(db_engine, committed_user):
    with Session(db_engine) as db:
        user = db.get(User, committed_user)
        order = place_order(db, user, order_data(uuid.uuid4()))
        db.commit()
        order_id = order.id

    start = Barrier(2)

    def close():
        with Session(db_engine) as db:
            user = db.get(User, committed_user)
            start.wait()
            try:
                closed = close_position(db, user, order_id)
                db.commit()
                return ("closed", closed.pnl)
            except OrderAlreadyClosedError:
                db.rollback()
                return ("already_closed", None)

    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = [future.result(timeout=10) for future in (
            pool.submit(close),
            pool.submit(close),
        )]

    with Session(db_engine) as db:
        order = db.get(VirtualOrder, order_id)
        account = db.query(VirtualAccount).filter(
            VirtualAccount.user_id == committed_user
        ).one()
        position = db.query(VirtualPosition).filter(
            VirtualPosition.order_id == order_id
        ).one()
        journals = db.query(JournalEntry).filter(
            JournalEntry.order_id == order_id
        ).count()

    assert sorted(outcome[0] for outcome in outcomes) == ["already_closed", "closed"]
    assert position.is_open is False
    assert journals == 1
    # `pnl` nets the exit brokerage only; the entry leg was debited separately
    # at placement, so it must be subtracted here too. Expressed relative to
    # order.entry_brokerage rather than a literal because slippage is random.
    assert account.balance == (
        Decimal("100000.00") + order.pnl - order.entry_brokerage
    )
    # The losing thread must not have double-posted the margin release.
    with Session(db_engine) as db:
        assert_ledger_reconciles(db, committed_user)
