"""Authentication endpoints with memory-only access tokens and cookie refresh."""

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.config import settings
from app.core.exceptions import InvalidCredentialsError, UserAlreadyExistsError
from app.core.security import create_access_token
from app.database import get_db
from app.dependencies import CurrentUser, get_current_auth
from app.models.refresh_token import RefreshToken
from app.schemas.session import SessionSummary
from app.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest, UserProfile
from app.schemas.common import SuccessResponse
from app.schemas.token import AccessTokenResponse, TokenResponse
from app.services.auth_service import authenticate_user, register_user
from app.services.jti_store import deny_jti
from app.services.token_service import create_refresh_token_record, revoke_all_user_tokens, revoke_family, revoke_refresh_token, rotate_refresh_token

router = APIRouter(prefix="/auth", tags=["Auth"])
COOKIE_NAME = "refresh_token"
COOKIE_PATH = "/api/v1/auth"


def _check_origin(request: Request) -> None:
    origin = request.headers.get("origin") or request.headers.get("referer")
    if not origin or not any(origin.rstrip("/").startswith(value) for value in settings.trusted_origins):
        raise HTTPException(status_code=403, detail="Untrusted origin")


def _set_refresh_cookie(response: Response, raw_token: str, remember_me: bool) -> None:
    response.set_cookie(
        COOKIE_NAME, raw_token,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400 if remember_me else None,
        httponly=True, secure=settings.COOKIE_SECURE, samesite="lax", path=COOKIE_PATH,
    )


def _access(user: User, session_id) -> str:
    return create_access_token(
        str(user.id), str(user.tenant_id), user.role,
        session_id=str(session_id), token_version=user.token_version,
    )


def _token_response(response: Response, user: User, record, raw_refresh: str, remember_me: bool) -> TokenResponse:
    _set_refresh_cookie(response, raw_refresh, remember_me)
    return TokenResponse(access_token=_access(user, record.family_id), user=UserProfile.model_validate(user))


@router.post("/register", response_model=TokenResponse, status_code=201)
def register(data: RegisterRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    try:
        user = register_user(db, data)
        record, raw_refresh = create_refresh_token_record(db, user, request.headers.get("user-agent"), data.remember_me)
        db.commit()
    except (IntegrityError, UserAlreadyExistsError) as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="An account could not be created with these details") from exc
    return _token_response(response, user, record, raw_refresh, data.remember_me)


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    _check_origin(request)
    user = authenticate_user(db, email=data.email, password=data.password)
    record, raw_refresh = create_refresh_token_record(db, user, request.headers.get("user-agent"), data.remember_me)
    db.commit()
    return _token_response(response, user, record, raw_refresh, data.remember_me)


@router.post("/refresh", response_model=AccessTokenResponse)
def refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    _check_origin(request)
    raw_refresh = request.cookies.get(COOKIE_NAME)
    if not raw_refresh:
        raise InvalidCredentialsError("Invalid or expired refresh token")
    user, record, new_raw = rotate_refresh_token(db, raw_refresh, request.headers.get("user-agent"))
    _set_refresh_cookie(response, new_raw, record.session_policy == "persistent")
    return AccessTokenResponse(access_token=_access(user, record.family_id))


@router.post("/logout", response_model=SuccessResponse)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    _check_origin(request)
    raw_refresh = request.cookies.get(COOKIE_NAME)
    if raw_refresh:
        revoke_refresh_token(db, raw_refresh)
        db.commit()
    response.delete_cookie(COOKIE_NAME, path=COOKIE_PATH, secure=settings.COOKIE_SECURE, httponly=True, samesite="lax")
    return SuccessResponse(message="Logged out successfully")


@router.get("/me", response_model=UserProfile)
def get_me(current_user: CurrentUser):
    return UserProfile.model_validate(current_user)


@router.get("/sessions", response_model=list[SessionSummary])
def list_sessions(auth=Depends(get_current_auth), db: Session = Depends(get_db)):
    user, payload = auth
    current_family = payload.get("sid")
    records = db.query(RefreshToken).filter(
        RefreshToken.user_id == user.id,
        RefreshToken.is_revoked == False,
        RefreshToken.replaced_at.is_(None),
    ).order_by(RefreshToken.last_used_at.desc()).all()
    return [SessionSummary(
        family_id=record.family_id,
        device_info=record.device_info,
        session_policy=record.session_policy,
        created_at=record.created_at,
        last_used_at=record.last_used_at,
        expires_at=record.expires_at,
        current=str(record.family_id) == str(current_family),
    ) for record in records]


@router.delete("/sessions/{family_id}", response_model=SuccessResponse)
def revoke_session(family_id: str, current_user: CurrentUser, db: Session = Depends(get_db)):
    db.query(RefreshToken).filter(RefreshToken.user_id == current_user.id, RefreshToken.family_id == family_id).update({"is_revoked": True, "revoked_at": datetime.now(timezone.utc), "revoke_reason": "session_revoke"}, synchronize_session=False)
    db.commit()
    return SuccessResponse(message="Session revoked")


@router.post("/logout-all", response_model=SuccessResponse)
def logout_all(response: Response, auth=Depends(get_current_auth), db: Session = Depends(get_db)):
    current_user, payload = auth
    revoke_all_user_tokens(db, current_user.id)
    current_user.token_version += 1
    db.commit()
    if payload.get("jti") and payload.get("exp"):
        deny_jti(payload["jti"], int(payload["exp"]))
    response.delete_cookie(COOKIE_NAME, path=COOKIE_PATH, secure=settings.COOKIE_SECURE, httponly=True, samesite="lax")
    return SuccessResponse(message="All sessions signed out")
