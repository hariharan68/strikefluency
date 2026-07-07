"""
migrations/env.py
──────────────────
Alembic's runtime environment configuration.
This file runs every time you execute an `alembic` command.

Two important things we configure here:
  1. The database URL (read from .env via app.config)
  2. The target metadata (Base.metadata from all our models)

Without #2, autogenerate won't know what tables to create.
"""

from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context

# ── Load our app settings + all models ───────────────────
# This MUST happen before target_metadata is set.
from app.config import settings
from app.database import Base
import app.models  # noqa: F401 — imports all 11 models so Base.metadata knows about them

# ── Standard Alembic setup ────────────────────────────────
config = context.config

# Set the database URL from .env (overrides alembic.ini sqlalchemy.url)
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# This is what Alembic uses to detect what tables should exist
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """
    Run migrations without a live DB connection.
    Outputs SQL to stdout — useful for reviewing what will run.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """
    Run migrations with a live DB connection.
    This is what `alembic upgrade head` uses.
    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()