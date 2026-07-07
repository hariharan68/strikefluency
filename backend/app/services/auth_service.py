"""
app/services/auth_service.py
─────────────────────────────
Registration and authentication business logic.

register_user() does 6 things atomically:
  1. Resolve or create tenant
  2. Check email not already taken
  3. Create User with hashed password
  4. Create VirtualAccount (₹1,00,000 starting balance)
  5. Seed all 7 DisciplineRule records with default values
  6. Create today's TradingSession

authenticate_user() verifies email + password and returns the User.
"""

import uuid
from datetime import date, datetime, timezone
from sqlalchemy.orm import Session

from app.core.constants import DEFAULT_DISCIPLINE_RULES, UserRole
from app.core.exceptions import (
    InvalidCredentialsError,
    UserAlreadyExistsError,
    TenantNotFoundError,
)
from app.core.security import hash_password, verify_password
from app.models.discipline_rule import DisciplineRule
from app.models.tenant import Tenant
from app.models.trading_session import TradingSession
from app.models.user import User
from app.models.virtual_account import VirtualAccount
from app.schemas.auth import RegisterRequest


def register_user(db: Session, data: RegisterRequest) -> User:
    """
    Create a new user and all associated records.
    Everything runs in one transaction — if anything fails,
    nothing is saved (the caller's db.commit() won't be reached).
    """

    # ── Step 1: Resolve or create tenant ──────────────────
    if data.tenant_code:
        # Join an existing tenant
        tenant = db.query(Tenant).filter(
            Tenant.tenant_code == data.tenant_code.upper(),
            Tenant.is_active == True,
        ).first()
        if not tenant:
            raise TenantNotFoundError(
                f"No active tenant found with code '{data.tenant_code}'"
            )
        user_role = UserRole.TRADER
    else:
        # Create a brand new tenant — this user becomes the admin
        tenant = Tenant(
            name=f"{data.full_name}'s Team",
            tenant_code=_generate_tenant_code(),
            is_active=True,
        )
        db.add(tenant)
        db.flush()  # flush to get tenant.id without committing
        user_role = UserRole.TENANT_ADMIN

    # ── Step 2: Check email not already taken in this tenant ──
    existing = db.query(User).filter(
        User.tenant_id == tenant.id,
        User.email == data.email.lower(),
    ).first()
    if existing:
        raise UserAlreadyExistsError(
            f"Email '{data.email}' is already registered"
        )

    # ── Step 3: Create User ────────────────────────────────
    user = User(
        tenant_id=tenant.id,
        email=data.email.lower(),
        hashed_password=hash_password(data.password),
        full_name=data.full_name.strip(),
        role=user_role,
        is_active=True,
    )
    db.add(user)
    db.flush()  # flush to get user.id

    # ── Step 4: Create VirtualAccount ─────────────────────
    account = VirtualAccount(
        user_id=user.id,
        tenant_id=tenant.id,
    )
    db.add(account)

    # ── Step 5: Seed all 7 discipline rules ───────────────
    for rule_code, rule_value in DEFAULT_DISCIPLINE_RULES.items():
        rule = DisciplineRule(
            user_id=user.id,
            tenant_id=tenant.id,
            rule_code=rule_code,
            rule_value=rule_value,
            is_active=True,
        )
        db.add(rule)

    # ── Step 6: Create today's trading session ─────────────
    session = TradingSession(
        user_id=user.id,
        tenant_id=tenant.id,
        session_date=date.today(),
    )
    db.add(session)

    return user


def authenticate_user(db: Session, email: str, password: str) -> User:
    """
    Verify email + password. Returns the User if valid.
    Raises InvalidCredentialsError if email not found or password wrong.

    We deliberately use the same error for both cases —
    never tell attackers whether the email exists.
    """
    user = db.query(User).filter(
        User.email == email.lower(),
        User.is_active == True,
    ).first()

    if not user:
        raise InvalidCredentialsError("Invalid email or password")

    if not verify_password(password, user.hashed_password):
        raise InvalidCredentialsError("Invalid email or password")

    return user


# ── Private helpers ───────────────────────────────────────────

def _generate_tenant_code() -> str:
    """
    Generate a short unique tenant invite code.
    e.g. "SF-A3F9C2B1"
    """
    return f"SF-{uuid.uuid4().hex[:8].upper()}"