"""app/schemas/analytics.py"""

from datetime import date, datetime
from decimal import Decimal
from typing import Optional
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


class AdvancedAnalyticsPeriod(BaseModel):
    days: int
    start_date: date
    end_date: date
    generated_at: datetime
    timezone: str


class AdvancedAnalyticsSummary(BaseModel):
    total_trades: int
    winning_trades: int
    losing_trades: int
    breakeven_trades: int
    net_pnl: Decimal
    gross_profit: Decimal
    gross_loss: Decimal
    win_rate: float
    profit_factor: Optional[float]
    expectancy: Decimal
    avg_win: Decimal
    avg_loss: Decimal
    payoff_ratio: Optional[float]
    best_trade: Decimal
    worst_trade: Decimal
    max_drawdown: Decimal
    max_drawdown_pct: float
    avg_holding_minutes: Optional[float]
    avg_discipline_score: Optional[float]
    violation_count: int


class AdvancedDailyPoint(BaseModel):
    date: date
    trade_count: int
    winning_trades: int
    losing_trades: int
    net_pnl: Decimal
    cumulative_pnl: Decimal
    drawdown: Decimal
    discipline_score: Optional[float]
    violation_count: int


class AdvancedPortfolioPoint(BaseModel):
    date: date
    equity: Decimal
    balance: Optional[Decimal]
    unrealized_pnl: Optional[Decimal]
    drawdown: Decimal


class AdvancedPerformanceBreakdown(BaseModel):
    label: str
    trade_count: int
    winning_trades: int
    win_rate: float
    net_pnl: Decimal
    avg_pnl: Decimal


class AdvancedCategoryBreakdown(BaseModel):
    key: str
    count: int
    percentage: float


class AdvancedOutcomeBreakdown(BaseModel):
    label: str
    count: int
    net_pnl: Decimal


class AdvancedAnalyticsResponse(BaseModel):
    period: AdvancedAnalyticsPeriod
    summary: AdvancedAnalyticsSummary
    equity_source: str
    daily_series: list[AdvancedDailyPoint]
    portfolio_series: list[AdvancedPortfolioPoint]
    outcome_breakdown: list[AdvancedOutcomeBreakdown]
    setup_performance: list[AdvancedPerformanceBreakdown]
    instrument_performance: list[AdvancedPerformanceBreakdown]
    weekday_performance: list[AdvancedPerformanceBreakdown]
    rule_breakdown: list[AdvancedCategoryBreakdown]
    mistake_breakdown: list[AdvancedCategoryBreakdown]
