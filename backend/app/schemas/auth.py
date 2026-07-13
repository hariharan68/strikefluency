"""
app/schemas/auth.py
────────────────────
Pydantic models for auth request bodies and responses.
Pydantic validates incoming JSON automatically — if the request
doesn't match the schema, FastAPI returns 422 before your code runs.
"""

import uuid
from typing import Optional
from pydantic import BaseModel, EmailStr, field_validator, ConfigDict


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
    role: str
    tenant_id: uuid.UUID
    is_active: bool


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    remember_me: bool = True
