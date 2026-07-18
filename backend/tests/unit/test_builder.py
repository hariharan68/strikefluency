"""
Unit tests for the leg-management builder (Phase 3).

Pure — no database. Verifies every validation rule, and that a rejected
operation leaves the draft unchanged (no half-applied mutations).
"""

from datetime import date

import pytest

from app.core.constants import LegStatus, OrderAction, StrategyStatus, MAX_STRATEGY_LEGS
from app.core.exceptions import StrategyValidationError
from app.strategy.builder import (
    ValidationCode,
    add_leg,
    edit_leg,
    make_leg,
    remove_leg,
    validate_strategy,
)
from app.strategy.domain import Strategy

EXP = date(2026, 7, 21)
EXP2 = date(2026, 7, 28)


def _draft(underlying="NIFTY", allow_calendar=False):
    return Strategy(underlying=underlying, allow_calendar=allow_calendar)


def _leg(underlying, itype, action, lots, strike, expiry=EXP, price=100.0):
    return make_leg(underlying, itype, action, lots, expiry, strike=strike, entry_price=price)


def _code(exc_info):
    return exc_info.value.code


# ── add_leg happy path ────────────────────────────────────────
def test_add_valid_leg():
    s = _draft()
    add_leg(s, _leg("NIFTY", "CE", OrderAction.SELL, 1, 24000))
    assert len(s.legs) == 1


def test_add_futures_leg_no_strike():
    s = _draft()
    fut = make_leg("NIFTY", "FUT", OrderAction.BUY, 1, EXP2, strike=None, entry_price=24096.0)
    add_leg(s, fut)
    assert s.has_future_legs


# ── validation failures ───────────────────────────────────────
def test_reject_off_grid_strike():
    s = _draft()
    with pytest.raises(StrategyValidationError) as e:
        add_leg(s, _leg("NIFTY", "CE", OrderAction.SELL, 1, 24075))  # not on 50-grid
    assert _code(e) == ValidationCode.STRIKE_OFF_GRID
    assert s.legs == []          # rejected -> unchanged


def test_reject_underlying_mismatch():
    s = _draft("NIFTY")
    add_leg(s, _leg("NIFTY", "CE", OrderAction.SELL, 1, 24000))
    with pytest.raises(StrategyValidationError) as e:
        add_leg(s, _leg("BANKNIFTY", "PE", OrderAction.BUY, 1, 51000, price=200.0))
    assert _code(e) == ValidationCode.UNDERLYING_MISMATCH
    assert len(s.legs) == 1


def test_reject_zero_and_negative_lots():
    s = _draft()
    with pytest.raises(StrategyValidationError) as e:
        add_leg(s, _leg("NIFTY", "CE", OrderAction.SELL, 0, 24000))
    assert _code(e) == ValidationCode.BAD_QUANTITY
    with pytest.raises(StrategyValidationError):
        add_leg(s, _leg("NIFTY", "CE", OrderAction.SELL, -2, 24000))


def test_reject_bad_action():
    s = _draft()
    with pytest.raises(StrategyValidationError) as e:
        add_leg(s, _leg("NIFTY", "CE", "HOLD", 1, 24000))
    assert _code(e) == ValidationCode.BAD_ACTION


def test_reject_unknown_underlying_at_make():
    with pytest.raises(StrategyValidationError) as e:
        make_leg("RELIANCE", "CE", OrderAction.BUY, 1, EXP, strike=2500)
    assert _code(e) == ValidationCode.UNKNOWN_UNDERLYING


# ── max legs ──────────────────────────────────────────────────
def test_max_legs_enforced():
    s = _draft()
    # spread strikes so grid + calendar rules never trip first
    for i in range(MAX_STRATEGY_LEGS):
        add_leg(s, _leg("NIFTY", "CE", OrderAction.BUY, 1, 24000 + i * 50))
    assert len(s.legs) == MAX_STRATEGY_LEGS
    with pytest.raises(StrategyValidationError) as e:
        add_leg(s, _leg("NIFTY", "CE", OrderAction.BUY, 1, 25000))
    assert _code(e) == ValidationCode.MAX_LEGS


# ── calendar gating ───────────────────────────────────────────
def test_mixed_expiry_blocked_by_default():
    s = _draft(allow_calendar=False)
    add_leg(s, _leg("NIFTY", "CE", OrderAction.SELL, 1, 24000, expiry=EXP))
    with pytest.raises(StrategyValidationError) as e:
        add_leg(s, _leg("NIFTY", "CE", OrderAction.BUY, 1, 24000, expiry=EXP2))
    assert _code(e) == ValidationCode.CALENDAR_NOT_ALLOWED
    assert len(s.legs) == 1


def test_mixed_expiry_allowed_when_enabled():
    s = _draft(allow_calendar=True)
    add_leg(s, _leg("NIFTY", "CE", OrderAction.SELL, 1, 24000, expiry=EXP))
    add_leg(s, _leg("NIFTY", "CE", OrderAction.BUY, 1, 24000, expiry=EXP2))
    assert s.is_calendar and len(s.legs) == 2


# ── remove ────────────────────────────────────────────────────
def test_remove_leg():
    s = _draft()
    leg = add_leg(s, _leg("NIFTY", "CE", OrderAction.SELL, 1, 24000))
    removed = remove_leg(s, leg.id)
    assert removed.id == leg.id and s.legs == []


def test_remove_unknown_leg_raises():
    s = _draft()
    import uuid
    with pytest.raises(StrategyValidationError) as e:
        remove_leg(s, uuid.uuid4())
    assert _code(e) == ValidationCode.LEG_NOT_FOUND


# ── edit ──────────────────────────────────────────────────────
def test_edit_strike():
    s = _draft()
    leg = add_leg(s, _leg("NIFTY", "CE", OrderAction.SELL, 1, 24000))
    edited = edit_leg(s, leg.id, strike=24100)
    assert edited.contract.strike == 24100
    assert s.legs[0].contract.strike == 24100


def test_edit_to_off_grid_strike_leaves_leg_unchanged():
    s = _draft()
    leg = add_leg(s, _leg("NIFTY", "CE", OrderAction.SELL, 1, 24000))
    with pytest.raises(StrategyValidationError) as e:
        edit_leg(s, leg.id, strike=24075)
    assert _code(e) == ValidationCode.STRIKE_OFF_GRID
    assert s.legs[0].contract.strike == 24000     # original intact


def test_edit_qty_and_action():
    s = _draft()
    leg = add_leg(s, _leg("NIFTY", "CE", OrderAction.SELL, 1, 24000))
    edit_leg(s, leg.id, lots=3, action=OrderAction.BUY)
    assert s.legs[0].lots == 3 and s.legs[0].action == OrderAction.BUY


def test_edit_stale_snapshot_cleared_on_strike_change():
    s = _draft()
    leg = add_leg(s, _leg("NIFTY", "CE", OrderAction.SELL, 1, 24000))
    s.legs[0].contract.ltp = 150.0
    edit_leg(s, leg.id, strike=24100)
    assert s.legs[0].contract.ltp is None   # old LTP no longer valid for new strike


# ── draft-only guard ──────────────────────────────────────────
def test_cannot_edit_executed_strategy():
    s = _draft()
    leg = add_leg(s, _leg("NIFTY", "CE", OrderAction.SELL, 1, 24000))
    s.status = StrategyStatus.EXECUTED
    for op in (
        lambda: add_leg(s, _leg("NIFTY", "PE", OrderAction.SELL, 1, 24000)),
        lambda: remove_leg(s, leg.id),
        lambda: edit_leg(s, leg.id, lots=2),
    ):
        with pytest.raises(StrategyValidationError) as e:
            op()
        assert _code(e) == ValidationCode.NOT_A_DRAFT


# ── validate_strategy ─────────────────────────────────────────
def test_validate_strategy_catches_bypassed_bad_leg():
    s = _draft()
    # bypass add_leg to inject a bad leg, as loading from persistence might
    s.legs.append(_leg("NIFTY", "CE", OrderAction.SELL, 1, 24000))
    s.legs[0].contract.strike = 24075   # corrupt it post-hoc
    with pytest.raises(StrategyValidationError) as e:
        validate_strategy(s)
    assert _code(e) == ValidationCode.STRIKE_OFF_GRID


def test_validate_empty_strategy_rejected():
    with pytest.raises(StrategyValidationError):
        validate_strategy(_draft())
