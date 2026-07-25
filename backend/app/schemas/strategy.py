"""
app/schemas/strategy.py
───────────────────────
Pydantic v2 schemas for the Strategy Builder API. Follows the app convention:
verb-named request models, *Response output models with from_attributes.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Underlying = Literal["NIFTY", "BANKNIFTY", "SENSEX"]
InstrumentType = Literal["CE", "PE", "FUT"]
Action = Literal["BUY", "SELL"]
SetupTag = Literal["OI_BASED", "PRICE_ACTION", "LEVEL_TRADE", "EXPIRY_PLAY", "OTHER"]
ProductType = Literal["INTRADAY", "NRML"]
BuilderConfigurationKind = Literal["SAVED", "DRAFT"]


# ── requests ──────────────────────────────────────────────────
class BuildFromTemplateRequest(BaseModel):
    template_id: str
    underlying: Underlying = "NIFTY"
    lots: int = 1
    # Optional — defaults to the provider's expiry list (nearest first).
    expiries: Optional[list[date]] = None
    setup_tag: Optional[SetupTag] = None
    product_type: ProductType = "INTRADAY"

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


class BuilderLegInput(BaseModel):
    """One editor leg used by the rich Strategy Builder simulation."""

    client_id: str
    included: bool = True
    action: Action
    instrument_type: InstrumentType
    strike: Optional[float] = None
    lots: int = Field(default=1, ge=1, le=100)
    expiry: date
    entry_price: Optional[float] = Field(default=None, ge=0)
    live_ltp: Optional[float] = Field(default=None, ge=0)
    iv: Optional[float] = Field(default=None, ge=0, le=300)
    iv_override: Optional[float] = Field(default=None, ge=0, le=300)

    @model_validator(mode="after")
    def strike_matches_instrument(self):
        if self.instrument_type == "FUT" and self.strike is not None:
            raise ValueError("Futures legs cannot have a strike")
        if self.instrument_type != "FUT" and self.strike is None:
            raise ValueError("Option legs require a strike")
        return self


class SimulateStrategyRequest(BaseModel):
    revision: int = Field(default=0, ge=0)
    underlying: Underlying = "NIFTY"
    spot: Optional[float] = Field(default=None, gt=0)
    multiplier: int = Field(default=1, ge=1, le=20)
    target_price: Optional[float] = Field(default=None, gt=0)
    target_at: Optional[datetime] = None
    manual_pnl: float = 0.0
    include_manual_pnl: bool = False
    include_booked_pnl: bool = False
    legs: list[BuilderLegInput] = Field(default_factory=list, max_length=10)


class ExecutePreviewRequest(BaseModel):
    underlying: Underlying = "NIFTY"
    multiplier: int = Field(default=1, ge=1, le=20)
    name: Optional[str] = Field(default=None, max_length=100)
    setup_tag: SetupTag
    product_type: ProductType = "INTRADAY"
    legs: list[BuilderLegInput] = Field(min_length=1, max_length=10)


class BuilderConfigurationCreate(BaseModel):
    kind: BuilderConfigurationKind
    name: Optional[str] = Field(default=None, max_length=100)
    underlying: Underlying
    schema_version: int = Field(default=1, ge=1, le=10)
    state: dict[str, Any]

    @model_validator(mode="after")
    def saved_requires_name(self):
        if self.kind == "SAVED" and not (self.name or "").strip():
            raise ValueError("Saved strategies require a name")
        return self


class BuilderConfigurationUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=100)
    underlying: Optional[Underlying] = None
    schema_version: Optional[int] = Field(default=None, ge=1, le=10)
    state: Optional[dict[str, Any]] = None


class BuilderConfigurationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: str
    name: Optional[str] = None
    underlying: str
    schema_version: int
    state: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class CreateDraftRequest(BaseModel):
    underlying: Underlying = "NIFTY"
    name: Optional[str] = None
    allow_calendar: bool = False
    setup_tag: Optional[SetupTag] = None
    product_type: ProductType = "INTRADAY"


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


class StrategyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    underlying: str
    name: Optional[str] = None
    template_id: Optional[str] = None
    status: str
    allow_calendar: bool
    product_type: str = "INTRADAY"
    setup_tag: Optional[str] = None
    net_premium: Optional[Decimal] = None
    max_profit: Optional[Decimal] = None
    max_loss: Optional[Decimal] = None
    created_at: datetime
    updated_at: datetime
    legs: list[LegResponse] = []
    # The live execution record (margin, realized/unrealized P&L); None while a
    # draft. Lets the Positions page show executed strategies without extra calls.
    position: Optional[PositionResponse] = None


class StrategyListResponse(BaseModel):
    strategies: list[StrategyResponse]
    total: int
    page: int
    page_size: int


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
