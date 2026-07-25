"""Integration coverage for atomic and retry-safe single-order placement."""

import uuid
from datetime import date, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.error_handlers import register_error_handlers
from app.database import get_db
from app.dependencies import get_current_user
from app.market.provider_factory import get_market_provider
from app.routers.trading import router


P = "/api/v1"


@pytest.fixture(autouse=True)
def market_is_open(monkeypatch):
    """Keep the HTTP contract deterministic in CI, regardless of wall clock."""
    monkeypatch.setattr(
        "app.services.virtual_order_service.is_market_open",
        lambda: True,
    )


@pytest.fixture
def api_client(db_session, seeded_user):
    """
    Exercise the trading HTTP contract without importing unrelated auth
    startup. This also keeps the test runnable when a developer accidentally
    invokes pytest outside the pinned Python 3.11 environment.
    """
    app = FastAPI()
    register_error_handlers(app)
    app.include_router(router, prefix=P)
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_current_user] = lambda: seeded_user
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def _order(client_order_id=None, **changes):
    chain = get_market_provider().get_option_chain("NIFTY")
    payload = {
        "client_order_id": str(client_order_id or uuid.uuid4()),
        "instrument": "NIFTY",
        "expiry_date": str(date.today() + timedelta(days=7)),
        "strike_price": int(chain["atm_strike"]),
        "option_type": "CE",
        "action": "BUY",
        "quantity": 1,
        "sl_price": "1.00",
        "target_price": "1000.00",
        "setup_tag": "OI_BASED",
    }
    payload.update(changes)
    return payload


def test_client_order_id_is_required(api_client):
    payload = _order()
    payload.pop("client_order_id")

    response = api_client.post(f"{P}/trading/orders", json=payload)

    assert response.status_code == 422


def test_retry_returns_original_order_without_second_balance_mutation(api_client):
    client_order_id = uuid.uuid4()
    payload = _order(client_order_id)
    before = api_client.get(f"{P}/trading/account").json()

    first = api_client.post(f"{P}/trading/orders", json=payload)
    replay = api_client.post(f"{P}/trading/orders", json=payload)
    after = api_client.get(f"{P}/trading/account").json()

    assert first.status_code == 201, first.text
    assert replay.status_code == 200, replay.text
    assert replay.json()["id"] == first.json()["id"]
    assert replay.json()["client_order_id"] == str(client_order_id)
    assert after["today_trades"] == before["today_trades"] + 1


def test_reusing_client_order_id_with_different_payload_is_conflict(api_client):
    client_order_id = uuid.uuid4()
    payload = _order(client_order_id)
    first = api_client.post(f"{P}/trading/orders", json=payload)
    assert first.status_code == 201, first.text

    conflict = api_client.post(
        f"{P}/trading/orders",
        json={**payload, "quantity": 2},
    )

    assert conflict.status_code == 409
    assert conflict.json()["error"] == "IDEMPOTENCY_CONFLICT"
