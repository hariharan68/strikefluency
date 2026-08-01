"""
app/schemas/auth.py
────────────────────
Pydantic models for auth request bodies and responses.
Pydantic validates incoming JSON automatically — if the request
doesn't match the schema, FastAPI returns 422 before your code runs.
"""

import re
import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, field_validator, ConfigDict

# Country code + digits, spaces, hyphens, parentheses — deliberately loose since
# the number is contact-only and never used for auth.
_PHONE_RE = re.compile(r"^[0-9+\-()\s]{6,20}$")


class RegisterRequest(BaseModel):
    """Body for POST /auth/register"""
    full_name: str
    email: EmailStr          # Pydantic validates email format automatically
    password: str
    tenant_code: Optional[str] = None  # If None → create new tenant

    remember_me: bool = True

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v

    @field_validator("full_name")
    @classmethod
    def full_name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Full name cannot be empty")
        return v.strip()


class UserProfile(BaseModel):
    """
    Returned on GET /auth/me and embedded in TokenResponse.
    model_config from_attributes=True allows creating this from
    a SQLAlchemy ORM object directly: UserProfile.model_validate(user)
    """
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    full_name: str
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
    avatar_preset: Optional[str] = None
    role: str
    plan: str
    tenant_id: uuid.UUID
    is_active: bool
    created_at: datetime
    # Lets the UI hide "Change password" for OAuth-only accounts (which have no
    # password to change).
    has_usable_password: bool


class ProfileUpdate(BaseModel):
    """Body for PUT /auth/me — editable identity fields."""
    full_name: str
    # Omit to leave unchanged; send "" (or whitespace) to clear it.
    phone: Optional[str] = None

    @field_validator("full_name")
    @classmethod
    def full_name_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Full name cannot be empty")
        if len(v) > 100:
            raise ValueError("Full name is too long")
        return v

    @field_validator("phone")
    @classmethod
    def phone_shape(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip()
        if not v:
            return None  # empty string clears the stored number
        if not _PHONE_RE.match(v):
            raise ValueError("Enter a valid phone number")
        return v


class PasswordChange(BaseModel):
    """Body for POST /auth/change-password."""
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def new_password_min_length(cls, v: str) -> str:
        # Same policy as registration (RegisterRequest.password_min_length).
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    remember_me: bool = True
