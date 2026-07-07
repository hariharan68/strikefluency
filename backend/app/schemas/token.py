"""
app/schemas/token.py
─────────────────────
JWT token request and response shapes.
"""

from pydantic import BaseModel
from app.schemas.auth import UserProfile


class TokenResponse(BaseModel):
    """
    Returned on successful login or register.
    The frontend stores both tokens — access_token in memory,
    refresh_token in localStorage (or httpOnly cookie in production).
    """
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserProfile


class RefreshTokenRequest(BaseModel):
    """Body for POST /auth/refresh"""
    refresh_token: str


class AccessTokenResponse(BaseModel):
    """Returned on POST /auth/refresh — only a new access token"""
    access_token: str
    token_type: str = "bearer"