"""
app/models/append_only.py
─────────────────────────
Makes a table append-only at the storage layer.

Used by virtual_fund_ledger and audit_logs. Both exist to be trusted without
reading the code that wrote them, which a convention cannot deliver — the first
person in psql at 2am has no convention to consult.

UPDATE is blocked; DELETE deliberately is not. Test teardown and account
deletion both need DELETE, and a deletion at least fails loudly as a gap in
`seq`, whereas an in-place update corrupts history silently. To correct a row,
write a new compensating one.

The trigger is attached via an `after_create` DDL event so that ORM-driven
Table.create() (the conftest schema-drift patcher) and Alembic produce
identical schemas — otherwise local runs would quietly have no guard.
"""

from sqlalchemy import DDL, event


class AppendOnlyViolation(RuntimeError):
    """Raised in-process when something tries to mutate a persisted row."""


def forbid_update_sql(table_name: str, name: str | None = None) -> tuple[str, str]:
    """
    The (function, trigger) DDL pair for a table. Returned as plain strings so
    migrations can embed them verbatim rather than importing model code, which
    must stay frozen against drift.

    `name` overrides the function-name stem. virtual_fund_ledger passes "vfl"
    to keep the identifiers its already-applied migration created.
    """
    fn_name = f"{name or table_name}_forbid_update"
    return (
        f"""
        CREATE OR REPLACE FUNCTION {fn_name}() RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION '{table_name} is append-only (attempted UPDATE on row %)', OLD.id;
        END;
        $$ LANGUAGE plpgsql
        """,
        f"""
        CREATE TRIGGER trg_{fn_name}
            BEFORE UPDATE ON {table_name}
            FOR EACH ROW EXECUTE FUNCTION {fn_name}()
        """,
    )


def drop_forbid_update_sql(table_name: str, name: str | None = None) -> tuple[str, str]:
    """The matching teardown, for migration downgrades."""
    fn_name = f"{name or table_name}_forbid_update"
    return (
        f"DROP TRIGGER IF EXISTS trg_{fn_name} ON {table_name}",
        f"DROP FUNCTION IF EXISTS {fn_name}()",
    )


def attach_append_only_guard(model, name: str | None = None) -> None:
    """
    Wire both layers of protection onto a model:

      - the Postgres trigger, which is the real guarantee
      - an ORM before_update listener, which fails at the offending line with a
        readable message instead of an opaque InternalError at flush time
    """
    table_name = model.__tablename__
    create_fn, create_trigger = forbid_update_sql(table_name, name)
    event.listen(model.__table__, "after_create", DDL(create_fn))
    event.listen(model.__table__, "after_create", DDL(create_trigger))

    @event.listens_for(model, "before_update", propagate=True)
    def _block_update(mapper, connection, target):  # noqa: ARG001
        raise AppendOnlyViolation(
            f"{table_name} is append-only; tried to update row {getattr(target, 'id', '?')}. "
            "Write a new compensating row instead."
        )
