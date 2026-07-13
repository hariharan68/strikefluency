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
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 5
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    EPHEMERAL_IDLE_TIMEOUT_MINUTES: int = 30
    EPHEMERAL_ABSOLUTE_CAP_HOURS: int = 12
    COOKIE_SECURE: bool = False
    TRUSTED_ORIGINS: str = (
        "http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176,"
        "http://localhost:3000,"
        "http://127.0.0.1:5173,http://127.0.0.1:5174,http://127.0.0.1:5175,http://127.0.0.1:5176"
    )

    # App
    ENVIRONMENT: str = "development"
    SQL_ECHO: bool = False

    # Market data provider: mock | fyers | truedata
    MARKET_DATA_PROVIDER: str = "mock"
    NIFTY_LOT_SIZE: int = 50

    # Fyers (dev/testing)
    FYERS_CLIENT_ID: str = ""
    FYERS_APP_ID: str = ""
    FYERS_SECRET_ID: str = ""
    FYERS_REDIRECT_URI: str = ""
    FYERS_ACCESS_TOKEN: str = ""
    FYERS_TOKEN_FILE: str = "fyers_token.json"
    FYERS_ACCESS_TOKEN_FILE: str = "access_token.txt"
    BROKER_TOKEN_ENC_KEY: str = ""
    FRONTEND_URL: str = "http://localhost:5173"

    # Discipline defaults
    DEFAULT_MAX_TRADES_PER_DAY: int = 3
    DEFAULT_COOLDOWN_MINUTES: int = 15
    DEFAULT_MAX_DAILY_LOSS_PCT: float = 2.0
    DEFAULT_INITIAL_CAPITAL: float = 100000.0

    # Google OAuth
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/v1/oauth/google/callback"
    GITHUB_CLIENT_ID: str = ""
    GITHUB_CLIENT_SECRET: str = ""
    GITHUB_REDIRECT_URI: str = "http://localhost:8000/api/v1/oauth/github/callback"
    FACEBOOK_CLIENT_ID: str = ""
    FACEBOOK_CLIENT_SECRET: str = ""
    FACEBOOK_REDIRECT_URI: str = "http://localhost:8000/api/v1/oauth/facebook/callback"
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""
    SMTP_STARTTLS: bool = True
    REDIS_URL: str = ""
    JTI_DENYLIST_ENABLED: bool = False

    @property
    def is_development(self) -> bool:
        return self.ENVIRONMENT == "development"

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @property
    def trusted_origins(self) -> tuple[str, ...]:
        return tuple(origin.strip().rstrip("/") for origin in self.TRUSTED_ORIGINS.split(",") if origin.strip())

    def validate_security(self) -> None:
        if not self.is_production:
            return
        problems = []
        if not self.COOKIE_SECURE:
            problems.append("COOKIE_SECURE must be true in production")
        if len(self.SECRET_KEY) < 32 or self.SECRET_KEY.startswith("replace-this"):
            problems.append("SECRET_KEY must be at least 32 characters in production")
        if self.GOOGLE_CLIENT_ID and self.GOOGLE_REDIRECT_URI.startswith("http://"):
            problems.append("GOOGLE_REDIRECT_URI must use https in production")
        if self.GITHUB_CLIENT_ID and self.GITHUB_REDIRECT_URI.startswith("http://"):
            problems.append("GITHUB_REDIRECT_URI must use https in production")
        if self.FACEBOOK_CLIENT_ID and self.FACEBOOK_REDIRECT_URI.startswith("http://"):
            problems.append("FACEBOOK_REDIRECT_URI must use https in production")
        if self.FRONTEND_URL.startswith("http://"):
            problems.append("FRONTEND_URL must use https in production")
        if any(origin.startswith("http://") for origin in self.trusted_origins):
            problems.append("TRUSTED_ORIGINS must all use https in production")
        if problems:
            raise RuntimeError("Refusing to start: " + "; ".join(problems))


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
settings.validate_security()
