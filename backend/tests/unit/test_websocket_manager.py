"""
Unit tests for the user-keyed ConnectionManager (WebSocket infrastructure).

No pytest-asyncio in this project — each test drives its coroutines through
asyncio.run() with a fresh manager instance and a FakeWebSocket.
"""

import asyncio
import uuid

from app.market.websocket_manager import ConnectionManager, REPLAY_TYPES


class FakeWebSocket:
    """Records frames; can be flipped 'dead' so sends raise (prune paths)."""

    def __init__(self):
        self.sent: list[dict] = []
        self.accepted = False
        self.dead = False

    async def accept(self):
        self.accepted = True

    async def send_json(self, data):
        if self.dead:
            raise RuntimeError("socket closed")
        self.sent.append(data)


U1 = uuid.uuid4()
U2 = uuid.uuid4()


def test_connect_and_disconnect_clean_all_registries():
    async def main():
        m = ConnectionManager()
        ws = FakeWebSocket()
        await m.connect(ws, U1)
        assert ws.accepted
        assert ws in m.active_connections
        assert m.user_connections[U1] == {ws}
        assert m._ws_user[ws] == U1

        m.disconnect(ws, U1)
        assert ws not in m.active_connections
        assert U1 not in m.user_connections      # empty sets are dropped
        assert ws not in m._ws_user
    asyncio.run(main())


def test_send_to_user_hits_all_tabs_of_that_user_only():
    async def main():
        m = ConnectionManager()
        tab1, tab2, other = FakeWebSocket(), FakeWebSocket(), FakeWebSocket()
        await m.connect(tab1, U1)
        await m.connect(tab2, U1)
        await m.connect(other, U2)

        await m.send_to_user(U1, {"type": "trading_update", "reason": "order_placed"})
        assert any(f["type"] == "trading_update" for f in tab1.sent)
        assert any(f["type"] == "trading_update" for f in tab2.sent)
        assert not any(f["type"] == "trading_update" for f in other.sent)
    asyncio.run(main())


def test_broadcast_prunes_dead_sockets_from_both_registries():
    async def main():
        m = ConnectionManager()
        alive, dead = FakeWebSocket(), FakeWebSocket()
        await m.connect(alive, U1)
        await m.connect(dead, U2)
        dead.dead = True

        await m.broadcast({"type": "option_chain", "instrument": "NIFTY", "data": {}})
        assert dead not in m.active_connections
        assert U2 not in m.user_connections
        assert alive in m.active_connections
    asyncio.run(main())


def test_replay_cache_keeps_chain_and_metrics_separately():
    async def main():
        m = ConnectionManager()
        chain = {"type": "option_chain", "instrument": "NIFTY", "data": {"spot_price": 1}}
        metrics = {"type": "option_metrics", "instrument": "NIFTY", "data": {"pcr_oi": 1.1}}
        status = {"type": "market_status", "data": {"is_open": True}}
        transient = {"type": "trading_update", "reason": "order_placed"}
        for frame in (chain, metrics, status, transient):
            await m.broadcast(frame)

        # trading_update is one-shot — never replayed
        assert all(k[0] in REPLAY_TYPES for k in m._replay_cache)

        late = FakeWebSocket()
        await m.connect(late, U1)
        types = [f["type"] for f in late.sent]
        assert "option_chain" in types
        assert "option_metrics" in types       # metrics did NOT clobber the chain
        assert "market_status" in types
        assert "trading_update" not in types
        # status replays before data frames so the UI orients first
        assert types.index("market_status") < types.index("option_chain")
    asyncio.run(main())


def test_push_user_event_from_worker_thread_and_loop_thread():
    async def main():
        m = ConnectionManager()
        m.set_loop(asyncio.get_running_loop())
        ws = FakeWebSocket()
        await m.connect(ws, U1)

        # From a worker thread (sync router in FastAPI's threadpool)
        await asyncio.to_thread(
            m.push_user_event, U1, {"type": "trading_update", "reason": "order_placed"}
        )
        # From the loop thread itself (scheduler job context) — must not deadlock
        m.push_user_event(U1, {"type": "trading_update", "reason": "auto_exit"})

        await asyncio.sleep(0.05)   # let the scheduled sends run
        reasons = [f.get("reason") for f in ws.sent if f.get("type") == "trading_update"]
        assert "order_placed" in reasons
        assert "auto_exit" in reasons
    asyncio.run(main())


def test_push_user_event_no_ops_without_loop_or_sockets():
    m = ConnectionManager()
    # No loop captured (e.g. bare test client) — must not raise
    m.push_user_event(U1, {"type": "trading_update", "reason": "order_placed"})

    async def main():
        m2 = ConnectionManager()
        m2.set_loop(asyncio.get_running_loop())
        # Loop set but user has no sockets — silent no-op
        m2.push_user_event(U1, {"type": "trading_update", "reason": "order_placed"})
        await asyncio.sleep(0.01)
    asyncio.run(main())
