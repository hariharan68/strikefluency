"""
app/config.py — all configuration via .env
"""

from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # Database
    DATABASE_URL: str

    # JWT
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # App
    ENVIRONMENT: str = "development"

    # Market data provider: mock | fyers | truedata
    MARKET_DATA_PROVIDER: str = "mock"
    NIFTY_LOT_SIZE: int = 50

    # Fyers (dev/testing)
    FYERS_CLIENT_ID: str = ""
    FYERS_APP_ID: str = ""
    FYERS_SECRET_ID: str = ""
    FYERS_REDIRECT_URI: str = ""
    FYERS_ACCESS_TOKEN: str = ""

    # Discipline defaults
    DEFAULT_MAX_TRADES_PER_DAY: int = 3
    DEFAULT_COOLDOWN_MINUTES: int = 15
    DEFAULT_MAX_DAILY_LOSS_PCT: float = 2.0
    DEFAULT_INITIAL_CAPITAL: float = 100000.0

    # Google OAuth
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/oauth/google/callback"

    @property
    def is_development(self) -> bool:
        return self.ENVIRONMENT == "development"

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()