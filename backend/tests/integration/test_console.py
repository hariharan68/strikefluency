"""Integration coverage for the read-only Console API (Reports P&L + Funds)."""

import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest

from app.models.virtual_account import VirtualAccount
from app.models.virtual_order import VirtualOrder


@pytest.fixture
def account(db_session, seeded_user):
    return db_session.query(VirtualAccount).filter(
        VirtualAccount.user_id == seeded_user.id
    ).one()


def _closed_order(db_session, user, account, *, instrument, strike, pnl, entry_brokerage="20", brokerage="40"):
    """Insert one closed order. pnl is post-exit-brokerage; net = pnl - entry_brokerage."""
    order = VirtualOrder(
        id=uuid.uuid4(), user_id=user.id, tenant_id=user.tenant_id, account_id=account.id,
        instrument=instrument, expiry_date=date.today() + timedelta(days=7),
        strike_price=Decimal(str(strike)), option_type="CE", action="BUY",
        quantity=50, lot_size=50, entry_ltp=Decimal("100"), entry_price=Decimal("100"),
        exit_price=Decimal("110"), status="CLOSED", product_type="INTRADAY",
        trading_day=date.today(), exit_time=datetime.utcnow(),
        pnl=Decimal(str(pnl)), brokerage=Decimal(brokerage),
        entry_brokerage=Decimal(entry_brokerage), setup_tag="OI_BASED",
    )
    db_session.add(order)
    db_session.flush()
    return order


@pytest.fixture
def two_trades(db_session, seeded_user, account):
    # NIFTY winner: net = 500 - 20 = 480, charges = 40
    _closed_order(db_session, seeded_user, account, instrument="NIFTY", strike=23000, pnl=500)
    # BANKNIFTY loser: net = -300 - 20 = -320, charges = 40
    _closed_order(db_session, seeded_user, account, instrument="BANKNIFTY", strike=48000, pnl=-300)
    db_session.flush()


def test_pnl_summary_reconciles(api_client, two_trades):
    resp = api_client.get("/api/v1/console/pnl")
    assert resp.status_code == 200, resp.text
    summary = resp.json()["summary"]

    assert Decimal(summary["net_realized"]) == Decimal("160.00")    # 480 - 320
    assert Decimal(summary["charges"]) == Decimal("80.00")          # 40 + 40
    # The load-bearing invariant behind the three P&L tiles.
    assert Decimal(summary["realized_gross"]) == Decimal(summary["net_realized"]) + Decimal(summary["charges"])
    assert summary["trade_count"] == 2
    assert summary["win_rate"] == 50.0


def test_pnl_calendar_groups_by_day(api_client, two_trades):
    resp = api_client.get("/api/v1/console/pnl")
    calendar = resp.json()["calendar"]
    today = date.today().isoformat()
    day = next(row for row in calendar if row["date"] == today)
    assert day["trade_count"] == 2
    assert Decimal(day["net_pnl"]) == Decimal("160.00")


def test_pnl_instrument_filter(api_client, two_trades):
    resp = api_client.get("/api/v1/console/pnl", params={"instrument": "NIFTY"})
    summary = resp.json()["summary"]
    assert summary["trade_count"] == 1
    assert Decimal(summary["net_realized"]) == Decimal("480.00")
    assert summary["win_rate"] == 100.0


def test_trades_pagination_and_filters(api_client, two_trades):
    both = api_client.get("/api/v1/console/trades").json()
    assert both["total"] == 2
    assert len(both["rows"]) == 2

    one = api_client.get("/api/v1/console/trades", params={"instrument": "NIFTY"}).json()
    assert one["total"] == 1
    assert one["rows"][0]["instrument"] == "NIFTY"
    assert Decimal(one["rows"][0]["net_pnl"]) == Decimal("480.00")

    searched = api_client.get("/api/v1/console/trades", params={"search": "48000"}).json()
    assert searched["total"] == 1
    assert searched["rows"][0]["instrument"] == "BANKNIFTY"

    paged = api_client.get("/api/v1/console/trades", params={"page_size": 1}).json()
    assert paged["total"] == 2
    assert len(paged["rows"]) == 1


def test_trades_date_range_excludes_outside(api_client, db_session, seeded_user, account):
    _closed_order(db_session, seeded_user, account, instrument="NIFTY", strike=23000, pnl=100)
    db_session.flush()
    future = date.today() + timedelta(days=5)
    resp = api_client.get("/api/v1/console/trades", params={
        "from": future.isoformat(), "to": (future + timedelta(days=1)).isoformat(),
    })
    assert resp.json()["total"] == 0


def test_funds_returns_account_and_ledger(api_client, account, two_trades):
    resp = api_client.get("/api/v1/console/funds")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert Decimal(body["account"]["balance"]) == Decimal(str(account.balance))
    assert body["account"]["tier"] == account.tier
    # seeded_user opens its account through the ledger, so INITIAL_CREDIT is here.
    assert body["ledger_total"] >= 1
    assert Decimal(body["summary"]["net_change"]) >= Decimal("0")


def test_console_requires_auth_at_boot():
    # The security kernel refuses to boot if any route is unauthenticated and
    # undeclared; a clean import proves the 3 console routes are authenticated.
    import app.main as m
    audit = m.app.state.security_audit
    assert audit["authenticated"] >= 104
