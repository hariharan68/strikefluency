"""app/schemas/analytics.py"""

from datetime import date
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel


class TradeSummaryResponse(BaseModel):
    total_trades: int
    winning_trades: int
    losing_trades: int
    win_rate: float
    total_pnl: Decimal
    avg_pnl: Decimal
    best_trade: Decimal
    worst_trade: Decimal
    total_brokerage: Decimal
    most_used_setup: Optional[str]
    most_violated_rule: Optional[str]


class DisciplineTrendPoint(BaseModel):
    score_date: date
    score: Decimal
    trades_analyzed: int


class PnLCurvePoint(BaseModel):
    trade_number: int
    trade_date: date
    pnl: Decimal
    cumulative_pnl: Decimal
    setup_tag: Optional[str]


class MistakeBreakdownItem(BaseModel):
    category: str
    count: int
    percentage: float