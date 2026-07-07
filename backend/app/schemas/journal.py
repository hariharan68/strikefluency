"""app/schemas/journal.py"""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, ConfigDict


class JournalEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    order_id: uuid.UUID
    entry_price: Decimal
    exit_price: Optional[Decimal] = None
    pnl: Optional[Decimal] = None
    brokerage: Optional[Decimal] = None
    setup_tag: Optional[str] = None
    exit_reason: Optional[str] = None
    is_discipline_compliant: bool
    violations_attempted: Optional[List[str]] = None
    duration_minutes: Optional[int] = None
    trade_date: date
    emotion_tag: Optional[str] = None
    mistake_category: Optional[str] = None
    pre_trade_thesis: Optional[str] = None
    post_trade_review: Optional[str] = None
    is_reviewed: bool
    created_at: datetime
    updated_at: datetime


class UpdateJournalRequest(BaseModel):
    emotion_tag: Optional[str] = None
    mistake_category: Optional[str] = None
    pre_trade_thesis: Optional[str] = None
    post_trade_review: Optional[str] = None
    is_reviewed: Optional[bool] = None


class JournalListResponse(BaseModel):
    entries: List[JournalEntryResponse]
    total: int
    page: int
    page_size: int
    win_rate: float
    avg_pnl: Decimal