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


@pytest.fixture
def market_open(monkeypatch):
    """Make order-flow tests deterministic regardless of real market hours."""
    monkeypatch.setattr(
        "app.core.utils.is_market_open",
        lambda: True,
    )


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
    if "client_order_id" not in vo_cols:
        conn.execute(text(
            "ALTER TABLE virtual_orders ADD COLUMN client_order_id UUID NULL"))
        conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_virtual_orders_user_client_order "
            "ON virtual_orders (user_id, client_order_id)"))
    if "strategy_id" not in vo_cols:
        conn.execute(text("ALTER TABLE virtual_orders ADD COLUMN strategy_id UUID NULL"))
    # ensure sl_price is nullable (Phase 5) regardless of migration state
    conn.execute(text("ALTER TABLE virtual_orders ALTER COLUMN sl_price DROP NOT NULL"))
    # Discipline Mode columns (migration 20260720) — add if not yet applied.
    if "was_free_play" not in vo_cols:
        conn.execute(text(
            "ALTER TABLE virtual_orders ADD COLUMN was_free_play BOOLEAN NOT NULL DEFAULT FALSE"))
    # Entry brokerage leg (migration 20260728) — add if not yet applied.
    if "entry_brokerage" not in vo_cols:
        conn.execute(text(
            "ALTER TABLE virtual_orders ADD COLUMN entry_brokerage "
            "NUMERIC(10, 2) NOT NULL DEFAULT 0.00"))
    # Resting full-position LIMIT exit (migration 20260802).
    if "exit_limit_price" not in vo_cols:
        conn.execute(text(
            "ALTER TABLE virtual_orders ADD COLUMN exit_limit_price "
            "NUMERIC(10, 2) NULL"))
    # Subscription seam (migration 20260801) — add if not yet applied.
    u_cols = {c["name"] for c in insp.get_columns("users")}
    if "plan" not in u_cols:
        conn.execute(text(
            "ALTER TABLE users ADD COLUMN plan VARCHAR(20) NOT NULL DEFAULT 'free'"))
    # Profile contact number (migration 20260804) — add if not yet applied.
    if "phone" not in u_cols:
        conn.execute(text("ALTER TABLE users ADD COLUMN phone VARCHAR(20) NULL"))
    # Profile photo (migration 20260805) — add if not yet applied.
    if "avatar_url" not in u_cols:
        conn.execute(text("ALTER TABLE users ADD COLUMN avatar_url TEXT NULL"))
    # Preset avatar choice (migration 20260806) — add if not yet applied.
    if "avatar_preset" not in u_cols:
        conn.execute(text("ALTER TABLE users ADD COLUMN avatar_preset VARCHAR(20) NULL"))
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
    # Resting LIMIT orders (migration 20260727) — create if not yet applied.
    from app.models.pending_order import PendingOrder as POORM
    if not inspect(conn).has_table(POORM.__tablename__):
        POORM.__table__.create(conn)
    # Append-only funds ledger (migration 20260729) — create if not yet applied.
    # The append-only trigger rides along via the after_create DDL event on the
    # table, so this path and Alembic produce the same schema.
    from app.models.virtual_fund_ledger import VirtualFundLedger as VFLORM
    if not inspect(conn).has_table(VFLORM.__tablename__):
        VFLORM.__table__.create(conn)
    # Append-only audit trail (migration 20260730) — create if not yet applied.
    from app.models.audit_log import AuditLog as ALORM
    if not inspect(conn).has_table(ALORM.__tablename__):
        ALORM.__table__.create(conn)
    # Daily snapshots (migration 20260731) — create if not yet applied.
    from app.models.portfolio_snapshot import PortfolioSnapshot as PSORM
    from app.models.pnl_snapshot import PnlSnapshot as PLORM
    for model in (PSORM, PLORM):
        if not inspect(conn).has_table(model.__tablename__):
            model.__table__.create(conn)
    # OAuth tables (migration 20260711) — create if not yet applied. link_challenges
    # must exist before oauth_transactions, which now carries an FK to it.
    from app.models.link_challenge import LinkChallenge as LCORM
    from app.models.oauth_identity import OAuthIdentity as OIORM
    from app.models.oauth_transaction import OAuthTransaction as OTORM
    from app.models.security_notification import SecurityNotification as SNORM
    for model in (LCORM, OIORM, OTORM, SNORM):
        if not inspect(conn).has_table(model.__tablename__):
            model.__table__.create(conn)
    # OAuth completion columns (migration 20260803) — add if not yet applied.
    if "has_usable_password" not in u_cols:
        conn.execute(text(
            "ALTER TABLE users ADD COLUMN has_usable_password BOOLEAN NOT NULL DEFAULT TRUE"))
    ot_cols = {c["name"] for c in inspect(conn).get_columns("oauth_transactions")}
    if "nonce" not in ot_cols:
        conn.execute(text("ALTER TABLE oauth_transactions ADD COLUMN nonce VARCHAR(128) NULL"))
    if "link_challenge_id" not in ot_cols:
        conn.execute(text(
            "ALTER TABLE oauth_transactions ADD COLUMN link_challenge_id UUID NULL "
            "REFERENCES link_challenges (id) ON DELETE CASCADE"))
    lc_cols = {c["name"] for c in inspect(conn).get_columns("link_challenges")}
    if "attempts" not in lc_cols:
        conn.execute(text(
            "ALTER TABLE link_challenges ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0"))
    if "verify_provider" not in lc_cols:
        conn.execute(text("ALTER TABLE link_challenges ADD COLUMN verify_provider VARCHAR(20) NULL"))


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


def assert_ledger_reconciles(db, user_id) -> None:
    """
    The invariant the ledger exists to guarantee: the account balance equals
    the sum of every ledger row ever written for it.

    This is the real guarantee, as opposed to the AST gate in
    tests/unit/test_ledger_boundary.py — the AST scan catches a syntactically
    direct write, this catches a balance change that never posted at all.

    Note it reconciles against `balance`, not `initial_balance + SUM(amount)`:
    initial_balance is a discipline-rule denominator that discipline_mode_service
    mutates when capital is unlocked, so it is not a money anchor.
    """
    from sqlalchemy import func as sa_func
    from app.models.virtual_account import VirtualAccount
    from app.models.virtual_fund_ledger import VirtualFundLedger

    account = db.query(VirtualAccount).filter(
        VirtualAccount.user_id == user_id).one()
    total = db.query(sa_func.coalesce(sa_func.sum(VirtualFundLedger.amount), 0)).filter(
        VirtualFundLedger.account_id == account.id).scalar()

    assert Decimal(str(account.balance)) == Decimal(str(total)), (
        f"ledger does not reconcile: balance={account.balance} "
        f"but SUM(ledger.amount)={total}. A balance change was applied without "
        f"posting a matching virtual_fund_ledger row."
    )


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
    # Opened at zero and credited through the ledger, mirroring registration,
    # so assert_ledger_reconciles() holds for every test using this fixture.
    from app.services import ledger_service
    account = VirtualAccount(
        id=uuid.uuid4(), user_id=user.id, tenant_id=tenant.id,
        balance=Decimal("0.00"), initial_balance=Decimal("1000000"))
    db_session.add(account); db_session.flush()
    ledger_service.open_account(db_session, account, Decimal("1000000"))
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
