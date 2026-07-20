import uuid
from decimal import Decimal
from pydantic import BaseModel, ConfigDict


class VirtualAccountResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    balance: Decimal
    initial_balance: Decimal
    tier: str
    discipline_score: Decimal
    consecutive_disciplined_trades: int
    discipline_mode_enabled: bool
    capital_unlocked: bool


class AccountSummaryResponse(BaseModel):
    account: VirtualAccountResponse
    today_trades: int
    today_realized_pnl: Decimal
    total_unrealized_pnl: Decimal
    is_cooldown_active: bool
    cooldown_remaining_seconds: int
