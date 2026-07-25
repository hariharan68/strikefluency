"""
app/schemas/user_settings.py
─────────────────────────────
Per-user preferences. The stored JSONB blob is merged over these defaults so
GET always returns a complete object even for a brand-new user, and PUT only
patches the keys it receives.
"""

from typing import Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator

VALID_INSTRUMENTS = ("NIFTY", "BANKNIFTY", "SENSEX")

# Single source of truth for defaults — the router merges the stored blob over this.
DEFAULTS = {
    "default_instrument": "NIFTY",
    "default_lots": 1,
    "confirm_close": True,
    "show_risk_warnings": True,
    "auto_fill_ltp": True,
    # ON  → orders block only the leveraged margin (5x); OFF → orders block the
    # full contract value (1x), so trades draw on the sandbox funds directly.
    "leverage_enabled": True,
    "notify_discipline": True,
    "notify_cooldown": True,
    "notify_daily_loss": True,
    "notify_trade_confirm": False,
}


class SettingsResponse(BaseModel):
    default_instrument: str
    default_lots: int
    confirm_close: bool
    show_risk_warnings: bool
    auto_fill_ltp: bool
    leverage_enabled: bool
    notify_discipline: bool
    notify_cooldown: bool
    notify_daily_loss: bool
    notify_trade_confirm: bool


class SettingsUpdate(BaseModel):
    """Partial patch — only provided keys are written."""
    model_config = ConfigDict(extra="forbid")

    default_instrument: Optional[str] = None
    default_lots: Optional[int] = Field(default=None, ge=1, le=50)
    confirm_close: Optional[bool] = None
    show_risk_warnings: Optional[bool] = None
    auto_fill_ltp: Optional[bool] = None
    leverage_enabled: Optional[bool] = None
    notify_discipline: Optional[bool] = None
    notify_cooldown: Optional[bool] = None
    notify_daily_loss: Optional[bool] = None
    notify_trade_confirm: Optional[bool] = None

    @field_validator("default_instrument")
    @classmethod
    def valid_instrument(cls, v):
        if v is not None and v not in VALID_INSTRUMENTS:
            raise ValueError(f"default_instrument must be one of {VALID_INSTRUMENTS}")
        return v
