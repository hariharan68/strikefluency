"""Pure journal metric calculations shared by the API and unit tests."""

from decimal import Decimal
from typing import Any


def journal_summary(all_entries: list[Any]) -> dict:
    """Calculate closed-trade journal metrics across a complete result set."""
    trades_with_pnl = [entry for entry in all_entries if entry.pnl is not None]
    winning = [entry for entry in trades_with_pnl if entry.pnl > 0]
    losing = [entry for entry in trades_with_pnl if entry.pnl < 0]
    breakeven = [entry for entry in trades_with_pnl if entry.pnl == 0]
    total_pnl = sum((entry.pnl for entry in trades_with_pnl), Decimal("0"))
    gross_profit = sum((entry.pnl for entry in winning), Decimal("0"))
    gross_loss = abs(sum((entry.pnl for entry in losing), Decimal("0")))
    durations = [
        entry.duration_minutes
        for entry in trades_with_pnl
        if entry.duration_minutes is not None
    ]

    return {
        "win_rate": (
            round(len(winning) / len(trades_with_pnl) * 100, 1)
            if trades_with_pnl else 0.0
        ),
        "avg_pnl": (
            total_pnl / len(trades_with_pnl)
            if trades_with_pnl else Decimal("0")
        ),
        "total_pnl": total_pnl,
        "gross_profit": gross_profit,
        "gross_loss": gross_loss,
        "profit_factor": (
            round(float(gross_profit / gross_loss), 2)
            if gross_loss else None
        ),
        "winners": len(winning),
        "losers": len(losing),
        "breakeven": len(breakeven),
        "reviewed_count": sum(1 for entry in all_entries if entry.is_reviewed),
        "rule_adherence": (
            round(
                sum(1 for entry in trades_with_pnl if entry.is_discipline_compliant)
                / len(trades_with_pnl) * 100,
                1,
            )
            if trades_with_pnl else 0.0
        ),
        "total_brokerage": sum(
            (entry.brokerage or Decimal("0") for entry in trades_with_pnl),
            Decimal("0"),
        ),
        "avg_duration_minutes": (
            round(sum(durations) / len(durations), 1)
            if durations else None
        ),
    }
