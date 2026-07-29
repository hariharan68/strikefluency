"""
Integration tests for the Strategy Builder HTTP API (Phase 9).

Drives the real FastAPI app + service layer + Postgres through fixtures in
conftest.py. Skipped automatically when Postgres isn't reachable. Every test
rolls back — nothing persists.
"""

import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from app.core.constants import LegStatus, OrderStatus, StrategyStatus
from app.models.strategy import Strategy, StrategyPosition
from app.models.virtual_account import VirtualAccount
from app.models.virtual_order import VirtualOrder

P = "/api/v1/strategy"


def test_list_templates(api_client):
    r = api_client.get(f"{P}/templates")
    assert r.status_code == 200
    assert len(r.json()) == 32


def test_template_category_filter(api_client):
    assert len(api_client.get(f"{P}/templates", params={"category": "BULLISH"}).json()) == 9
    assert len(api_client.get(f"{P}/templates", params={"category": "NEUTRAL"}).json()) == 8


def test_unknown_template_is_404(api_client):
    r = api_client.post(f"{P}/from-template", json={"template_id": "nope", "underlying": "NIFTY"})
    assert r.status_code == 404
    assert r.json()["error"] == "UNKNOWN_TEMPLATE"


def test_full_lifecycle(api_client, market_open):
    # build a draft from a template
    r = api_client.post(f"{P}/from-template", json={
        "template_id": "short_straddle", "underlying": "NIFTY",
        "lots": 1, "setup_tag": "OI_BASED"})
    assert r.status_code == 201, r.text
    sid = r.json()["id"]
    assert r.json()["status"] == "DRAFT"
    assert len(r.json()["legs"]) == 2

    # analytics preview works on the (unpriced) draft
    a = api_client.get(f"{P}/{sid}/analytics")
    assert a.status_code == 200
    assert a.json()["payoff"] is not None          # draft was priced from the chain
    assert a.json()["margin"]["total"] > 0

    # execute
    e = api_client.post(f"{P}/{sid}/execute")
    assert e.status_code == 200, e.text
    assert e.json()["strategy"]["status"] == "EXECUTED"
    assert float(e.json()["position"]["margin_blocked"]) > 0
    mirrored_orders = api_client.get("/api/v1/trading/orders").json()["orders"]
    assert len(mirrored_orders) == 2
    assert {row["strategy_id"] for row in mirrored_orders} == {sid}

    # mark to market
    m = api_client.post(f"{P}/{sid}/mark-to-market")
    assert m.status_code == 200 and m.json()["updated"] == 1

    # square off
    s = api_client.post(f"{P}/{sid}/square-off", json={"reason": "MANUAL"})
    assert s.status_code == 200
    assert s.json()["is_open"] is False

    # now CLOSED
    assert api_client.get(f"{P}/{sid}").json()["status"] == "CLOSED"


def test_execute_preview_is_visible_in_positions_and_tradebook(api_client, market_open):
    """The one-request Builder flow must not leave its ORM leg collection stale."""
    expanded = api_client.get(
        f"{P}/templates/short_straddle/legs",
        params={"underlying": "NIFTY"},
    )
    assert expanded.status_code == 200, expanded.text

    preview_legs = []
    for index, leg in enumerate(expanded.json()["legs"]):
        preview_legs.append({
            "client_id": f"builder-leg-{index}",
            "included": True,
            "action": leg["action"],
            "instrument_type": leg["instrument_type"],
            "strike": leg["strike"],
            "lots": leg["lots"],
            "expiry": leg["expiry"],
            "entry_price": leg["ltp"],
            "live_ltp": leg["ltp"],
            "iv": leg["iv"],
        })

    executed = api_client.post(f"{P}/execute-preview", json={
        "underlying": "NIFTY",
        "multiplier": 1,
        "name": "Builder straddle",
        "setup_tag": "OI_BASED",
        "product_type": "INTRADAY",
        "legs": preview_legs,
    })
    assert executed.status_code == 200, executed.text
    strategy_id = executed.json()["strategy"]["id"]

    # PositionsWorkspace reads strategy positions from this list endpoint.
    listed = api_client.get(P, params={"page_size": 100})
    assert listed.status_code == 200, listed.text
    visible = next(
        row for row in listed.json()["strategies"]
        if row["id"] == strategy_id
    )
    assert visible["status"] == "EXECUTED"
    assert visible["position"]["is_open"] is True
    assert len(visible["legs"]) == 2

    # An OPEN VirtualOrder is already an executed entry fill and belongs in the
    # tradebook immediately; OPEN describes the resulting position.
    tradebook = api_client.get("/api/v1/trading/tradebook")
    assert tradebook.status_code == 200, tradebook.text
    mirrored = [
        row for row in tradebook.json()["orders"]
        if row["strategy_id"] == strategy_id
    ]
    assert len(mirrored) == 2
    assert all(row["status"] == OrderStatus.OPEN for row in mirrored)


def test_off_hours_exit_keeps_four_leg_nrml_strategy_open(
    api_client, db_session, market_open, monkeypatch
):
    """
    Regression: a carry-forward four-leg position must not realize P&L when its
    user presses Exit before the market opens or after it closes.
    """
    created = api_client.post(f"{P}/from-template", json={
        "template_id": "short_iron_condor",
        "underlying": "NIFTY",
        "lots": 1,
        "setup_tag": "OI_BASED",
        "product_type": "NRML",
    })
    assert created.status_code == 201, created.text
    strategy_id = uuid.UUID(created.json()["id"])
    assert len(created.json()["legs"]) == 4

    executed = api_client.post(f"{P}/{strategy_id}/execute")
    assert executed.status_code == 200, executed.text
    position_id = uuid.UUID(executed.json()["position"]["id"])

    strategy = db_session.query(Strategy).filter(Strategy.id == strategy_id).one()
    account = db_session.query(VirtualAccount).filter(
        VirtualAccount.user_id == strategy.user_id
    ).one()
    balance_before = account.balance

    monkeypatch.setattr("app.core.utils.is_market_open", lambda: False)
    response = api_client.post(
        f"{P}/{strategy_id}/square-off", json={"reason": "MANUAL"}
    )

    assert response.status_code == 400
    assert response.json()["error"] == "MARKET_CLOSED"

    db_session.expire_all()
    strategy = db_session.query(Strategy).filter(
        Strategy.id == strategy_id
    ).one()
    position = db_session.query(StrategyPosition).filter(
        StrategyPosition.id == position_id
    ).one()
    mirrored = db_session.query(VirtualOrder).filter(
        VirtualOrder.strategy_id == strategy_id
    ).all()
    account = db_session.query(VirtualAccount).filter(
        VirtualAccount.user_id == strategy.user_id
    ).one()

    assert strategy.status == StrategyStatus.EXECUTED
    assert strategy.product_type == "NRML"
    assert all(leg.status == LegStatus.OPEN for leg in strategy.legs)
    assert position.is_open is True
    assert position.closed_at is None
    assert position.realized_pnl == Decimal("0.00")
    assert len(mirrored) == 4
    assert all(order.status == OrderStatus.OPEN for order in mirrored)
    assert account.balance == balance_before


def test_execute_twice_is_rejected(api_client, market_open):
    r = api_client.post(f"{P}/from-template", json={
        "template_id": "short_straddle", "underlying": "NIFTY", "setup_tag": "OI_BASED"})
    sid = r.json()["id"]
    assert api_client.post(f"{P}/{sid}/execute").status_code == 200
    again = api_client.post(f"{P}/{sid}/execute")
    assert again.status_code == 400
    assert again.json()["error"] == "STRATEGY_VALIDATION"


def test_manual_draft_add_and_remove_leg(api_client):
    r = api_client.post(f"{P}/draft", json={"underlying": "NIFTY", "name": "Custom"})
    sid = r.json()["id"]
    # add a leg (ATM-ish strike on the 50 grid)
    add = api_client.post(f"{P}/{sid}/legs", json={
        "instrument_type": "CE", "action": "SELL", "lots": 1,
        "expiry": "2026-07-21", "strike": 24000})
    assert add.status_code == 201, add.text
    assert len(add.json()["legs"]) == 1
    leg_id = add.json()["legs"][0]["id"]
    # off-grid strike rejected
    bad = api_client.post(f"{P}/{sid}/legs", json={
        "instrument_type": "PE", "action": "SELL", "lots": 1,
        "expiry": "2026-07-21", "strike": 24075})
    assert bad.status_code == 400 and bad.json()["error"] == "STRATEGY_VALIDATION"
    # remove the leg
    rem = api_client.delete(f"{P}/{sid}/legs/{leg_id}")
    assert rem.status_code == 200 and rem.json()["legs"] == []


def test_builder_configuration_round_trip(api_client):
    payload = {
        "kind": "SAVED",
        "name": "Weekly iron condor",
        "underlying": "NIFTY",
        "schema_version": 1,
        "state": {
            "version": 1,
            "instrument": "NIFTY",
            "legs": [{"id": "client-leg-1", "included": True}],
        },
    }
    created = api_client.post(f"{P}/configurations", json=payload)
    assert created.status_code == 201, created.text
    config_id = created.json()["id"]

    listed = api_client.get(f"{P}/configurations", params={"kind": "SAVED"})
    assert listed.status_code == 200
    assert any(item["id"] == config_id for item in listed.json())

    updated = api_client.patch(
        f"{P}/configurations/{config_id}",
        json={"name": "Updated condor", "state": {**payload["state"], "multiplier": 2}},
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Updated condor"
    assert updated.json()["state"]["multiplier"] == 2

    deleted = api_client.delete(f"{P}/configurations/{config_id}")
    assert deleted.status_code == 204
    assert api_client.get(f"{P}/configurations/{config_id}").status_code == 404


def test_rich_simulation_returns_coherent_target_and_expiry_snapshots(api_client):
    expiry = date.today() + timedelta(days=7)
    target = datetime.combine(
        date.today() + timedelta(days=2),
        datetime.min.time(),
        tzinfo=timezone.utc,
    )
    response = api_client.post(f"{P}/simulate", json={
        "revision": 7,
        "underlying": "NIFTY",
        "spot": 24000,
        "multiplier": 2,
        "target_price": 24100,
        "target_at": target.isoformat(),
        "manual_pnl": 250,
        "include_manual_pnl": True,
        "legs": [{
            "client_id": "leg-1",
            "included": True,
            "action": "BUY",
            "instrument_type": "CE",
            "strike": 24000,
            "lots": 1,
            "expiry": expiry.isoformat(),
            "entry_price": 120,
            "live_ltp": 121,
            "iv": 18,
        }],
    })

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["revision"] == 7
    assert body["snapshot"]["multiplier"] == 2
    assert body["snapshot"]["target_price"] == 24100
    assert len(body["curves"]) >= 100
    assert body["pnl_rows"][0]["client_id"] == "leg-1"
    assert body["projected"]["manual_pnl"] == 250
    assert body["funds"]["funds_needed"] > 0
