"""
Unit coverage for the events package.

The enum values are a wire contract: useMarketWebSocket.js dispatches on
`msg.reason`. A rename here silently stops the frontend refreshing — no error,
just a desk that quietly goes stale. The first test pins every value so that
breakage is loud.
"""

import json
import uuid

import pytest

from app.events import DeferredPublisher, TradingEvent, publish


# The exact strings the frontend receives. Changing one of these requires
# changing frontend/src/hooks/useMarketWebSocket.js in the same commit.
WIRE_VALUES = {
    "ORDER_PLACED": "order_placed",
    "ORDER_PROTECTION_UPDATED": "order_protection_updated",
    "ORDER_CLOSED": "order_closed",
    "LIMIT_PLACED": "limit_placed",
    "LIMIT_CANCELLED": "limit_cancelled",
    "AUTO_EXIT": "auto_exit",
    "LIMIT_FILLED": "limit_filled",
    "LIMIT_REJECTED": "limit_rejected",
    "STRATEGY_EXECUTED": "strategy_executed",
    "LEG_CLOSED": "leg_closed",
    "STRATEGY_SQUAREOFF": "strategy_squareoff",
}


def test_wire_values_are_unchanged():
    assert {e.name: e.value for e in TradingEvent} == WIRE_VALUES, (
        "TradingEvent values are a wire contract with the frontend "
        "(useMarketWebSocket.js dispatches on msg.reason). Update "
        "frontend/src/hooks/useMarketWebSocket.js in the same commit."
    )


def test_events_serialise_as_plain_strings():
    """StrEnum, so json.dumps needs no custom encoder."""
    payload = json.dumps({"reason": TradingEvent.ORDER_PLACED})
    assert payload == '{"reason": "order_placed"}'


def test_events_compare_equal_to_raw_strings():
    """Any lingering comparison against a literal keeps working."""
    assert TradingEvent.AUTO_EXIT == "auto_exit"
    assert TradingEvent("limit_filled") is TradingEvent.LIMIT_FILLED


def test_an_unknown_reason_is_rejected():
    """
    market_scheduler converts scan_and_fill's reason string via TradingEvent(...),
    so a typo in the service fails loudly here rather than becoming a frame the
    frontend silently drops.
    """
    with pytest.raises(ValueError):
        TradingEvent("not_a_real_event")


# ── DeferredPublisher ─────────────────────────────────────────

class _Recorder:
    def __init__(self):
        self.pushed = []

    def push_user_event(self, user_id, event):
        self.pushed.append((user_id, event))


@pytest.fixture
def recorder(monkeypatch):
    rec = _Recorder()
    monkeypatch.setattr("app.events.publisher.manager", rec)
    return rec


def test_collect_then_flush_emits_everything(recorder):
    uid = uuid.uuid4()
    events = DeferredPublisher()
    events.collect(uid, TradingEvent.AUTO_EXIT)
    events.collect(uid, TradingEvent.LIMIT_FILLED)
    assert len(events) == 2
    assert recorder.pushed == []   # nothing before flush

    events.flush()
    assert [e["reason"] for _, e in recorder.pushed] == ["auto_exit", "limit_filled"]
    assert all(e["type"] == "trading_update" for _, e in recorder.pushed)


def test_discard_announces_nothing(recorder):
    """The rollback path: nothing committed, so nothing may be announced."""
    events = DeferredPublisher()
    events.collect(uuid.uuid4(), TradingEvent.AUTO_EXIT)
    events.discard()
    events.flush()
    assert recorder.pushed == []


def test_flush_is_idempotent(recorder):
    events = DeferredPublisher()
    events.collect(uuid.uuid4(), TradingEvent.ORDER_CLOSED)
    events.flush()
    events.flush()
    assert len(recorder.pushed) == 1


def test_a_failing_push_does_not_block_the_rest(monkeypatch):
    """One dropped notification must not cost the others theirs."""
    pushed = []

    class Flaky:
        def push_user_event(self, user_id, event):
            if len(pushed) == 0:
                pushed.append(None)
                raise RuntimeError("socket gone")
            pushed.append((user_id, event))

    monkeypatch.setattr("app.events.publisher.manager", Flaky())
    events = DeferredPublisher()
    events.collect(uuid.uuid4(), TradingEvent.AUTO_EXIT)
    events.collect(uuid.uuid4(), TradingEvent.LIMIT_FILLED)
    events.flush()   # must not raise
    assert len(pushed) == 2


# ── publish ───────────────────────────────────────────────────

def test_publish_carries_no_payload():
    """
    The no-payload contract is enforced by the signature: clients re-run their
    REST loaders, which stay the single source of truth.
    """
    import inspect
    params = list(inspect.signature(publish).parameters)
    assert params == ["user_id", "event"], (
        "publish() must stay payload-free — adding a data argument would create "
        "a second, divergent representation of a position."
    )
