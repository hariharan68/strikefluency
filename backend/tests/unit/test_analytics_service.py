from datetime import datetime, timedelta, timezone
from decimal import Decimal

from app.services.analytics_service import TradeUnit, _drawdown, _summary


def _unit(pnl: str, minutes: int = 30) -> TradeUnit:
    closed_at = datetime(2026, 7, 28, 10, 0, tzinfo=timezone.utc)
    return TradeUnit(
        closed_at=closed_at,
        opened_at=closed_at - timedelta(minutes=minutes),
        net_pnl=Decimal(pnl),
        setup_tag="BREAKOUT",
        instrument="NIFTY",
        label="Trade",
        is_strategy=False,
    )


def test_summary_calculates_advanced_metrics_from_trade_units():
    result = _summary(
        [_unit("100"), _unit("-40"), _unit("20"), _unit("-100")],
        initial_balance=Decimal("1000"),
    )

    assert result["total_trades"] == 4
    assert result["winning_trades"] == 2
    assert result["losing_trades"] == 2
    assert result["net_pnl"] == Decimal("-20.00")
    assert result["win_rate"] == 50.0
    assert result["profit_factor"] == 0.86
    assert result["expectancy"] == Decimal("-5.00")
    assert result["payoff_ratio"] == 0.86
    assert result["max_drawdown"] == Decimal("120.00")
    assert result["max_drawdown_pct"] == 12.0
    assert result["avg_holding_minutes"] == 30.0


def test_summary_uses_none_for_undefined_ratios():
    result = _summary([_unit("50"), _unit("0")], initial_balance=Decimal("100000"))

    assert result["profit_factor"] is None
    assert result["payoff_ratio"] is None
    assert result["breakeven_trades"] == 1


def test_drawdown_tracks_peak_to_trough_and_returns_negative_points():
    points, maximum = _drawdown([
        Decimal("100"),
        Decimal("60"),
        Decimal("80"),
        Decimal("-20"),
    ])

    assert points == [
        Decimal("0.00"),
        Decimal("-40.00"),
        Decimal("-20.00"),
        Decimal("-120.00"),
    ]
    assert maximum == Decimal("120.00")
