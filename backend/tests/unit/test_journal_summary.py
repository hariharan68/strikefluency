from decimal import Decimal
from types import SimpleNamespace

from app.services.journal_metrics import journal_summary


def entry(
    pnl,
    *,
    reviewed=False,
    compliant=True,
    brokerage="0",
    duration=None,
):
    return SimpleNamespace(
        pnl=None if pnl is None else Decimal(pnl),
        is_reviewed=reviewed,
        is_discipline_compliant=compliant,
        brokerage=None if brokerage is None else Decimal(brokerage),
        duration_minutes=duration,
    )


def test_journal_summary_uses_all_closed_trade_values():
    result = journal_summary([
        entry("1200", reviewed=True, compliant=True, brokerage="50", duration=20),
        entry("-400", reviewed=False, compliant=False, brokerage="30", duration=40),
        entry("0", reviewed=True, compliant=True, brokerage=None),
        entry(None, reviewed=False, compliant=False),
    ])

    assert result["total_pnl"] == Decimal("800")
    assert result["gross_profit"] == Decimal("1200")
    assert result["gross_loss"] == Decimal("400")
    assert result["profit_factor"] == 3.0
    assert result["winners"] == 1
    assert result["losers"] == 1
    assert result["breakeven"] == 1
    assert result["win_rate"] == 33.3
    assert result["reviewed_count"] == 2
    assert result["rule_adherence"] == 66.7
    assert result["total_brokerage"] == Decimal("80")
    assert result["avg_duration_minutes"] == 30.0


def test_journal_summary_handles_empty_results():
    result = journal_summary([])

    assert result["total_pnl"] == Decimal("0")
    assert result["avg_pnl"] == Decimal("0")
    assert result["profit_factor"] is None
    assert result["win_rate"] == 0.0
    assert result["rule_adherence"] == 0.0
