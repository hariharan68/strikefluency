"""
app/routers/auth.py
────────────────────
Auth endpoints — 5 routes:

  POST /auth/register  → create account, return tokens
  POST /auth/login     → verify credentials, return tokens
  POST /auth/refresh   → exchange refresh token for new access token
  POST /auth/logout    → revoke refresh token
  GET  /auth/me        → return current user profile

Routers are thin — they validate input, call services, return responses.
Business logic lives in services/, not here.
"""

from fastapi import APIRouter, Depends, Request
from fastapi.security import OAuth2PasswordRequestForm
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.exceptions import InvalidCredentialsError, TokenInvalidError
from app.core.security import create_access_token, create_refresh_token, verify_token
from app.database import get_db
from app.dependencies import CurrentUser
from app.schemas.auth import RegisterRequest, UserProfile
from app.schemas.common import SuccessResponse
from app.schemas.token import AccessTokenResponse, RefreshTokenRequest, TokenResponse
from app.services.auth_service import authenticate_user, register_user
from app.services.token_service import (
    create_refresh_token_record,
    revoke_refresh_token,
    verify_refresh_token_record,
)
from app.models.user import User

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/register", response_model=TokenResponse, status_code=201)
def register(
    data: RegisterRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Register a new user.

    - If tenant_code is provided → joins that team as a trader
    - If tenant_code is omitted  → creates a new team, becomes admin

    On success: returns access + refresh tokens immediately
    (user is logged in right after registration — no extra login step).
    """
    user = register_user(db, data)

    # Create tokens
    access_token  = create_access_token(str(user.id), str(user.tenant_id), user.role)
    refresh_token = create_refresh_token(str(user.id), str(user.tenant_id))

    # Save refresh token hash to DB
    device_info = request.headers.get("user-agent", "unknown")
    create_refresh_token_record(db, user, refresh_token, device_info)

    db.commit()

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserProfile.model_validate(user),
    )


@router.post("/login", response_model=TokenResponse)
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """
    Login with email + password.

    Uses OAuth2PasswordRequestForm — the Swagger UI /docs will show
    a username/password form. Enter your email in the username field.

    Returns access token (24h) + refresh token (7d).
    """
    # OAuth2PasswordRequestForm uses `username` field — we treat it as email
    user = authenticate_user(db, email=form_data.username, password=form_data.password)

    access_token  = create_access_token(str(user.id), str(user.tenant_id), user.role)
    refresh_token = create_refresh_token(str(user.id), str(user.tenant_id))

    device_info = request.headers.get("user-agent", "unknown")
    create_refresh_token_record(db, user, refresh_token, device_info)

    db.commit()

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserProfile.model_validate(user),
    )


@router.post("/refresh", response_model=AccessTokenResponse)
def refresh_token(
    data: RefreshTokenRequest,
    db: Session = Depends(get_db),
):
    """
    Exchange a valid refresh token for a new access token.

    Flow:
      1. Verify the JWT signature and expiry
      2. Check the token record in DB (not revoked, not expired)
      3. Look up the user
      4. Issue a new access token

    The refresh token itself is NOT rotated here (Phase 1 simplification).
    In production you'd issue a new refresh token and revoke the old one.
    """
    # Step 1: Verify JWT signature
    try:
        payload = verify_token(data.refresh_token, expected_type="refresh")
    except JWTError:
        raise InvalidCredentialsError("Invalid or expired refresh token")

    # Step 2: Check DB record
    verify_refresh_token_record(db, data.refresh_token)

    # Step 3: Get user
    user_id = payload.get("sub")
    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user:
        raise InvalidCredentialsError("User not found")

    # Step 4: Issue new access token
    new_access_token = create_access_token(
        str(user.id), str(user.tenant_id), user.role
    )

    return AccessTokenResponse(access_token=new_access_token)


@router.post("/logout", response_model=SuccessResponse)
def logout(
    data: RefreshTokenRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Logout — revoke the refresh token.

    After this, the refresh token cannot be used to get new access tokens.
    The access token remains valid until it expires (24h) — this is
    acceptable for Phase 1. In production you'd use a short TTL or blocklist.
    """
    revoke_refresh_token(db, data.refresh_token)
    db.commit()
    return SuccessResponse(message="Logged out successfully")


@router.get("/me", response_model=UserProfile)
def get_me(current_user: CurrentUser):
    """
    Return the current authenticated user's profile.
    No DB query needed — get_current_user() already loaded the user.
    """
    return UserProfile.model_validate(current_user)