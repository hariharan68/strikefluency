"""Small safety wrapper around Nuvama's synchronous APIConnect SDK."""

from __future__ import annotations

import json
from contextlib import contextmanager
from threading import RLock
from typing import Any, Callable, Iterable

import requests

NUVAMA_HTTP_TIMEOUT = (5, 12)
_REQUEST_PATCH_LOCK = RLock()
_FEED_PATCH_LOCK = RLock()


@contextmanager
def _bounded_constructor_requests():
    """Add a timeout to APIConnect constructor calls that omit one.

    APIConnect performs an update check during construction through a private
    requests.Session and does not provide a timeout. Without this guard a slow
    upstream can freeze FastAPI's provider initialization indefinitely.
    """
    with _REQUEST_PATCH_LOCK:
        original = requests.sessions.Session.request

        def bounded(session, method, url, **kwargs):
            kwargs.setdefault("timeout", NUVAMA_HTTP_TIMEOUT)
            return original(session, method, url, **kwargs)

        requests.sessions.Session.request = bounded
        try:
            yield
        finally:
            requests.sessions.Session.request = original


def _install_session_timeout(api: Any) -> None:
    """Apply the same default timeout to the SDK client's private session."""
    http = getattr(api, "_APIConnect__http", None)
    session = getattr(http, "_Http__requests", None)
    if session is None:
        return
    original = session.request

    def bounded(method, url, **kwargs):
        kwargs.setdefault("timeout", NUVAMA_HTTP_TIMEOUT)
        return original(method, url, **kwargs)

    session.request = bounded


def _sync_feed_app_id(api: Any) -> None:
    """Replace APIConnect 2.0.11's expired hard-coded streaming AppIdKey."""
    constants = getattr(api, "_APIConnect__constants", None)
    feed = getattr(api, "_APIConnect__feedObj", None)
    app_id_key = getattr(constants, "AppIdKey", None)
    if feed is not None and app_id_key:
        feed._appID = app_id_key


def _install_utf8_feed_socket() -> None:
    """Make APIConnect's TCP feed decoder portable on Windows.

    APIConnect 2.0.11 calls ``socket.makefile("rw")`` without an encoding, so
    Windows uses CP1252 and the reader thread can die on Nuvama feed bytes that
    are valid only when decoded as UTF-8 with malformed prefixes ignored.  The
    SDK source includes that decoding strategy as a commented workaround.
    Patch the connection seam once so initial connections and reconnects both
    use it, while keeping the third-party installation untouched.
    """
    from feed.feed import Feed

    with _FEED_PATCH_LOCK:
        original = Feed._Feed__create_connection
        if getattr(original, "_strikefluency_utf8", False):
            return

        def create_connection(feed):
            original(feed)
            stream = getattr(feed, "_socket_fs", None)
            if stream is not None:
                stream.reconfigure(encoding="utf-8", errors="ignore")

        create_connection._strikefluency_utf8 = True
        Feed._Feed__create_connection = create_connection


def subscribe_index_mini_quotes(
    api: Any,
    symbols: Iterable[str],
    callback: Callable[[str], Any],
) -> Any:
    """Subscribe with the same uncompressed web payload as Nuvama's site.

    APIConnect 2.0.11 builds a ``formFactor: P`` request even though the
    authenticated AppIdKey is issued for ``W``.  Nuvama then returns
    length-prefixed compressed frames that the SDK's line-oriented JSON reader
    cannot parse.  Its own dashboard uses ``W`` and raw index symbols.
    """
    from constants.streaming_constants import StreamingConstants

    feed = getattr(api, "_APIConnect__feedObj", None)
    if feed is None:
        raise RuntimeError("Nuvama SDK feed is unavailable")

    request = {
        "request": {
            "streaming_type": "miniquote",
            "data": {"symbols": [{"symbol": symbol} for symbol in symbols]},
            "formFactor": "W",
            "appID": feed._appID,
            "response_format": "json",
            "request_type": "subscribe",
        },
        "echo": {},
    }
    feed._subscribe(
        json.dumps(request) + "\n",
        callback,
        StreamingConstants.MINI_QUOTE_STREAM_REQ_CODE,
    )
    return feed


def create_api_connect(
    api_key: str,
    api_secret: str,
    request_id: str,
):
    from APIConnect.APIConnect import APIConnect

    _install_utf8_feed_socket()
    with _bounded_constructor_requests():
        api = APIConnect(api_key, api_secret, request_id, False, None)
    _install_session_timeout(api)
    _sync_feed_app_id(api)
    return api
