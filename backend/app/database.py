"""
app/database.py
───────────────
Sets up the SQLAlchemy connection to PostgreSQL.

Three things every FastAPI + SQLAlchemy project needs:
  1. engine      — the raw connection to the database
  2. SessionLocal — a factory that creates DB sessions
  3. Base        — the parent class all our ORM models inherit from

get_db() is a FastAPI dependency injected into route handlers.
It gives each request its own session, and guarantees cleanup.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.config import settings


# ── Engine ────────────────────────────────────────────────────────────────────
# pool_pre_ping=True: test each connection before using it.
# Prevents "connection was closed" errors after Postgres restarts.
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_size=10,       # max persistent connections in the pool
    max_overflow=20,    # extra connections allowed when pool is full
    echo=settings.SQL_ECHO,
)


# ── Session factory ───────────────────────────────────────────────────────────
# autocommit=False: we commit explicitly — no silent auto-commits
# autoflush=False:  we control when changes hit the DB
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


# ── Declarative base ──────────────────────────────────────────────────────────
# All ORM models (User, VirtualOrder, etc.) inherit from this.
# SQLAlchemy uses it to track which classes are tables.
class Base(DeclarativeBase):
    pass


# ── FastAPI dependency ────────────────────────────────────────────────────────
def get_db():
    """
    Yields a database session for the duration of one HTTP request.
    The finally block guarantees the session is closed even if an
    exception is raised inside the route handler.

    Usage in a route:
        from app.database import get_db
        from sqlalchemy.orm import Session
        from fastapi import Depends

        @router.get("/example")
        def example(db: Session = Depends(get_db)):
            ...
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()