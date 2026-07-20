"""
app/schemas/strategy.py
───────────────────────
Pydantic v2 schemas for the Strategy Builder API. Follows the app convention:
verb-named request models, *Response output models with from_attributes.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, field_validator

Underlying = Literal["NIFTY", "BANKNIFTY", "SENSEX"]
InstrumentType = Literal["CE", "PE", "FUT"]
Action = Literal["BUY", "SELL"]
SetupTag = Literal["OI_BASED", "PRICE_ACTION", "LEVEL_TRADE", "EXPIRY_PLAY", "OTHER"]


# ── requests ──────────────────────────────────────────────────
class BuildFromTemplateRequest(BaseModel):
    template_id: str
    underlying: Underlying = "NIFTY"
    lots: int = 1
    # Optional — defaults to the provider's expiry list (nearest first).
    expiries: Optional[list[date]] = None
    setup_tag: Optional[SetupTag] = None

    @field_validator("lots")
    @classmethod
    def lots_positive(cls, v):
        if v <= 0:
            raise ValueError("lots must be at least 1")
        return v


class AnalyzeLeg(BaseModel):
    action: Action
    instrument_type: InstrumentType
    strike: Optional[float] = None       # None for FUT
    lots: int = 1
    expiry: date
    ltp: Optional[float] = None          # entry price the client saw on the chain
    iv: Optional[float] = None           # in percent, for greeks


class AnalyzeRequest(BaseModel):
    """Compute payoff/greeks/margin for an ad-hoc leg set — no persistence."""
    underlying: Underlying = "NIFTY"
    spot: Optional[float] = None         # falls back to the live provider spot
    legs: list[AnalyzeLeg]


class CreateDraftRequest(BaseModel):
    underlying: Underlying = "NIFTY"
    name: Optional[str] = None
    allow_calendar: bool = False
    setup_tag: Optional[SetupTag] = None


class AddLegRequest(BaseModel):
    instrument_type: InstrumentType
    action: Action
    lots: int = 1
    expiry: date
    strike: Optional[float] = None   # required for CE/PE, must be None for FUT

    @field_validator("lots")
    @classmethod
    def lots_positive(cls, v):
        if v <= 0:
            raise ValueError("lots must be at least 1")
        return v


class SetSetupTagRequest(BaseModel):
    setup_tag: SetupTag


class CloseLegRequest(BaseModel):
    exit_ltp: Optional[float] = None


class SquareOffRequest(BaseModel):
    reason: Literal["MANUAL", "SL_HIT", "TARGET_HIT", "EOD_SQUAREOFF"] = "MANUAL"


# ── responses ─────────────────────────────────────────────────
class TemplateResponse(BaseModel):
    id: str
    name: str
    category: str
    description: str
    leg_count: int
    needs_calendar: bool


class LegResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    instrument: str
    expiry_date: date
    strike_price: Optional[Decimal] = None
    instrument_type: str
    action: str
    lots: int
    lot_size: int
    entry_price: Optional[Decimal] = None
    exit_price: Optional[Decimal] = None
    status: str
    realized_pnl: Decimal


class StrategyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    underlying: str
    name: Optional[str] = None
    template_id: Optional[str] = None
    status: str
    allow_calendar: bool
    setup_tag: Optional[str] = None
    net_premium: Optional[Decimal] = None
    max_profit: Optional[Decimal] = None
    max_loss: Optional[Decimal] = None
    created_at: datetime
    updated_at: datetime
    legs: list[LegResponse] = []


class StrategyListResponse(BaseModel):
    strategies: list[StrategyResponse]
    total: int
    page: int
    page_size: int


class PositionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    strategy_id: uuid.UUID
    margin_blocked: Decimal
    realized_pnl: Decimal
    unrealized_pnl: Decimal
    brokerage: Decimal
    is_open: bool
    opened_at: datetime
    closed_at: Optional[datetime] = None


class ExecuteResponse(BaseModel):
    strategy: StrategyResponse
    position: PositionResponse
    message: str


class PayoffSummary(BaseModel):
    max_profit: Optional[float] = None    # None = unlimited
    max_loss: Optional[float] = None      # None = unlimited
    breakevens: list[float] = []
    net_premium: Optional[float] = None
    prices: list[float] = []
    pnls: list[float] = []


class GreeksSummary(BaseModel):
    delta: float
    gamma: float
    theta: float
    vega: float


class MarginSummary(BaseModel):
    total: float
    is_defined_risk: bool
    premium_credit: float
    notes: list[str] = []


class AnalyticsResponse(BaseModel):
    underlying: str
    spot: float
    payoff: Optional[PayoffSummary] = None
    greeks: Optional[GreeksSummary] = None
    margin: MarginSummary


class MarkToMarketResponse(BaseModel):
    updated: int
    message: str


class LegGreeks(BaseModel):
    delta: float
    gamma: float
    theta: float
    vega: float


class AnalyzeResponse(BaseModel):
    underlying: str
    spot: float
    net_premium: Optional[float] = None
    max_profit: Optional[float] = None       # None = unlimited
    max_loss: Optional[float] = None
    breakevens: list[float] = []
    prices: list[float] = []
    pnls: list[float] = []
    margin: float = 0.0
    is_defined_risk: bool = False
    pop: Optional[float] = None               # probability of profit, %
    greeks: LegGreeks
    problems: list[str] = []
