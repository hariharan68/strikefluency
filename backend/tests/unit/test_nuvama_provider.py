import json
from threading import Event, Lock
from types import SimpleNamespace

import pytest

from app.market.mock_provider import MockMarketDataProvider
from app.market import nuvama_provider as nuvama_provider_module
from app.market.nuvama_provider import NUVAMA_SYMBOLS, NuvamaMarketDataProvider
from app.brokers.nuvama import sdk as nuvama_sdk
from app.services import nuvama_auth_service


class FakeAPIConnect:
    def __init__(self, prices=None, error=None):
        self.prices = prices or {}
        self.error = error
        self.calls = []

    def GetMarketDepth(self, symbol):
        self.calls.append(symbol)
        if self.error:
            return json.dumps({"error": {"errMsg": self.error}})
        return json.dumps({
            "data": {
                "sym": symbol,
                "ltp": str(self.prices[symbol]),
            }
        })

    def GetLoginData(self):
        return json.dumps({"data": {"lgnData": {"accTyp": "EQ"}}})


def provider_with(api):
    provider = NuvamaMarketDataProvider.__new__(NuvamaMarketDataProvider)
    provider._api = api
    provider._connected = True
    provider._mock = MockMarketDataProvider()
    provider._cache = {}
    provider._last_good = {}
    provider._stream_quotes = {}
    provider._stream_lock = Lock()
    provider._stream_ready = Event()
    provider._quote_streamer = None
    return provider


def test_spot_quotes_use_verified_nuvama_stream_tokens():
    api = FakeAPIConnect({
        "-29": 23641.20,
        "-21": 55210.45,
        "-101": 75588.29,
    })
    provider = provider_with(api)

    for symbol, price in api.prices.items():
        provider._handle_mini_quote(json.dumps({
            "response": {
                "streaming_type": "miniquote",
                "data": {"sym": symbol, "ltp": str(price)},
            }
        }))

    assert provider._fetch_spot_price("NIFTY") == 23641.20
    assert provider._fetch_spot_price("BANKNIFTY") == 55210.45
    assert provider._fetch_spot_price("SENSEX") == 75588.29
    assert set(provider._stream_quotes) == set(NUVAMA_SYMBOLS.values())


def test_missing_stream_quotes_do_not_validate_the_session(monkeypatch):
    provider = provider_with(FakeAPIConnect(error="Session Expired"))
    monkeypatch.setattr(nuvama_provider_module, "STREAM_READY_TIMEOUT_SECONDS", 0)

    assert provider._ping() is False
    with pytest.raises(RuntimeError, match="no price"):
        provider._fetch_spot_price("NIFTY")


def test_mock_option_chain_preserves_live_nuvama_underlying(monkeypatch):
    api = FakeAPIConnect({"-29": 23641.20})
    provider = provider_with(api)
    provider._handle_mini_quote(json.dumps({
        "response": {"data": {"sym": "-29", "ltp": "23641.20"}}
    }))

    def unavailable(*_args, **_kwargs):
        raise RuntimeError("APIConnect has no option-chain method")

    monkeypatch.setattr(provider, "_fetch_option_chain", unavailable)
    chain = provider.get_option_chain("NIFTY")

    assert chain["spot_price"] == 23641.20
    assert chain["source"] == "nuvama_live_spot_mock_chain"


def test_auth_validation_and_login_profile_shapes():
    api = FakeAPIConnect({"-29": 23641.20})

    assert nuvama_auth_service._validate_live_session(api)["data"]["lgnData"]["accTyp"] == "EQ"
    assert nuvama_auth_service._profile_ok({
        "data": {"lgnData": {"accTyp": "EQ"}}
    })


def test_sdk_feed_uses_authenticated_app_id_key():
    api = SimpleNamespace(
        _APIConnect__constants=SimpleNamespace(AppIdKey="current-session-key"),
        _APIConnect__feedObj=SimpleNamespace(_appID="expired-hard-coded-key"),
    )

    nuvama_sdk._sync_feed_app_id(api)

    assert api._APIConnect__feedObj._appID == "current-session-key"


def test_sdk_feed_socket_is_reconfigured_for_utf8(monkeypatch):
    class FakeStream:
        def __init__(self):
            self.args = None

        def reconfigure(self, **kwargs):
            self.args = kwargs

    from feed.feed import Feed

    original = Feed._Feed__create_connection
    fake_stream = FakeStream()

    def fake_connect(feed):
        feed._socket_fs = fake_stream

    monkeypatch.setattr(Feed, "_Feed__create_connection", fake_connect)
    nuvama_sdk._install_utf8_feed_socket()

    instance = Feed.__new__(Feed)
    Feed._Feed__create_connection(instance)

    assert fake_stream.args == {"encoding": "utf-8", "errors": "ignore"}
    monkeypatch.setattr(Feed, "_Feed__create_connection", original)


def test_index_stream_uses_nuvama_web_subscription_shape():
    class FakeFeed:
        _appID = "current-session-key"

        def __init__(self):
            self.subscription = None

        def _subscribe(self, request, callback, request_code):
            self.subscription = (json.loads(request), callback, request_code)

    callback = lambda raw: raw
    feed = FakeFeed()
    api = SimpleNamespace(_APIConnect__feedObj=feed)

    returned = nuvama_sdk.subscribe_index_mini_quotes(
        api,
        ["-29", "-21", "-101"],
        callback,
    )

    request, saved_callback, request_code = feed.subscription
    assert returned is feed
    assert saved_callback is callback
    assert request["request"] == {
        "streaming_type": "miniquote",
        "data": {
            "symbols": [
                {"symbol": "-29"},
                {"symbol": "-21"},
                {"symbol": "-101"},
            ]
        },
        "formFactor": "W",
        "appID": "current-session-key",
        "response_format": "json",
        "request_type": "subscribe",
    }
    assert request_code.name == "MINI_QUOTE_STREAM_REQ_CODE"
