"""
Integration coverage for resting LIMIT orders.

The behaviour that matters: a LIMIT order must NOT open a position at placement.
It rests in the pending book, blocks margin, and only becomes a real order once
the premium actually reaches the limit.
"""

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.error_handlers import register_error_handlers
from app.database import get_db
from app.dependencies import get_current_user
from app.market.provider_factory import get_market_provider
from app.models.pending_order import PendingOrder
from app.routers.trading import router
from app.services.pending_order_service import (
    expire_pending_orders,
    scan_and_fill,
)


P = "/api/v1"


@pytest.fixture(autouse=True)
def market_is_open(monkeypatch):
    """Keep the HTTP contract deterministic in CI, regardless of wall clock."""
    for module in (
        "app.services.virtual_order_service",
        "app.services.pending_order_service",
    ):
        monkeypatch.setattr(f"{module}.is_market_open", lambda: True)


@pytest.fixture
def api_client(db_session, seeded_user):
    app = FastAPI()
    register_error_handlers(app)
    app.include_router(router, prefix=P)
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_current_user] = lambda: seeded_user
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


def _atm_ltp(option_type="CE"):
    chain = get_market_provider().get_option_chain("NIFTY")
    strike = int(chain["atm_strike"])
    for row in chain["strikes"]:
        if row["strike"] == strike:
            side = "ce" if option_type == "CE" else "pe"
            return strike, Decimal(str(row[side]["ltp"]))
    raise AssertionError("ATM strike missing from the mock chain")


def _limit(limit_price, client_order_id=None, **changes):
    strike, _ltp = _atm_ltp()
    payload = {
        "client_order_id": str(client_order_id or uuid.uuid4()),
        "instrument": "NIFTY",
        "expiry_date": str(date.today() + timedelta(days=7)),
        "strike_price": strike,
        "option_type": "CE",
        "action": "BUY",
        "quantity": 1,
        "limit_price": str(limit_price),
        "sl_price": "0.50",
        "target_price": "100000.00",
        "setup_tag": "OI_BASED",
    }
    payload.update(changes)
    return payload


# ── The bug this module exists to prevent ─────────────────────

def test_limit_order_does_not_open_a_position(api_client):
    """A limit far below the market must rest, not execute."""
    _strike, ltp = _atm_ltp()
    resting = ltp / 2   # unreachable on the current tick

    response = api_client.post(f"{P}/trading/pending", json=_limit(resting))

    assert response.status_code == 201, response.text
    assert response.json()["status"] == "PENDING"

    positions = api_client.get(f"{P}/trading/positions").json()
    assert positions["positions"] == []

    orders = api_client.get(f"{P}/trading/orders").json()
    assert orders["orders"] == []


def test_limit_order_blocks_margin_at_placement(api_client):
    _strike, ltp = _atm_ltp()
    resting = (ltp / 2).quantize(Decimal("0.01"))
    before = Decimal(api_client.get(f"{P}/trading/account").json()["account"]["balance"])

    placed = api_client.post(f"{P}/trading/pending", json=_limit(resting))
    assert placed.status_code == 201, placed.text

    after = Decimal(api_client.get(f"{P}/trading/account").json()["account"]["balance"])
    blocked = Decimal(placed.json()["margin_blocked"])

    assert blocked > 0
    assert after == before - blocked


def test_cancel_releases_the_blocked_margin(api_client):
    _strike, ltp = _atm_ltp()
    before = Decimal(api_client.get(f"{P}/trading/account").json()["account"]["balance"])

    placed = api_client.post(f"{P}/trading/pending", json=_limit(ltp / 2))
    pending_id = placed.json()["id"]

    cancelled = api_client.post(f"{P}/trading/pending/{pending_id}/cancel")

    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["pending_order"]["status"] == "CANCELLED"

    after = Decimal(api_client.get(f"{P}/trading/account").json()["account"]["balance"])
    assert after == before


def test_cancelling_twice_is_rejected(api_client):
    _strike, ltp = _atm_ltp()
    pending_id = api_client.post(f"{P}/trading/pending", json=_limit(ltp / 2)).json()["id"]

    assert api_client.post(f"{P}/trading/pending/{pending_id}/cancel").status_code == 200
    second = api_client.post(f"{P}/trading/pending/{pending_id}/cancel")

    assert second.status_code == 400
    assert second.json()["error"] == "PENDING_ORDER_NOT_CANCELLABLE"


# ── Triggering ────────────────────────────────────────────────

def test_marketable_limit_fills_on_the_next_scan(api_client, db_session):
    """A BUY limit above the market is marketable and fills when scanned."""
    _strike, ltp = _atm_ltp()
    placed = api_client.post(f"{P}/trading/pending", json=_limit(ltp * 2))
    pending_id = placed.json()["id"]
    assert placed.json()["status"] == "PENDING"

    filled = scan_and_fill(db_session)

    assert filled == 1
    row = db_session.query(PendingOrder).filter(PendingOrder.id == pending_id).first()
    assert row.status == "FILLED"
    assert row.filled_order_id is not None
    assert row.margin_blocked == Decimal("0.00")

    # The fill produced a real position, exactly as a market order would.
    positions = api_client.get(f"{P}/trading/positions").json()
    assert len(positions["positions"]) == 1


def test_unreachable_limit_stays_pending_across_scans(api_client, db_session):
    _strike, ltp = _atm_ltp()
    pending_id = api_client.post(f"{P}/trading/pending", json=_limit(ltp / 4)).json()["id"]

    assert scan_and_fill(db_session) == 0
    assert scan_and_fill(db_session) == 0

    row = db_session.query(PendingOrder).filter(PendingOrder.id == pending_id).first()
    assert row.status == "PENDING"
    assert api_client.get(f"{P}/trading/positions").json()["positions"] == []


def test_sell_limit_triggers_on_the_opposite_side(api_client, db_session):
    """A SELL limit below the market is marketable; above it must rest."""
    _strike, ltp = _atm_ltp()

    resting = api_client.post(f"{P}/trading/pending", json=_limit(
        ltp * 2, action="SELL", sl_price=str((ltp * 4).quantize(Decimal("0.01"))),
        target_price="0.50",
    ))
    assert resting.status_code == 201, resting.text

    assert scan_and_fill(db_session) == 0
    row = db_session.query(PendingOrder).filter(
        PendingOrder.id == resting.json()["id"]
    ).first()
    assert row.status == "PENDING"


def test_cancelled_order_is_never_filled(api_client, db_session):
    _strike, ltp = _atm_ltp()
    # Marketable, so it would fill on the very next scan if not cancelled.
    pending_id = api_client.post(f"{P}/trading/pending", json=_limit(ltp * 2)).json()["id"]
    api_client.post(f"{P}/trading/pending/{pending_id}/cancel")

    assert scan_and_fill(db_session) == 0
    assert api_client.get(f"{P}/trading/positions").json()["positions"] == []


# ── Discipline ────────────────────────────────────────────────

def test_discipline_rules_run_at_placement(api_client):
    """A limit order with no SL is refused up front, like a market order."""
    _strike, ltp = _atm_ltp()
    payload = _limit(ltp / 2)
    payload.pop("sl_price")

    response = api_client.post(f"{P}/trading/pending", json=payload)

    assert response.status_code == 400
    assert response.json()["rule_code"] == "MANDATORY_SL"


def test_sl_is_validated_against_the_limit_not_the_market(api_client):
    """
    A BUY limit at half the market with an SL above that limit is nonsense even
    though the SL sits below the current premium.
    """
    _strike, ltp = _atm_ltp()
    resting = (ltp / 2).quantize(Decimal("0.01"))
    bad_sl = (resting + Decimal("5.00")).quantize(Decimal("0.01"))
    assert bad_sl < ltp, "fixture assumption: the SL is still below the market"

    response = api_client.post(f"{P}/trading/pending", json=_limit(resting, sl_price=str(bad_sl)))

    assert response.status_code == 400
    assert response.json()["rule_code"] == "MANDATORY_SL"


# ── Book views and lifecycle ──────────────────────────────────

def test_pending_book_splits_open_from_executed(api_client, db_session):
    _strike, ltp = _atm_ltp()
    resting_id = api_client.post(f"{P}/trading/pending", json=_limit(ltp / 4)).json()["id"]
    cancelled_id = api_client.post(f"{P}/trading/pending", json=_limit(ltp / 4)).json()["id"]
    api_client.post(f"{P}/trading/pending/{cancelled_id}/cancel")

    book = api_client.get(f"{P}/trading/pending").json()
    assert book["open_count"] == 1
    assert book["executed_count"] == 1

    open_view = api_client.get(f"{P}/trading/pending", params={"view": "open"}).json()
    assert [r["id"] for r in open_view["pending_orders"]] == [resting_id]

    done_view = api_client.get(f"{P}/trading/pending", params={"view": "executed"}).json()
    assert [r["id"] for r in done_view["pending_orders"]] == [cancelled_id]


def test_expiry_releases_margin_of_unfilled_orders(api_client, db_session):
    _strike, ltp = _atm_ltp()
    before = Decimal(api_client.get(f"{P}/trading/account").json()["account"]["balance"])
    pending_id = api_client.post(f"{P}/trading/pending", json=_limit(ltp / 4)).json()["id"]

    # A scheduler job: it sweeps every user's book, so the return count depends
    # on whatever else is resting in the database. Assert on this order instead.
    expired = expire_pending_orders(db_session)
    db_session.commit()

    assert expired >= 1
    row = db_session.query(PendingOrder).filter(PendingOrder.id == pending_id).first()
    assert row.status == "EXPIRED"
    after = Decimal(api_client.get(f"{P}/trading/account").json()["account"]["balance"])
    assert after == before


def test_retry_returns_the_original_pending_order(api_client):
    _strike, ltp = _atm_ltp()
    client_order_id = uuid.uuid4()
    payload = _limit(ltp / 4, client_order_id)
    before = Decimal(api_client.get(f"{P}/trading/account").json()["account"]["balance"])

    first = api_client.post(f"{P}/trading/pending", json=payload)
    replay = api_client.post(f"{P}/trading/pending", json=payload)

    assert first.status_code == 201, first.text
    assert replay.status_code == 200, replay.text
    assert replay.json()["id"] == first.json()["id"]

    # The retry must not block margin a second time.
    after = Decimal(api_client.get(f"{P}/trading/account").json()["account"]["balance"])
    assert after == before - Decimal(first.json()["margin_blocked"])


def test_reusing_client_order_id_with_different_terms_is_conflict(api_client):
    _strike, ltp = _atm_ltp()
    client_order_id = uuid.uuid4()
    payload = _limit(ltp / 4, client_order_id)
    assert api_client.post(f"{P}/trading/pending", json=payload).status_code == 201

    conflict = api_client.post(
        f"{P}/trading/pending",
        json={**payload, "limit_price": str((ltp / 3).quantize(Decimal("0.01")))},
    )

    assert conflict.status_code == 409
    assert conflict.json()["error"] == "IDEMPOTENCY_CONFLICT"
