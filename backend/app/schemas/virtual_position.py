import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict


class PositionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    order_id: uuid.UUID
    instrument: str
    expiry_date: date
    strike_price: Decimal
    option_type: str
    quantity: int
    product_type: str = "INTRADAY"
    action: str = "BUY"
    lot_size: int = 50
    avg_entry_price: Decimal
    current_ltp: Decimal
    unrealized_pnl: Decimal
    margin_blocked: Decimal
    is_open: bool
    opened_at: datetime
    closed_at: Optional[datetime] = None


class PositionListResponse(BaseModel):
    positions: list[PositionResponse]
    total_unrealized_pnl: Decimal
    total_margin_blocked: Decimal
