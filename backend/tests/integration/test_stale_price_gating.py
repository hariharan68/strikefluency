"""
The behaviour Phase 3 exists for: a stale tick must not move money.

Before this, only Kite had a staleness check and it ran at just two of the five
places a fill can happen. A frozen chain could fire a stop-loss the market never
reached, or fill a resting limit at a price that never printed.

Each test pairs a fresh case with a stale one, so a regression that disables the
gate entirely still fails rather than silently passing.
"""

import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest

from app.config import settings
from app.core.constants import OrderStatus, PendingOrderStatus
from app.core.exceptions import QuoteUnavailableError
from app.models.pending_order import PendingOrder
from app.models.virtual_order import VirtualOrder
from app.services.auto_exit_service import scan_and_exit
from app.services.virtual_order_service import place_order

ATM = 22000
PREMIUM = Decimal("300.00")


class StubProvider:
    """A chain whose age is dictated by the test."""

    def __init__(self, age_seconds: float, ltp: Decimal = PREMIUM):
        self.age_seconds = age_seconds
        self.ltp = ltp

    def get_option_chain(self, instrument):
        as_of = datetime.now(timezone.utc) - timedelta(seconds=self.age_seconds)
        return {
            "instrument": instrument,
            "atm_strike": ATM,
            "source": "kite_live",
            "as_of": as_of.isoformat(),
            "age_ms": int(self.age_seconds * 1000),
            "strikes": [{
                "strike": ATM,
                "ce": {"ltp": self.ltp},
                "pe": {"ltp": self.ltp},
            }],
        }


FRESH = 1
STALE = None  # filled in below, once settings are importable


def _stale_seconds():
    return settings.MARKET_ORDER_BLOCK_SECONDS + 30


@pytest.fixture(autouse=True)
def production_rules(monkeypatch):
    """Staleness is deliberately relaxed in development; test the real rules."""
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    for module in ("app.services.virtual_order_service",
                   "app.services.pending_order_service"):
        monkeypatch.setattr(f"{module}.is_market_open", lambda: True)


def _use(monkeypatch, provider, *modules):
    for module in modules:
        monkeypatch.setattr(f"{module}.get_market_provider", lambda: provider)


def _order_data(**over):
    data = {
        "client_order_id": uuid.uuid4(),
        "instrument": "NIFTY",
        "expiry_date": date.today() + timedelta(days=7),
        "strike_price": ATM,
        "option_type": "CE",
        "action": "BUY",
        "quantity": 1,
        "lot_size": 65,
        "product_type": "INTRADAY",
        "sl_price": Decimal("100.00"),
        "target_price": Decimal("500.00"),
        "setup_tag": "OI_BASED",
    }
    data.update(over)
    return data


# ── entry: reject ─────────────────────────────────────────────

def test_a_fresh_chain_can_open_a_position(db_session, seeded_user, monkeypatch):
    _use(monkeypatch, StubProvider(FRESH), "app.services.virtual_order_service")
    order = place_order(db_session, seeded_user, _order_data())
    assert order.status == OrderStatus.OPEN


def test_a_stale_chain_cannot_open_a_position(db_session, seeded_user, monkeypatch):
    _use(monkeypatch, StubProvider(_stale_seconds()),
         "app.services.virtual_order_service")
    with pytest.raises(QuoteUnavailableError, match="stale"):
        place_order(db_session, seeded_user, _order_data())
    assert db_session.query(VirtualOrder).filter(
        VirtualOrder.user_id == seeded_user.id).count() == 0


def test_a_simulated_chain_cannot_open_a_position_in_production(
        db_session, seeded_user, monkeypatch):
    provider = StubProvider(FRESH)
    original = provider.get_option_chain

    def mock_sourced(instrument):
        chain = original(instrument)
        chain["source"] = "mock"
        return chain

    provider.get_option_chain = mock_sourced
    _use(monkeypatch, provider, "app.services.virtual_order_service")
    with pytest.raises(QuoteUnavailableError, match="simulated"):
        place_order(db_session, seeded_user, _order_data())


# ── auto-exit: pause, do not trigger ──────────────────────────

def _open_order(db_session, seeded_user, monkeypatch):
    _use(monkeypatch, StubProvider(FRESH), "app.services.virtual_order_service")
    order = place_order(db_session, seeded_user, _order_data())
    db_session.flush()
    return order


def test_stop_loss_fires_on_a_fresh_chain(db_session, seeded_user, monkeypatch):
    order = _open_order(db_session, seeded_user, monkeypatch)
    # Premium collapses below the Rs 100 stop.
    _use(monkeypatch, StubProvider(FRESH, ltp=Decimal("50.00")),
         "app.services.virtual_order_service", "app.services.auto_exit_service")

    assert scan_and_exit(db_session) == 1
    db_session.refresh(order)
    assert order.status == OrderStatus.SL_HIT


def test_stop_loss_does_not_fire_on_a_stale_chain(
        db_session, seeded_user, monkeypatch):
    """
    The regression that matters: the SL level is crossed, but on data too old
    to trust. Closing here would exit the user at a price the market never
    printed. The position must stay open until the feed recovers.
    """
    order = _open_order(db_session, seeded_user, monkeypatch)
    _use(monkeypatch, StubProvider(_stale_seconds(), ltp=Decimal("50.00")),
         "app.services.virtual_order_service", "app.services.auto_exit_service")

    assert scan_and_exit(db_session) == 0
    db_session.refresh(order)
    assert order.status == OrderStatus.OPEN


def test_mark_to_market_still_runs_on_a_stale_chain(
        db_session, seeded_user, monkeypatch):
    """
    Staleness pauses TRIGGERING, not display. Freezing the P&L number as well
    would make the desk look broken during a brief feed hiccup.
    """
    order = _open_order(db_session, seeded_user, monkeypatch)
    _use(monkeypatch, StubProvider(_stale_seconds(), ltp=Decimal("250.00")),
         "app.services.virtual_order_service", "app.services.auto_exit_service")

    scan_and_exit(db_session)
    db_session.refresh(order)
    assert order.position.current_ltp == Decimal("250.00")


# ── resting limits: pause, do not fill ────────────────────────

def test_a_resting_limit_does_not_fill_on_a_stale_chain(
        db_session, seeded_user, monkeypatch):
    from app.services.pending_order_service import place_pending_order, scan_and_fill

    _use(monkeypatch, StubProvider(FRESH),
         "app.services.pending_order_service", "app.services.virtual_order_service")
    pending = place_pending_order(db_session, seeded_user, _order_data(
        limit_price=Decimal("400.00"),   # BUY limit above market -> marketable
        sl_price=Decimal("100.00"),
    ))
    db_session.flush()
    assert pending.status == PendingOrderStatus.PENDING

    _use(monkeypatch, StubProvider(_stale_seconds()),
         "app.services.pending_order_service", "app.services.virtual_order_service")
    assert scan_and_fill(db_session) == 0
    db_session.refresh(pending)
    assert pending.status == PendingOrderStatus.PENDING, (
        "a stale chain must not fill a resting limit"
    )
