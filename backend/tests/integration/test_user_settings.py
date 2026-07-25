"""
Integration tests for per-user settings (/settings) and profile update (PUT /auth/me).

Drives the real FastAPI app + service layer + Postgres via the conftest fixtures.
Skipped automatically when Postgres isn't reachable; every test rolls back.
"""

P = "/api/v1"


def test_settings_returns_full_defaults_for_new_user(api_client):
    r = api_client.get(f"{P}/settings")
    assert r.status_code == 200, r.text
    body = r.json()
    # A brand-new user gets the complete defaulted object.
    assert body["default_instrument"] == "NIFTY"
    assert body["default_lots"] == 1
    assert body["confirm_close"] is True
    assert body["auto_fill_ltp"] is True
    assert body["notify_trade_confirm"] is False


def test_settings_patch_persists_and_merges(api_client):
    r = api_client.put(f"{P}/settings", json={"default_instrument": "BANKNIFTY", "default_lots": 3})
    assert r.status_code == 200, r.text
    assert r.json()["default_instrument"] == "BANKNIFTY"
    assert r.json()["default_lots"] == 3

    # A second partial patch must not wipe the first.
    r2 = api_client.put(f"{P}/settings", json={"auto_fill_ltp": False})
    assert r2.status_code == 200, r2.text
    body = r2.json()
    assert body["auto_fill_ltp"] is False
    assert body["default_instrument"] == "BANKNIFTY"   # preserved
    assert body["default_lots"] == 3                    # preserved

    # And it survives a fresh GET.
    assert api_client.get(f"{P}/settings").json()["default_instrument"] == "BANKNIFTY"


def test_settings_rejects_bad_values(api_client):
    assert api_client.put(f"{P}/settings", json={"default_instrument": "DOGE"}).status_code == 422
    assert api_client.put(f"{P}/settings", json={"default_lots": 0}).status_code == 422
    assert api_client.put(f"{P}/settings", json={"unknown_key": 1}).status_code == 422


def test_profile_update_changes_full_name(api_client):
    r = api_client.put(f"{P}/auth/me", json={"full_name": "New Name"})
    assert r.status_code == 200, r.text
    assert r.json()["full_name"] == "New Name"
    assert api_client.get(f"{P}/auth/me").json()["full_name"] == "New Name"


def test_profile_update_rejects_empty_name(api_client):
    assert api_client.put(f"{P}/auth/me", json={"full_name": "   "}).status_code == 422
