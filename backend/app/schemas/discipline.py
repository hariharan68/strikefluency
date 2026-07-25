"""app/schemas/discipline.py"""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict, model_validator


class DisciplineRuleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    rule_code: str
    rule_value: dict
    is_active: bool
    updated_at: datetime


class UpdateRuleRequest(BaseModel):
    rule_value: Optional[dict] = None
    is_active: Optional[bool] = None

    @model_validator(mode="after")
    def require_change(self):
        if self.rule_value is None and self.is_active is None:
            raise ValueError("Provide rule_value or is_active")
        return self


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


class DisciplineScorePoint(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    score_date: date
    score: Decimal
    trades_analyzed: int
    violations_count: int
    consecutive_disciplined_streak: int


class DisciplineModePerformance(BaseModel):
    total_trades: int
    win_rate: float
    average_loss: Optional[Decimal] = None
    total_pnl: Decimal
    compliance_rate: Optional[float] = None


class DisciplineTierProgress(BaseModel):
    current_tier: str
    next_tier: Optional[str] = None
    current_capital_limit: Decimal
    next_capital_limit: Optional[Decimal] = None
    progress_pct: float
    streak_required: int
    streak_remaining: int


class DisciplineProgressResponse(BaseModel):
    score_history: list[DisciplineScorePoint]
    best_streak: int
    sessions_tracked: int
    disciplined_sessions: int
    violations_this_week: int
    tier_progress: DisciplineTierProgress
    discipline_on: DisciplineModePerformance
    discipline_off: DisciplineModePerformance
