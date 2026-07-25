"""
Integration tests for the master Discipline Mode switch (free-play).

Drives the real FastAPI app + service layer + Postgres through the conftest
fixtures. Skipped automatically when Postgres isn't reachable; every test rolls
back so nothing persists.

Covers the locked behaviour:
  - OFF unlocks full sandbox capital and lets a BARE order (no SL / no setup tag)
    through, flagged was_free_play.
  - Free-play trades do NOT move the discipline score.
  - ON restores the guardrails — a bare order is blocked by MANDATORY_SL.
"""

from datetime import date, timedelta
import uuid

from app.market.provider_factory import get_market_provider

P = "/api/v1"


def _order(**over):
    # Use the live ATM strike — a hardcoded strike falls outside the mock
    # chain's drifting window and is (correctly) rejected as unquotable.
    atm = int(get_market_provider().get_option_chain("NIFTY")["atm_strike"])
    base = {
        "client_order_id": str(uuid.uuid4()),
        "instrument": "NIFTY",
        "expiry_date": str(date.today() + timedelta(days=7)),
        "strike_price": atm,
        "option_type": "CE",
        "action": "BUY",
        "quantity": 1,
    }
    base.update(over)
    return base


def test_off_unlocks_capital_and_allows_bare_order(api_client, market_open):
    r = api_client.put(f"{P}/discipline/mode", json={"enabled": False})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["enabled"] is False
    assert body["capital_unlocked"] is True
    assert body["tier"] == "TIER_3"
    # seeded account starts at ₹10,00,000; OFF tops up to full capital (no lower).
    assert float(body["balance"]) >= 1_000_000

    # A bare order — no sl_price, no setup_tag — is accepted in free play.
    o = api_client.post(f"{P}/trading/orders", json=_order())
    assert o.status_code == 201, o.text
    assert o.json()["was_free_play"] is True


def test_free_play_trade_does_not_move_score(api_client, market_open):
    api_client.put(f"{P}/discipline/mode", json={"enabled": False})
    before = api_client.get(f"{P}/discipline/score").json()["score"]

    o = api_client.post(f"{P}/trading/orders", json=_order())
    assert o.status_code == 201, o.text
    order_id = o.json()["id"]

    c = api_client.post(f"{P}/trading/orders/{order_id}/close")
    assert c.status_code == 200, c.text

    after = api_client.get(f"{P}/discipline/score").json()["score"]
    assert after == before   # free-play close excluded from the rolling window


def test_on_restores_mandatory_sl(api_client, market_open):
    # Default is ON. A bare order (no SL) must be blocked by the engine.
    o = api_client.post(f"{P}/trading/orders", json=_order())
    assert o.status_code == 400, o.text
    body = o.json()
    assert body["error"] == "DISCIPLINE_VIOLATION"
    assert body["rule_code"] == "MANDATORY_SL"


def test_rule_activation_can_be_persisted(api_client):
    path = f"{P}/discipline/rules/NO_DIRECTION_FLIP"
    disabled = api_client.put(path, json={"is_active": False})
    assert disabled.status_code == 200, disabled.text
    assert disabled.json()["is_active"] is False

    enabled = api_client.put(path, json={"is_active": True})
    assert enabled.status_code == 200, enabled.text
    assert enabled.json()["is_active"] is True


def test_progress_endpoint_returns_real_read_model(api_client):
    response = api_client.get(f"{P}/discipline/progress")
    assert response.status_code == 200, response.text
    body = response.json()

    assert isinstance(body["score_history"], list)
    assert body["tier_progress"]["current_tier"] in {"TIER_1", "TIER_2", "TIER_3"}
    assert 0 <= body["tier_progress"]["progress_pct"] <= 100
    assert body["discipline_on"]["total_trades"] >= 0
    assert body["discipline_off"]["total_trades"] >= 0
