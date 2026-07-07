"""
app/core/oauth2_schemes.py
───────────────────────────
Defines the FastAPI OAuth2 dependency.

oauth2_scheme is a FastAPI Depends() object that:
  1. Reads the Authorization header
  2. Expects the format:  Authorization: Bearer <token>
  3. Extracts and returns the raw token string
  4. Returns 401 automatically if header is missing

Every protected route uses this as a dependency via dependencies.py.
You never call this directly — FastAPI injects it.

Example (in a router):
    from fastapi import Depends
    from app.dependencies import get_current_user

    @router.get("/protected")
    def protected(current_user = Depends(get_current_user)):
        return {"user": current_user.email}
"""

from fastapi.security import OAuth2PasswordBearer

# tokenUrl is the endpoint where clients POST to get a token.
# This is used by FastAPI's Swagger UI (/docs) to show a login button.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")