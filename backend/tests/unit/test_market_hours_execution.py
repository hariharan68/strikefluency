"""Regression tests for the strict paper-execution market-hours boundary."""

import uuid
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.core import utils as core_utils
from app.core.exceptions import MarketClosedError
from app.services import (
    auto_exit_service,
    pending_order_service,
    strategy_execution_service,
    virtual_order_service,
)


@pytest.mark.parametrize(
    "execute",
    [
        lambda db, user: virtual_order_service.place_order(db, user, {}),
        lambda db, user: virtual_order_service.close_position(
            db, user, uuid.uuid4()
        ),
        lambda db, user: pending_order_service.place_pending_order(db, user, {}),
        lambda db, user: strategy_execution_service.execute_strategy(
            db, user, uuid.uuid4()
        ),
        lambda db, user: strategy_execution_service.close_leg(
            db, user, uuid.uuid4(), uuid.uuid4()
        ),
        lambda db, user: strategy_execution_service.square_off(
            db, user, uuid.uuid4()
        ),
    ],
)
def test_every_public_execution_path_fails_before_touching_the_database(
    monkeypatch, execute
):
    monkeypatch.setattr(core_utils, "is_market_open", lambda: False)
    db = MagicMock()
    user = SimpleNamespace(id=uuid.uuid4())

    with pytest.raises(MarketClosedError, match="Orders, limit fills, and exits"):
        execute(db, user)

    db.query.assert_not_called()


def test_limit_fill_scanner_leaves_orders_untouched_when_market_is_closed(
    monkeypatch,
):
    monkeypatch.setattr(core_utils, "is_market_open", lambda: False)
    db = MagicMock()

    assert pending_order_service.scan_and_fill(db) == 0
    db.query.assert_not_called()
    db.commit.assert_not_called()
    db.rollback.assert_not_called()


def test_auto_exit_still_marks_to_market_but_never_triggers_off_hours(
    monkeypatch,
):
    monkeypatch.setattr(core_utils, "is_market_open", lambda: False)
    order = SimpleNamespace(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        instrument="NIFTY",
        strike_price=Decimal("24000"),
        option_type="CE",
        action="BUY",
        sl_price=Decimal("1000"),
        target_price=None,
    )
    db = MagicMock()
    db.query.return_value.filter.return_value.all.return_value = [order]

    provider = MagicMock()
    provider.get_option_chain.return_value = {"strikes": []}
    monkeypatch.setattr(auto_exit_service, "get_market_provider", lambda: provider)
    monkeypatch.setattr(
        auto_exit_service,
        "_get_ltp_from_chain",
        lambda *_args: (Decimal("100"), 24000),
    )
    update_ltp = MagicMock()
    close = MagicMock()
    monkeypatch.setattr(auto_exit_service, "update_position_ltp", update_ltp)
    monkeypatch.setattr(auto_exit_service, "close_position", close)

    assert auto_exit_service.scan_and_exit(db) == 0
    update_ltp.assert_called_once_with(db, order.id, Decimal("100"))
    close.assert_not_called()
