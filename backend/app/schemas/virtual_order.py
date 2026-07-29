import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, field_validator


class PlaceOrderRequest(BaseModel):
    # Generated once by the client and reused if the HTTP request is retried.
    client_order_id: uuid.UUID
    instrument:   Literal["NIFTY", "BANKNIFTY", "SENSEX"] = "NIFTY"
    expiry_date:  date
    strike_price: int
    option_type:  Literal["CE", "PE"]
    action:       Literal["BUY", "SELL"]
    quantity:     int = 1
    # INTRADAY (auto-squared-off at EOD) or NRML (carry forward). Defaults to
    # INTRADAY, preserving the pre-product-type behavior.
    product_type: Literal["INTRADAY", "NRML"] = "INTRADAY"
    # SL and setup tag are optional at the schema level: when Discipline Mode is
    # ON, the engine's MANDATORY_SL / MANDATORY_SETUP_TAG rules still require them
    # (and raise a clear violation); when OFF, bare free-play orders are allowed.
    sl_price:     Optional[Decimal] = None
    target_price: Optional[Decimal] = None
    setup_tag:    Optional[Literal[
        "OI_BASED", "PRICE_ACTION", "LEVEL_TRADE", "EXPIRY_PLAY", "OTHER"
    ]] = None

    @field_validator("quantity")
    @classmethod
    def quantity_positive(cls, v):
        if v <= 0:
            raise ValueError("Quantity must be at least 1 lot")
        return v

    @field_validator("strike_price")
    @classmethod
    def strike_positive(cls, v):
        if v <= 0:
            raise ValueError("Strike price must be positive")
        return v


class OrderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    client_order_id: Optional[uuid.UUID] = None
    instrument: str
    expiry_date: date
    strike_price: Decimal
    option_type: str
    action: str
    quantity: int
    lot_size: int
    product_type: str
    trading_day: date
    entry_ltp: Decimal
    entry_price: Decimal
    exit_price: Optional[Decimal] = None
    sl_price: Optional[Decimal] = None   # None for legs mirrored from a strategy
    target_price: Optional[Decimal] = None
    status: str
    entry_time: datetime
    exit_time: Optional[datetime] = None
    pnl: Optional[Decimal] = None
    brokerage: Decimal          # round trip: entry at placement + exit on close
    entry_brokerage: Decimal    # the entry leg alone, debited at placement
    slippage_points: Decimal
    setup_tag: str
    exit_reason: Optional[str] = None
    is_discipline_compliant: bool
    was_free_play: bool
    strategy_id: Optional[uuid.UUID] = None
    created_at: datetime


class CloseOrderResponse(BaseModel):
    order: OrderResponse
    net_pnl: Decimal
    message: str


class OrderListResponse(BaseModel):
    orders: list[OrderResponse]
    total: int
    page: int
    page_size: int
