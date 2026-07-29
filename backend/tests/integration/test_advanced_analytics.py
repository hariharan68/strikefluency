import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from app.models.journal_entry import JournalEntry
from app.models.strategy import Strategy, StrategyPosition
from app.models.virtual_order import VirtualOrder


def _order(user, account, **overrides):
    values = {
        "id": uuid.uuid4(),
        "user_id": user.id,
        "tenant_id": user.tenant_id,
        "account_id": account.id,
        "instrument": "NIFTY",
        "expiry_date": date.today() + timedelta(days=7),
        "strike_price": Decimal("24000"),
        "option_type": "CE",
        "action": "BUY",
        "quantity": 1,
        "lot_size": 65,
        "entry_ltp": Decimal("100"),
        "entry_price": Decimal("101"),
        "exit_price": Decimal("103"),
        "sl_price": Decimal("90"),
        "target_price": Decimal("120"),
        "status": "CLOSED",
        "product_type": "INTRADAY",
        "trading_day": date.today(),
        "entry_time": datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=1),
        "exit_time": datetime.now(timezone.utc).replace(tzinfo=None),
        "pnl": Decimal("120"),
        "brokerage": Decimal("30"),
        "entry_brokerage": Decimal("20"),
        "slippage_points": Decimal("1"),
        "setup_tag": "BREAKOUT",
        "is_discipline_compliant": True,
        "was_free_play": False,
    }
    values.update(overrides)
    return VirtualOrder(**values)


def test_advanced_endpoint_counts_strategy_once_and_uses_true_net_pnl(
    api_client,
    db_session,
    seeded_user,
):
    account = seeded_user.virtual_account
    standalone = _order(seeded_user, account)

    strategy = Strategy(
        id=uuid.uuid4(),
        user_id=seeded_user.id,
        tenant_id=seeded_user.tenant_id,
        account_id=account.id,
        underlying="BANKNIFTY",
        name="Iron Condor",
        template_id="iron_condor",
        status="CLOSED",
        product_type="INTRADAY",
        setup_tag="RANGE",
    )
    position = StrategyPosition(
        id=uuid.uuid4(),
        strategy_id=strategy.id,
        user_id=seeded_user.id,
        tenant_id=seeded_user.tenant_id,
        account_id=account.id,
        margin_blocked=Decimal("0"),
        realized_pnl=Decimal("250"),
        unrealized_pnl=Decimal("0"),
        brokerage=Decimal("50"),
        is_open=False,
        opened_at=datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=2),
        closed_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    mirrored_leg = _order(
        seeded_user,
        account,
        strategy_id=strategy.id,
        instrument="BANKNIFTY",
        setup_tag="RANGE",
        pnl=Decimal("999"),
        entry_brokerage=Decimal("10"),
    )
    db_session.add_all([standalone, strategy, position, mirrored_leg])
    db_session.flush()
    db_session.add(
        JournalEntry(
            order_id=standalone.id,
            user_id=seeded_user.id,
            tenant_id=seeded_user.tenant_id,
            entry_price=standalone.entry_price,
            exit_price=standalone.exit_price,
            pnl=standalone.pnl,
            brokerage=standalone.brokerage,
            is_discipline_compliant=True,
            trade_date=date.today(),
            mistake_category="NONE",
        )
    )
    db_session.flush()

    response = api_client.get("/api/v1/analytics/advanced", params={"days": 30})

    assert response.status_code == 200
    data = response.json()
    assert data["summary"]["total_trades"] == 2
    assert Decimal(data["summary"]["net_pnl"]) == Decimal("300.00")
    assert data["summary"]["winning_trades"] == 2
    assert {row["label"] for row in data["instrument_performance"]} == {
        "NIFTY",
        "BANKNIFTY",
    }
    assert len(data["daily_series"]) == 1
    assert data["mistake_breakdown"] == []


def test_advanced_endpoint_validates_supported_period_bounds(api_client):
    assert api_client.get("/api/v1/analytics/advanced", params={"days": 6}).status_code == 422
    assert api_client.get("/api/v1/analytics/advanced", params={"days": 15}).status_code == 422
    assert api_client.get("/api/v1/analytics/advanced", params={"days": 91}).status_code == 422
