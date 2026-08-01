"""Integration coverage for the Profile workspace (overview + identity edits)."""

import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest

from app.core.security import hash_password, verify_password
from app.models.virtual_account import VirtualAccount
from app.models.virtual_order import VirtualOrder


@pytest.fixture
def account(db_session, seeded_user):
    return db_session.query(VirtualAccount).filter(
        VirtualAccount.user_id == seeded_user.id
    ).one()


def _closed_order(db_session, user, account, *, instrument, strike, pnl):
    """One closed order. pnl is post-exit-brokerage; net = pnl - entry_brokerage(20)."""
    order = VirtualOrder(
        id=uuid.uuid4(), user_id=user.id, tenant_id=user.tenant_id, account_id=account.id,
        instrument=instrument, expiry_date=date.today() + timedelta(days=7),
        strike_price=Decimal(str(strike)), option_type="CE", action="BUY",
        quantity=50, lot_size=50, entry_ltp=Decimal("100"), entry_price=Decimal("100"),
        exit_price=Decimal("110"), status="CLOSED", product_type="INTRADAY",
        trading_day=date.today(), exit_time=datetime.utcnow(),
        pnl=Decimal(str(pnl)), brokerage=Decimal("40"),
        entry_brokerage=Decimal("20"), setup_tag="OI_BASED",
    )
    db_session.add(order)
    db_session.flush()
    return order


# ── Overview ──────────────────────────────────────────────────────

def test_overview_lifetime_stats(api_client, db_session, seeded_user, account):
    # winner: net = 500 - 20 = 480 ; loser: net = -300 - 20 = -320
    _closed_order(db_session, seeded_user, account, instrument="NIFTY", strike=23000, pnl=500)
    _closed_order(db_session, seeded_user, account, instrument="BANKNIFTY", strike=48000, pnl=-300)
    db_session.flush()

    resp = api_client.get("/api/v1/profile/overview")
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert body["stats"]["total_trades"] == 2
    assert Decimal(body["stats"]["net_realized"]) == Decimal("160.00")  # 480 - 320
    assert body["stats"]["win_rate"] == 50.0
    assert Decimal(body["account"]["balance"]) == Decimal(str(account.balance))
    assert body["account"]["tier"] == account.tier


def test_overview_empty_account(api_client):
    resp = api_client.get("/api/v1/profile/overview")
    assert resp.status_code == 200, resp.text
    stats = resp.json()["stats"]
    assert stats["total_trades"] == 0
    assert Decimal(stats["net_realized"]) == Decimal("0.00")
    assert stats["win_rate"] == 0.0


# ── Phone round-trip through PUT /auth/me ─────────────────────────

def test_phone_update_and_me_roundtrip(api_client):
    put = api_client.put("/api/v1/auth/me", json={"full_name": "New Name", "phone": "+91 98765 43210"})
    assert put.status_code == 200, put.text
    assert put.json()["phone"] == "+91 98765 43210"

    me = api_client.get("/api/v1/auth/me")
    assert me.json()["phone"] == "+91 98765 43210"
    assert me.json()["full_name"] == "New Name"


def test_phone_omitted_leaves_it_unchanged(api_client):
    api_client.put("/api/v1/auth/me", json={"full_name": "N", "phone": "9998887776"})
    # A name-only save (no phone key) must not wipe the stored number.
    resp = api_client.put("/api/v1/auth/me", json={"full_name": "Renamed"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["phone"] == "9998887776"


def test_phone_empty_string_clears_it(api_client):
    api_client.put("/api/v1/auth/me", json={"full_name": "N", "phone": "9998887776"})
    resp = api_client.put("/api/v1/auth/me", json={"full_name": "N", "phone": ""})
    assert resp.status_code == 200, resp.text
    assert resp.json()["phone"] is None


def test_phone_rejects_garbage(api_client):
    resp = api_client.put("/api/v1/auth/me", json={"full_name": "N", "phone": "not-a-number!!"})
    assert resp.status_code == 422


# ── Change password ───────────────────────────────────────────────

def test_change_password_happy(api_client, db_session, seeded_user):
    seeded_user.hashed_password = hash_password("current123")
    seeded_user.has_usable_password = True
    db_session.flush()

    resp = api_client.post("/api/v1/auth/change-password", json={
        "current_password": "current123", "new_password": "brandnew456",
    })
    assert resp.status_code == 200, resp.text
    assert verify_password("brandnew456", seeded_user.hashed_password)


def test_change_password_wrong_current(api_client, db_session, seeded_user):
    seeded_user.hashed_password = hash_password("current123")
    seeded_user.has_usable_password = True
    db_session.flush()

    resp = api_client.post("/api/v1/auth/change-password", json={
        "current_password": "WRONG", "new_password": "brandnew456",
    })
    assert resp.status_code == 400
    assert "incorrect" in resp.json()["detail"].lower()


def test_change_password_blocked_for_oauth(api_client, db_session, seeded_user):
    seeded_user.has_usable_password = False
    db_session.flush()

    resp = api_client.post("/api/v1/auth/change-password", json={
        "current_password": "whatever1", "new_password": "brandnew456",
    })
    assert resp.status_code == 400
    assert "google" in resp.json()["detail"].lower()


def test_change_password_min_length(api_client, db_session, seeded_user):
    seeded_user.hashed_password = hash_password("current123")
    seeded_user.has_usable_password = True
    db_session.flush()

    resp = api_client.post("/api/v1/auth/change-password", json={
        "current_password": "current123", "new_password": "short",
    })
    assert resp.status_code == 422


# ── Avatar ────────────────────────────────────────────────────────

# A real 1×1 PNG (valid magic bytes + base64).
_PNG_1PX = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)


def test_set_avatar_roundtrip(api_client):
    put = api_client.put("/api/v1/profile/avatar", json={"image": _PNG_1PX})
    assert put.status_code == 200, put.text
    assert put.json()["avatar_url"] == _PNG_1PX

    me = api_client.get("/api/v1/auth/me")
    assert me.json()["avatar_url"] == _PNG_1PX


def test_delete_avatar_clears_it(api_client):
    api_client.put("/api/v1/profile/avatar", json={"image": _PNG_1PX})
    resp = api_client.delete("/api/v1/profile/avatar")
    assert resp.status_code == 200, resp.text
    assert resp.json()["avatar_url"] is None


def test_avatar_rejects_svg(api_client):
    svg = "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="
    resp = api_client.put("/api/v1/profile/avatar", json={"image": svg})
    assert resp.status_code == 422


def test_avatar_rejects_non_data_uri(api_client):
    resp = api_client.put("/api/v1/profile/avatar", json={"image": "https://evil.example/x.png"})
    assert resp.status_code == 422


def test_avatar_rejects_fake_image_bytes(api_client):
    # Correct prefix + valid base64, but the payload isn't a real PNG/JPEG/WEBP.
    fake = "data:image/png;base64,aGVsbG8gd29ybGQ="  # "hello world"
    resp = api_client.put("/api/v1/profile/avatar", json={"image": fake})
    assert resp.status_code == 422


def test_avatar_rejects_oversized(api_client):
    import base64
    blob = b"\x89PNG\r\n\x1a\n" + b"\x00" * (520 * 1024)  # valid magic, > 512 KB
    big = "data:image/png;base64," + base64.b64encode(blob).decode()
    resp = api_client.put("/api/v1/profile/avatar", json={"image": big})
    assert resp.status_code == 422


# ── Preset avatar ─────────────────────────────────────────────────

def test_set_avatar_preset_roundtrip(api_client):
    put = api_client.put("/api/v1/profile/avatar-preset", json={"preset": "women_3"})
    assert put.status_code == 200, put.text
    assert put.json()["avatar_preset"] == "women_3"
    assert api_client.get("/api/v1/auth/me").json()["avatar_preset"] == "women_3"


def test_avatar_preset_rejects_unknown(api_client):
    resp = api_client.put("/api/v1/profile/avatar-preset", json={"preset": "alien_9"})
    assert resp.status_code == 422


def test_delete_avatar_preset_clears_it(api_client):
    api_client.put("/api/v1/profile/avatar-preset", json={"preset": "men_1"})
    resp = api_client.delete("/api/v1/profile/avatar-preset")
    assert resp.status_code == 200, resp.text
    assert resp.json()["avatar_preset"] is None


def test_photo_and_preset_are_independent(api_client):
    api_client.put("/api/v1/profile/avatar", json={"image": _PNG_1PX})
    api_client.put("/api/v1/profile/avatar-preset", json={"preset": "men_2"})
    me = api_client.get("/api/v1/auth/me").json()
    assert me["avatar_url"] == _PNG_1PX and me["avatar_preset"] == "men_2"


def test_profile_requires_auth_at_boot():
    # The security kernel refuses to boot if any route is unauthenticated and
    # undeclared; a clean import proves the new profile routes are authenticated.
    import app.main as m
    audit = m.app.state.security_audit
    assert audit["authenticated"] >= 109
