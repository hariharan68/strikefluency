"""
app/dependencies.py
────────────────────
Shared FastAPI dependencies injected into route handlers.

How FastAPI dependencies work:
  When you write `user = Depends(get_current_user)` in a route,
  FastAPI calls get_current_user() before the route runs.
  If it raises an exception, the route never executes.
  If it returns a value, that value is passed into the route.

  This means auth is enforced at the framework level —
  you can't forget to check auth in a route if you use Depends().
"""

import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, status
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.oauth2_schemes import oauth2_scheme
from app.core.security import verify_token
from app.database import get_db
from app.models.user import User
from app.services.jti_store import is_denied


def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Session = Depends(get_db),
) -> User:
    """
    Extract + verify JWT, then return the User from the database.

    Flow:
      1. oauth2_scheme reads Authorization: Bearer <token> header
      2. verify_token() decodes the JWT and checks signature + expiry
      3. We extract user_id from the payload ("sub" claim)
      4. We query the DB for that user
      5. We check the user is still active (not soft-deleted)
      6. Return the User ORM object

    Raises:
      401 UNAUTHORIZED if:
        - No Authorization header present
        - Token is invalid or expired
        - User not found in DB
        - User is inactive

    Usage in any router:
      from fastapi import Depends
      from app.dependencies import get_current_user
      from app.models.user import User

      @router.get("/me")
      def get_me(current_user: User = Depends(get_current_user)):
          return {"email": current_user.email}
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # ── Step 1: Decode and verify the JWT ─────────────────
    try:
        payload = verify_token(token, expected_type="access")
        user_id_str: str = payload.get("sub")
        if user_id_str is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    if is_denied(payload.get("jti")):
        raise credentials_exception

    # ── Step 2: Parse the user_id UUID ────────────────────
    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError:
        raise credentials_exception

    # ── Step 3: Look up user in DB ────────────────────────
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exception

    # ── Step 4: Check user is active ──────────────────────
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated",
        )

    if payload.get("tv", 0) != user.token_version:
        raise credentials_exception

    return user


def get_current_auth(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Session = Depends(get_db),
) -> tuple[User, dict]:
    """Return the authenticated user and claims for session-aware endpoints."""
    user = get_current_user(token, db)
    return user, verify_token(token, expected_type="access")


def get_current_active_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    """
    Same as get_current_user, but also requires tenant_admin or super_admin role.

    Usage:
      @router.delete("/users/{id}")
      def delete_user(admin: User = Depends(get_current_active_admin)):
          ...
    """
    if current_user.role not in ("tenant_admin", "super_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user


# ── Type aliases ──────────────────────────────────────────────
# Use these in route signatures for cleaner code.
#
# Instead of:
#   def my_route(current_user: User = Depends(get_current_user)):
#
# Write:
#   def my_route(current_user: CurrentUser):

CurrentUser = Annotated[User, Depends(get_current_user)]
CurrentAdmin = Annotated[User, Depends(get_current_active_admin)]
