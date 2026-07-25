from datetime import datetime, timezone
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

import pytest

from app.market.kite_provider import KiteMarketDataProvider, normalize_quote
from app.market import provider_factory
from app.market.kite_feed_worker import KiteFeedWorker
from app.services import kite_auth_service as auth
from app.services.kite_instrument_service import normalize_instrument


def test_credentials_status_never_returns_secret(monkeypatch):
    monkeypatch.setattr(auth.settings, "KITE_API_KEY", "abcd123456")
    monkeypatch.setattr(auth.settings, "KITE_API_SECRET", "do-not-return-me")

    payload = auth.credentials_status()

    assert payload["api_key_masked"] == "abcd****56"
    assert "api_secret" not in payload
    assert "do-not-return-me" not in repr(payload)


def test_callback_operation_is_consumed_and_token_is_not_returned(monkeypatch):
    operations = [{"admin_id": "admin-1"}, None]

    class FakeKite:
        def generate_session(self, request_token, api_secret):
            assert request_token == "one-time"
            assert api_secret == "server-secret"
            return {"access_token": "encrypted-at-rest-token"}

        def set_access_token(self, token):
            assert token == "encrypted-at-rest-token"

        def profile(self):
            return {"user_id": "AB1234", "user_name": "Admin"}

    monkeypatch.setattr(auth.settings, "KITE_API_SECRET", "server-secret")
    monkeypatch.setattr(auth.kite_cache, "consume_operation", lambda _value: operations.pop(0))
    monkeypatch.setattr(auth, "_kite", lambda _token=None: FakeKite())
    monkeypatch.setattr(auth, "_disconnect_other_brokers", lambda: None)
    monkeypatch.setattr(auth.token_store, "set_access_token", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(auth, "save_kite_token_best_effort", lambda token, meta: True)
    monkeypatch.setattr(auth, "activate_provider", lambda: None)
    monkeypatch.setattr(auth.kite_cache, "set_status", lambda *_args, **kwargs: kwargs)

    result = auth.exchange_request_token("one-time", "operation")

    assert result["profile"]["user_id"] == "AB1234"
    assert "access_token" not in result
    with pytest.raises(ValueError, match="missing, expired, or already used"):
        auth.exchange_request_token("one-time", "operation")


def test_login_preflight_reports_rejected_api_key(monkeypatch):
    class Response:
        status_code = 400

        @staticmethod
        def json():
            return {"message": "Invalid `api_key`."}

    monkeypatch.setattr(auth.httpx, "get", lambda *_args, **_kwargs: Response())

    with pytest.raises(ValueError, match="same active Connect app"):
        auth.validate_api_key()


def test_login_uses_encoded_redirect_state(monkeypatch):
    monkeypatch.setattr(auth.settings, "KITE_API_KEY", "abcdefghijklmnop")
    monkeypatch.setattr(auth.settings, "KITE_API_SECRET", "s" * 32)
    monkeypatch.setattr(auth, "validate_api_key", lambda: None)
    monkeypatch.setattr(auth.kite_cache, "create_operation", lambda _admin: "operation-token")
    monkeypatch.setattr(auth.kite_cache, "set_status", lambda *_args, **_kwargs: None)

    payload = auth.create_login("admin-id")
    params = parse_qs(urlparse(payload["login_url"]).query)

    assert params["api_key"] == ["abcdefghijklmnop"]
    assert params["redirect_params"] == ["state=operation-token"]


def test_instrument_normalization_resolves_supported_underlyings():
    synced = datetime.now(timezone.utc).replace(tzinfo=None)
    row = normalize_instrument({
        "instrument_token": 123,
        "exchange_token": "45",
        "exchange": "NFO",
        "segment": "NFO-OPT",
        "tradingsymbol": "BANKNIFTY26JUL50000CE",
        "name": "BANKNIFTY",
        "expiry": "2026-07-30",
        "strike": 50000,
        "tick_size": 0.05,
        "lot_size": 30,
        "instrument_type": "CE",
    }, synced)

    assert row["underlying"] == "BANKNIFTY"
    assert row["expiry"].isoformat() == "2026-07-30"
    assert row["lot_size"] == 30


def test_tick_fixture_normalizes_oi_depth_and_volume():
    instrument = SimpleNamespace(
        instrument_token=123, exchange="NFO", tradingsymbol="NIFTYCE",
    )
    quote = normalize_quote(instrument, {
        "last_price": 101.25,
        "volume_traded": 2500,
        "oi": 10000,
        "depth": {
            "buy": [{"price": 101.0, "quantity": 65}],
            "sell": [{"price": 101.5, "quantity": 130}],
        },
    }, received_at=100.0)

    assert quote["last_price"] == 101.25
    assert quote["oi"] == 10000
    assert quote["volume"] == 2500
    assert quote["bid"] == 101.0
    assert quote["ask"] == 101.5


def test_stale_or_unavailable_kite_data_blocks_new_orders():
    provider = KiteMarketDataProvider("api-key", None)

    with pytest.raises(RuntimeError, match="too old"):
        provider.assert_orderable({
            "source": "kite_cached",
            "age_ms": provider_status_limit_ms() + 1,
        })
    with pytest.raises(RuntimeError, match="unavailable"):
        provider.assert_orderable({"source": "unavailable", "age_ms": None})


def test_selected_kite_never_falls_back_to_mock(monkeypatch):
    from app.services import kite_auth_service

    monkeypatch.setattr(auth.settings, "KITE_API_KEY", "")
    monkeypatch.setattr(kite_auth_service, "get_saved_access_token", lambda: "")

    provider = provider_factory._create_kite_provider(auth.settings)

    assert isinstance(provider, KiteMarketDataProvider)
    assert provider.is_connected() is False


def test_feed_worker_waits_cleanly_when_login_has_not_happened(monkeypatch):
    import app.config as config_module
    from app.market import kite_feed_worker

    worker = KiteFeedWorker()
    states = []
    monkeypatch.setattr(
        config_module, "Settings",
        lambda: SimpleNamespace(KITE_API_KEY=""),
    )
    monkeypatch.setattr(kite_feed_worker.auth, "get_saved_access_token", lambda: "")
    monkeypatch.setattr(
        kite_feed_worker.kite_cache, "set_status",
        lambda state, **fields: states.append((state, fields)),
    )

    def stop_after_first_wait(_seconds):
        worker._stopping.set()
        return True

    monkeypatch.setattr(worker._stopping, "wait", stop_after_first_wait)

    assert worker.run() is None
    assert states[0][0] == "reconnect_required"


def provider_status_limit_ms() -> int:
    from app.config import settings
    return settings.KITE_ORDER_BLOCK_SECONDS * 1000
