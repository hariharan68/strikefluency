"""
Tests for the discipline-aware auto-exit worker (auto_exit_service).

Two layers:
  • Pure unit tests for _decide_exit — deterministic trigger semantics, no DB.
  • Integration tests driving place_order → scan_and_exit through the real
    service layer + Postgres (via conftest fixtures), with a deterministic fake
    market provider swapped in so SL/target crossings are reproducible.

Every integration test rolls back (db_session fixture); nothing persists.
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.core.constants import ExitReason, OrderStatus
from app.models.trading_session import TradingSession
from app.models.virtual_account import VirtualAccount
from app.models.virtual_order import VirtualOrder
from app.services.auto_exit_service import _decide_exit, scan_and_exit


# ── Unit: _decide_exit trigger semantics ──────────────────────────

class _Ord:
    """Minimal stand-in for a VirtualOrder — only the fields _decide_exit reads."""
    def __init__(self, action, sl=None, tgt=None):
        self.action = action
        self.sl_price = Decimal(str(sl)) if sl is not None else None
        self.target_price = Decimal(str(tgt)) if tgt is not None else None


def test_buy_sl_fires_when_premium_falls():
    assert _decide_exit(_Ord("BUY", sl=100), Decimal("90")) == ExitReason.SL_HIT
    assert _decide_exit(_Ord("BUY", sl=100), Decimal("110")) is None


def test_buy_target_fires_when_premium_rises():
    assert _decide_exit(_Ord("BUY", tgt=500), Decimal("520")) == ExitReason.TARGET_HIT
    assert _decide_exit(_Ord("BUY", tgt=500), Decimal("480")) is None


def test_sell_sl_fires_when_premium_rises():
    assert _decide_exit(_Ord("SELL", sl=100), Decimal("110")) == ExitReason.SL_HIT
    assert _decide_exit(_Ord("SELL", sl=100), Decimal("90")) is None


def test_sell_target_fires_when_premium_falls():
    assert _decide_exit(_Ord("SELL", tgt=50), Decimal("40")) == ExitReason.TARGET_HIT
    assert _decide_exit(_Ord("SELL", tgt=50), Decimal("60")) is None


def test_sl_wins_over_target_on_same_tick_gap():
    # Both crossed at once (a gap): SL is the conservative choice.
    o = _Ord("BUY", sl=100, tgt=500)
    assert _decide_exit(o, Decimal("50")) == ExitReason.SL_HIT  # ltp below both? only sl
    o2 = _Ord("SELL", sl=100, tgt=50)
    assert _decide_exit(o2, Decimal("120")) == ExitReason.SL_HIT


# ── Integration harness ───────────────────────────────────────────

class FakeProvider:
    """Deterministic single-strike option chain with a mutable premium."""
    def __init__(self, strike: int, ltp):
        self.strike = strike
        self.ltp = Decimal(str(ltp))
        self.calls = 0

    def get_option_chain(self, instrument, expiry=None):
        self.calls += 1
        return {
            "instrument": instrument,
            "spot_price": 22150,
            "atm_strike": self.strike,
            "strikes": [{
                "strike": self.strike,
                "ce": {"ltp": self.ltp},
                "pe": {"ltp": self.ltp},
            }],
        }


@pytest.fixture
def wire_provider(monkeypatch):
    """
    Swap a deterministic provider into both the placement and auto-exit paths,
    and force market-open. Returns the provider so tests can move the premium.
    """
    provider = FakeProvider(strike=21000, ltp=Decimal("300"))
    monkeypatch.setattr(
        "app.services.virtual_order_service.get_market_provider", lambda: provider)
    monkeypatch.setattr(
        "app.services.auto_exit_service.get_market_provider", lambda: provider)
    monkeypatch.setattr(
        "app.services.virtual_order_service.is_market_open", lambda: True)
    return provider


def _place(db, user, *, sl=Decimal("100"), tgt=Decimal("500"), action="BUY"):
    from app.services.virtual_order_service import place_order
    return place_order(db, user, {
        "instrument": "NIFTY",
        "expiry_date": date.today() + timedelta(days=7),
        "strike_price": 21000,
        "option_type": "CE",
        "action": action,
        "quantity": 1,
        "sl_price": sl,
        "target_price": tgt,
        "setup_tag": "OTHER",
    })


def _account(db, user) -> VirtualAccount:
    return db.query(VirtualAccount).filter(VirtualAccount.user_id == user.id).first()


def _today_session(db, user) -> TradingSession:
    return db.query(TradingSession).filter(
        TradingSession.user_id == user.id,
        TradingSession.session_date == date.today(),
    ).first()


# ── Integration: the real scan_and_exit path ──────────────────────

def test_sl_hit_auto_closes_and_triggers_cooldown(db_session, seeded_user, wire_provider):
    order = _place(db_session, seeded_user)          # entry premium 300, SL 100
    db_session.flush()

    wire_provider.ltp = Decimal("50")                # premium collapses below SL
    closed = scan_and_exit(db_session)

    assert closed == 1
    refreshed = db_session.get(VirtualOrder, order.id)
    assert refreshed.status == OrderStatus.SL_HIT
    # SL hit on a disciplined trade must arm the revenge-trading cooldown.
    assert _today_session(db_session, seeded_user).is_cooldown_active is True


def test_target_hit_auto_closes_without_cooldown(db_session, seeded_user, wire_provider):
    order = _place(db_session, seeded_user)          # entry 300, target 500
    db_session.flush()

    wire_provider.ltp = Decimal("600")               # premium rallies past target
    closed = scan_and_exit(db_session)

    assert closed == 1
    refreshed = db_session.get(VirtualOrder, order.id)
    assert refreshed.status == OrderStatus.TARGET_HIT
    sess = _today_session(db_session, seeded_user)
    assert (sess is None) or (sess.is_cooldown_active is False)


def test_free_play_exit_skips_cooldown_and_score(db_session, seeded_user, wire_provider):
    acct = _account(db_session, seeded_user)
    acct.discipline_mode_enabled = False             # free-play
    score_before = acct.discipline_score
    db_session.flush()

    order = _place(db_session, seeded_user)          # SL provided, still free-play
    db_session.flush()
    assert order.was_free_play is True

    wire_provider.ltp = Decimal("50")                # cross the SL
    closed = scan_and_exit(db_session)

    assert closed == 1
    refreshed = db_session.get(VirtualOrder, order.id)
    assert refreshed.status == OrderStatus.SL_HIT
    # Free-play: no cooldown, discipline score untouched.
    sess = _today_session(db_session, seeded_user)
    assert (sess is None) or (sess.is_cooldown_active is False)
    assert _account(db_session, seeded_user).discipline_score == score_before


def test_order_without_levels_is_skipped(db_session, seeded_user, wire_provider):
    acct = _account(db_session, seeded_user)
    acct.discipline_mode_enabled = False             # free-play allows a bare order
    db_session.flush()

    order = _place(db_session, seeded_user, sl=None, tgt=None)
    db_session.flush()

    wire_provider.ltp = Decimal("1")                 # would cross anything — but no levels
    closed = scan_and_exit(db_session)

    assert closed == 0
    assert db_session.get(VirtualOrder, order.id).status == OrderStatus.OPEN


def test_one_chain_fetch_per_instrument(db_session, seeded_user, wire_provider):
    acct = _account(db_session, seeded_user)
    acct.discipline_mode_enabled = False             # skip per-trade rules for 2 orders
    db_session.flush()

    _place(db_session, seeded_user)
    _place(db_session, seeded_user)
    db_session.flush()

    wire_provider.ltp = Decimal("300")               # between SL(100) and target(500): no cross
    wire_provider.calls = 0
    closed = scan_and_exit(db_session)

    assert closed == 0
    # Two open orders on NIFTY → detection fetches the chain exactly once.
    assert wire_provider.calls == 1
