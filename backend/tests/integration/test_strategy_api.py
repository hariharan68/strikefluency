"""
Integration tests for the Strategy Builder HTTP API (Phase 9).

Drives the real FastAPI app + service layer + Postgres through fixtures in
conftest.py. Skipped automatically when Postgres isn't reachable. Every test
rolls back — nothing persists.
"""

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


def test_full_lifecycle(api_client):
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

    # mark to market
    m = api_client.post(f"{P}/{sid}/mark-to-market")
    assert m.status_code == 200 and m.json()["updated"] == 1

    # square off
    s = api_client.post(f"{P}/{sid}/square-off", json={"reason": "MANUAL"})
    assert s.status_code == 200
    assert s.json()["is_open"] is False

    # now CLOSED
    assert api_client.get(f"{P}/{sid}").json()["status"] == "CLOSED"


def test_execute_twice_is_rejected(api_client):
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
