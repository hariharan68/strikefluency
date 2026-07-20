"""app/schemas/discipline.py"""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict


class DisciplineRuleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    rule_code: str
    rule_value: dict
    is_active: bool
    updated_at: datetime


class UpdateRuleRequest(BaseModel):
    rule_value: dict


class DisciplineScoreResponse(BaseModel):
    score: Decimal
    consecutive_disciplined_trades: int
    tier: str
    trades_to_next_tier: int


class DisciplineModeResponse(BaseModel):
    enabled: bool
    capital_unlocked: bool
    tier: str
    balance: Decimal


class SetDisciplineModeRequest(BaseModel):
    enabled: bool


class ViolationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    rule_code: str
    attempted_action: dict
    was_blocked: bool
    session_date: date
    created_at: datetime
    