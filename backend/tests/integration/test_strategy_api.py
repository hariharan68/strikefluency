"""
Integration tests for the Strategy Builder HTTP API (Phase 9).

Drives the real FastAPI app + service layer + Postgres through fixtures in
conftest.py. Skipped automatically when Postgres isn't reachable. Every test
rolls back — nothing persists.
"""

from datetime import date, datetime, timedelta, timezone

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
