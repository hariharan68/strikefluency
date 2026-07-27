import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, field_validator


class PlacePendingOrderRequest(BaseModel):
    """
    A resting LIMIT order. Identical to PlaceOrderRequest except that the price
    is the user's, not the market's: `limit_price` is the premium the order
    waits for instead of filling at whatever is quoted right now.
    """

    # Generated once by the client and reused if the HTTP request is retried.
    client_order_id: uuid.UUID
    instrument:   Literal["NIFTY", "BANKNIFTY", "SENSEX"] = "NIFTY"
    expiry_date:  date
    strike_price: int
    option_type:  Literal["CE", "PE"]
    action:       Literal["BUY", "SELL"]
    quantity:     int = 1
    product_type: Literal["INTRADAY", "NRML"] = "INTRADAY"
    limit_price:  Decimal
    # Discipline Mode ON still requires these via the engine, which runs at
    # placement AND again when the limit triggers.
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

    @field_validator("limit_price")
    @classmethod
    def limit_positive(cls, v):
        if v is None or v <= 0:
            raise ValueError("Limit price must be greater than zero")
        return v


class PendingOrderResponse(BaseModel):
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
    limit_price: Decimal
    placed_ltp: Decimal
    sl_price: Optional[Decimal] = None
    target_price: Optional[Decimal] = None
    setup_tag: str
    status: str
    margin_blocked: Decimal
    trading_day: date
    filled_order_id: Optional[uuid.UUID] = None
    fill_price: Optional[Decimal] = None
    filled_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    reject_reason: Optional[str] = None
    created_at: datetime


class PendingOrderListResponse(BaseModel):
    pending_orders: list[PendingOrderResponse]
    total: int
    # Split counts so the UI can label its Open / Executed sub-tabs without a
    # second request.
    open_count: int
    executed_count: int


class CancelPendingOrderResponse(BaseModel):
    pending_order: PendingOrderResponse
    margin_released: Decimal
    message: str
