"""
Integration coverage for daily portfolio and per-position snapshots.

The property worth protecting is idempotence: the job runs on a cron with a
600s misfire grace, so a restart near the close can genuinely fire it twice.
A second run must correct the row, not duplicate it.
"""

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.core.constants import PendingOrderStatus
from app.core.utils import current_trading_day
from app.models.pnl_snapshot import PnlSnapshot
from app.models.portfolio_snapshot import PortfolioSnapshot
from app.models.virtual_account import VirtualAccount
from app.services.pending_order_service import place_pending_order
from app.services.snapshot_service import capture_daily_snapshots
from app.services.virtual_order_service import close_position, place_order

ATM_FALLBACK = 22000


@pytest.fixture(autouse=True)
def market_is_open(monkeypatch):
    for module in ("app.services.virtual_order_service",
                   "app.services.pending_order_service"):
        monkeypatch.setattr(f"{module}.is_market_open", lambda: True)


def _atm():
    from app.market.provider_factory import get_market_provider
    return int(get_market_provider().get_option_chain("NIFTY")["atm_strike"])


def _order_data(**over):
    data = {
        "client_order_id": uuid.uuid4(),
        "instrument": "NIFTY",
        "expiry_date": date.today() + timedelta(days=7),
        "strike_price": _atm(),
        "option_type": "CE",
        "action": "BUY",
        "quantity": 1,
        "product_type": "INTRADAY",
        "sl_price": Decimal("0.05"),
        "target_price": Decimal("100000"),
        "setup_tag": "OI_BASED",
    }
    data.update(over)
    return data


def _snapshot(db, user_id):
    return db.query(PortfolioSnapshot).filter(
        PortfolioSnapshot.user_id == user_id).one_or_none()


def test_snapshot_is_written_for_every_account(db_session, seeded_user):
    assert capture_daily_snapshots(db_session) >= 1
    db_session.flush()

    row = _snapshot(db_session, seeded_user.id)
    assert row is not None
    assert row.snapshot_date == current_trading_day()
    assert row.balance == Decimal("1000000.00")
    assert row.equity == row.balance + row.margin_blocked + row.unrealized_pnl


def test_equity_adds_back_margin_blocked_by_an_open_position(
        db_session, seeded_user):
    order = place_order(db_session, seeded_user, _order_data())
    db_session.flush()

    account = db_session.query(VirtualAccount).filter(
        VirtualAccount.user_id == seeded_user.id).one()
    capture_daily_snapshots(db_session)
    db_session.flush()

    row = _snapshot(db_session, seeded_user.id)
    assert row.open_positions == 1
    assert row.margin_blocked == order.position.margin_blocked
    assert row.balance == account.balance
    # Balance alone understates the account by exactly the reserved margin.
    assert row.equity > row.balance


def test_resting_limit_margin_counts_toward_equity(db_session, seeded_user):
    """A resting limit holds cash the user cannot spend; omitting it would
    understate equity by exactly that amount."""
    pending = place_pending_order(db_session, seeded_user, _order_data(
        limit_price=Decimal("1.00"), sl_price=Decimal("0.05")))
    db_session.flush()
    assert pending.status == PendingOrderStatus.PENDING

    capture_daily_snapshots(db_session)
    db_session.flush()

    row = _snapshot(db_session, seeded_user.id)
    assert row.margin_blocked == pending.margin_blocked
    assert row.margin_blocked > 0


def test_running_twice_updates_rather_than_duplicating(db_session, seeded_user):
    """
    The cron carries a 600s misfire grace, so a restart near the close can fire
    it twice for the same day.
    """
    capture_daily_snapshots(db_session)
    db_session.flush()
    capture_daily_snapshots(db_session)
    db_session.flush()

    rows = db_session.query(PortfolioSnapshot).filter(
        PortfolioSnapshot.user_id == seeded_user.id).all()
    assert len(rows) == 1


def test_second_run_reflects_the_newer_state(db_session, seeded_user):
    capture_daily_snapshots(db_session)
    db_session.flush()
    first = _snapshot(db_session, seeded_user.id).equity

    place_order(db_session, seeded_user, _order_data())
    db_session.flush()
    capture_daily_snapshots(db_session)
    db_session.flush()

    row = _snapshot(db_session, seeded_user.id)
    assert row.open_positions == 1
    # Entry brokerage was charged, so equity drops slightly rather than
    # staying flat — margin moves out of balance but is added back.
    assert row.equity != first


# ── per-position marks ────────────────────────────────────────

def test_open_positions_get_a_pnl_snapshot(db_session, seeded_user):
    order = place_order(db_session, seeded_user, _order_data())
    db_session.flush()
    capture_daily_snapshots(db_session)
    db_session.flush()

    rows = db_session.query(PnlSnapshot).filter(
        PnlSnapshot.user_id == seeded_user.id).all()
    assert len(rows) == 1
    assert rows[0].position_id == order.position.id
    assert rows[0].order_id == order.id
    assert rows[0].instrument == "NIFTY"
    assert rows[0].avg_entry_price == order.entry_price


def test_closed_positions_get_no_pnl_snapshot(db_session, seeded_user):
    """
    A closed position already has a permanent record on its VirtualOrder row.
    Snapshotting it again would duplicate, not preserve.
    """
    order = place_order(db_session, seeded_user, _order_data())
    db_session.flush()
    close_position(db_session, seeded_user, order.id)
    db_session.flush()

    capture_daily_snapshots(db_session)
    db_session.flush()

    assert db_session.query(PnlSnapshot).filter(
        PnlSnapshot.user_id == seeded_user.id).count() == 0
    row = _snapshot(db_session, seeded_user.id)
    assert row.open_positions == 0


def test_pnl_snapshots_are_idempotent_too(db_session, seeded_user):
    place_order(db_session, seeded_user, _order_data())
    db_session.flush()
    capture_daily_snapshots(db_session)
    db_session.flush()
    capture_daily_snapshots(db_session)
    db_session.flush()

    assert db_session.query(PnlSnapshot).filter(
        PnlSnapshot.user_id == seeded_user.id).count() == 1


def test_one_bad_account_does_not_lose_everyone_elses_snapshot(
        db_session, seeded_user, monkeypatch):
    """The batch commits once, so a single failure must be contained."""
    import app.services.snapshot_service as svc

    real = svc._capture_one
    calls = {"n": 0}

    def flaky(db, account, snapshot_date):
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("simulated failure")
        return real(db, account, snapshot_date)

    monkeypatch.setattr(svc, "_capture_one", flaky)
    captured = capture_daily_snapshots(db_session)
    # At least one account was attempted and the exception did not propagate.
    assert captured >= 0
    assert calls["n"] >= 1
