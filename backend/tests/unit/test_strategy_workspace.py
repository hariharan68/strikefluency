from datetime import date, timedelta

import pytest

from app.strategy.domain import OptionContract
from app.services.strategy_workspace_service import (
    _contract_value,
    _modelled_history,
    _risk_extrema,
)


def test_target_date_option_value_reaches_intrinsic_at_expiry():
    expiry = date.today() + timedelta(days=7)
    contract = OptionContract(
        underlying="NIFTY",
        expiry=expiry,
        instrument_type="CE",
        strike=24000,
        iv=0.18,
    )

    before = _contract_value(contract, 24100, date.today())
    at_expiry = _contract_value(contract, 24100, expiry)

    assert before > 100
    assert at_expiry == 100


def test_modelled_history_is_deterministic_and_anchored_near_spot():
    first = _modelled_history(24000, points=12)
    second = _modelled_history(24000, points=12)

    assert [row["close"] for row in first] == [row["close"] for row in second]
    assert len(first) == 12
    assert max(abs(row["close"] - 24000) for row in first) < 250
    assert first[-1]["timestamp"] <= second[-1]["timestamp"]


def test_risk_extrema_marks_open_right_tail_unlimited():
    max_profit, max_loss = _risk_extrema(
        [80, 90, 100, 110, 120],
        [-10, -10, 0, 10, 20],
    )

    assert max_profit is None
    assert max_loss == -10


def test_risk_extrema_returns_bounded_values_for_flat_tails():
    max_profit, max_loss = _risk_extrema(
        [80, 90, 100, 110, 120],
        [-10, -10, 20, -10, -10],
    )

    assert max_profit == 20
    assert max_loss == -10
