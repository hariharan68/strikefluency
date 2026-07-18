"""
app/strategy/
─────────────
Strategy Builder — the calculation core.

Everything in this package is deliberately free of FastAPI, SQLAlchemy and
database sessions. It takes plain numbers and dataclasses in, and returns
plain numbers and dataclasses out. That keeps it unit-testable without a
database (which matters here — tests/conftest.py is empty and the ORM models
use postgresql.UUID, so there is no working SQLite harness to lean on) and
makes the package portable to another project by copying the folder.

The database-facing, user-facing, request-facing parts live where the rest of
the app keeps them, following existing conventions:
    app/models/strategy.py      ORM
    app/services/strategy_*.py  business logic (module functions, db: Session)
    app/schemas/strategy.py     Pydantic
    app/routers/strategy.py     API

NUMERIC CONVENTION
──────────────────
This package works in `float`, not `Decimal`. Payoff curves, Black-Scholes and
greeks are continuous maths where Decimal buys nothing and costs a lot of
readability. The rest of the app persists money as Numeric(10,2) → Decimal;
the service layer converts at the ORM boundary. Do not leak Decimal in here,
and do not persist a float without quantizing it there.
"""
