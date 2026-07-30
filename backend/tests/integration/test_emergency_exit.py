"""Emergency exit coverage for standalone option-buying positions."""

import uuid
from datetime import date, timedelta

from app.core.constants import ExitReason, OrderStatus, StrategyStatus
from app.market.provider_factory import get_market_provider
from app.models.audit_log import AuditLog
from app.models.strategy import Strategy, StrategyPosition
from app.models.virtual_account import VirtualAccount
from app.models.virtual_order import VirtualOrder
from app.services.audit_service import AuditAction


P = "/api/v1"


def _order(*, option_type="CE", action="BUY"):
    chain = get_market_provider().get_option_chain("NIFTY")
    return {
        "client_order_id": str(uuid.uuid4()),
        "instrument": "NIFTY",
        "expiry_date": str(date.today() + timedelta(days=7)),
        "strike_price": int(chain["atm_strike"]),
        "option_type": option_type,
        "action": action,
        "quantity": 1,
        "sl_price": "0.05" if action == "BUY" else "100000.00",
        "target_price": "100000.00" if action == "BUY" else "0.05",
        "setup_tag": "OI_BASED",
    }


def _disable_discipline(db, user_id):
    account = db.query(VirtualAccount).filter(
        VirtualAccount.user_id == user_id
    ).one()
    account.discipline_mode_enabled = False
    db.flush()


def test_emergency_exit_closes_all_standalone_buys_but_not_sells(
    api_client,
    db_session,
    seeded_user,
    market_open,
):
    _disable_discipline(db_session, seeded_user.id)
    buy_ids = {
        api_client.post(f"{P}/trading/orders", json=_order()).json()["id"],
        api_client.post(
            f"{P}/trading/orders",
            json=_order(option_type="PE"),
        ).json()["id"],
    }
    sell_id = api_client.post(
        f"{P}/trading/orders",
        json=_order(action="SELL"),
    ).json()["id"]

    response = api_client.post(f"{P}/trading/positions/emergency-exit")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["closed_count"] == 2
    assert {row["id"] for row in body["closed_orders"]} == buy_ids
    assert all(
        row["exit_reason"] == ExitReason.EMERGENCY_EXIT
        for row in body["closed_orders"]
    )

    still_open = api_client.get(f"{P}/trading/positions").json()["positions"]
    assert [row["order_id"] for row in still_open] == [sell_id]
    assert still_open[0]["action"] == "SELL"

    audit = db_session.query(AuditLog).filter(
        AuditLog.user_id == seeded_user.id,
        AuditLog.action == AuditAction.EMERGENCY_EXIT,
    ).one()
    assert audit.detail["closed_count"] == 2
    assert set(audit.detail["order_ids"]) == buy_ids


def test_emergency_exit_leaves_option_selling_strategy_untouched(
    api_client,
    db_session,
    seeded_user,
    market_open,
):
    standalone = api_client.post(
        f"{P}/trading/orders",
        json=_order(),
    )
    assert standalone.status_code == 201, standalone.text

    created = api_client.post(f"{P}/strategy/from-template", json={
        "template_id": "short_iron_condor",
        "underlying": "NIFTY",
        "lots": 1,
        "setup_tag": "OI_BASED",
        "product_type": "NRML",
    })
    assert created.status_code == 201, created.text
    strategy_id = created.json()["id"]
    executed = api_client.post(f"{P}/strategy/{strategy_id}/execute")
    assert executed.status_code == 200, executed.text

    response = api_client.post(f"{P}/trading/positions/emergency-exit")

    assert response.status_code == 200, response.text
    assert response.json()["closed_count"] == 1

    db_session.expire_all()
    strategy = db_session.query(Strategy).filter(
        Strategy.id == uuid.UUID(strategy_id)
    ).one()
    position = db_session.query(StrategyPosition).filter(
        StrategyPosition.strategy_id == strategy.id
    ).one()
    mirrored = db_session.query(VirtualOrder).filter(
        VirtualOrder.strategy_id == strategy.id
    ).all()

    assert strategy.status == StrategyStatus.EXECUTED
    assert position.is_open is True
    assert mirrored
    assert all(order.status == OrderStatus.OPEN for order in mirrored)
