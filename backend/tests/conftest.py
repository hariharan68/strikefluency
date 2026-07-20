"""
Shared pytest fixtures.

The bulk of the suite is pure (no DB) and needs nothing here. These fixtures are
only for integration tests that touch Postgres. They:
  - SKIP the whole module if Postgres isn't reachable (so unit-only CI is green),
  - run every test inside an outer transaction rolled back at teardown
    (join_transaction_mode="create_savepoint" makes route-level commits reversible),
  - create the Strategy Builder tables in that transaction if the migration
    hasn't been applied yet (it is currently blocked by a pre-existing
    duplicate-email row), so tests work regardless of migration state.

Nothing a test writes is ever persisted.
"""

import uuid
from decimal import Decimal

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session

from app.config import settings
from app.core.constants import DEFAULT_DISCIPLINE_RULES


@pytest.fixture(scope="session")
def db_engine():
    engine = create_engine(settings.DATABASE_URL)
    try:
        conn = engine.connect()
        conn.close()
    except Exception as e:                     # pragma: no cover
        pytest.skip(f"Postgres not reachable: {e}", allow_module_level=True)
    return engine


def _ensure_strategy_schema(conn) -> None:
    from app.models.strategy import (
        Strategy as SORM, StrategyLeg, StrategyPosition,
    )
    insp = inspect(conn)
    for model in (SORM, StrategyLeg, StrategyPosition):
        if not insp.has_table(model.__tablename__):
            model.__table__.create(conn)
    vo_cols = {c["name"] for c in insp.get_columns("virtual_orders")}
    if "strategy_id" not in vo_cols:
        conn.execute(text("ALTER TABLE virtual_orders ADD COLUMN strategy_id UUID NULL"))
    # ensure sl_price is nullable (Phase 5) regardless of migration state
    conn.execute(text("ALTER TABLE virtual_orders ALTER COLUMN sl_price DROP NOT NULL"))
    # Discipline Mode columns (migration 20260720) — add if not yet applied.
    if "was_free_play" not in vo_cols:
        conn.execute(text(
            "ALTER TABLE virtual_orders ADD COLUMN was_free_play BOOLEAN NOT NULL DEFAULT FALSE"))
    va_cols = {c["name"] for c in insp.get_columns("virtual_accounts")}
    if "discipline_mode_enabled" not in va_cols:
        conn.execute(text(
            "ALTER TABLE virtual_accounts ADD COLUMN discipline_mode_enabled BOOLEAN NOT NULL DEFAULT TRUE"))
    if "capital_unlocked" not in va_cols:
        conn.execute(text(
            "ALTER TABLE virtual_accounts ADD COLUMN capital_unlocked BOOLEAN NOT NULL DEFAULT FALSE"))
    # Per-user settings table (migration 20260721) — create if not yet applied.
    from app.models.user_settings import UserSettings as USORM
    if not inspect(conn).has_table(USORM.__tablename__):
        USORM.__table__.create(conn)


@pytest.fixture
def db_session(db_engine):
    conn = db_engine.connect()
    outer = conn.begin()
    _ensure_strategy_schema(conn)
    session = Session(bind=conn, join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        session.close()
        outer.rollback()
        conn.close()


@pytest.fixture
def seeded_user(db_session):
    """A throwaway tenant/user/account with a funded balance and default rules."""
    from app.models.tenant import Tenant
    from app.models.user import User
    from app.models.virtual_account import VirtualAccount
    from app.models.discipline_rule import DisciplineRule

    tenant = Tenant(id=uuid.uuid4(), name="T", tenant_code="t-" + uuid.uuid4().hex[:8])
    db_session.add(tenant); db_session.flush()
    user = User(id=uuid.uuid4(), tenant_id=tenant.id, email=f"{uuid.uuid4().hex}@t.com",
                hashed_password="x", full_name="Test", role="trader")
    db_session.add(user); db_session.flush()
    db_session.add(VirtualAccount(
        id=uuid.uuid4(), user_id=user.id, tenant_id=tenant.id,
        balance=Decimal("1000000"), initial_balance=Decimal("1000000")))
    for code, val in DEFAULT_DISCIPLINE_RULES.items():
        db_session.add(DisciplineRule(
            id=uuid.uuid4(), user_id=user.id, tenant_id=tenant.id,
            rule_code=code, rule_value=val, is_active=True))
    db_session.flush()
    return user


@pytest.fixture
def api_client(db_session, seeded_user):
    """TestClient with get_db + get_current_user overridden to the seeded session."""
    from fastapi.testclient import TestClient
    from app.database import get_db
    from app.dependencies import get_current_user
    from app.main import app

    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_current_user] = lambda: seeded_user
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
