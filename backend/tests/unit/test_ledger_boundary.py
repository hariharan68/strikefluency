"""
Structural gate: virtual_accounts.balance is written in exactly one place.

Modelled on tests/unit/test_paper_trading_boundary.py — the invariant is
enforced by scanning the source, not by trusting reviewers to notice.

AST rather than grep because `self.account .balance  -=` with odd whitespace,
`acct.balance`, and `order.account.balance` all slip past a regex, while the
AST sees an Attribute node named `balance` regardless of how it is spelled.

Note what this does NOT catch: setattr(account, "balance", x), or a missed
call site that simply never posts. The real guarantee is the runtime
reconciliation assert_ledger_reconciles() in tests/integration/test_ledger.py.
This test catches the easy, common mistake early and with a clear message.
"""

import ast
from pathlib import Path

APP_DIR = Path(__file__).resolve().parents[2] / "app"

# The one module allowed to write the balance.
BALANCE_EXEMPT = {"services/ledger_service.py"}

# The one module allowed to construct an account (it opens it at zero and
# immediately credits it through the ledger).
CONSTRUCT_EXEMPT = {"services/auth_service.py"}

GUARDED_ATTRS = {"balance"}


def _python_files():
    for path in sorted(APP_DIR.rglob("*.py")):
        if "__pycache__" in path.parts:
            continue
        yield path, path.relative_to(APP_DIR).as_posix()


def _targets(node):
    """The assignment targets of an Assign / AugAssign node."""
    if isinstance(node, ast.Assign):
        return node.targets
    if isinstance(node, ast.AugAssign):
        return [node.target]
    return []


def test_balance_is_never_mutated_outside_ledger_service():
    violations = []
    for path, rel in _python_files():
        if rel in BALANCE_EXEMPT:
            continue
        tree = ast.parse(path.read_text(encoding="utf-8-sig"), filename=str(path))
        for node in ast.walk(tree):
            for target in _targets(node):
                if isinstance(target, ast.Attribute) and target.attr in GUARDED_ATTRS:
                    violations.append(f"{rel}:{node.lineno}  {target.attr}")

    assert not violations, (
        "virtual_accounts.balance must only be written by "
        "app/services/ledger_service.py, so that every balance change has a "
        "matching virtual_fund_ledger row. Offending writes:\n  "
        + "\n  ".join(violations)
        + "\n\nUse ledger_service.post() or one of its wrappers instead."
    )


def test_virtual_account_is_only_constructed_in_auth_service():
    """
    A VirtualAccount built with a non-zero balance= would create money without
    a ledger row, which the AST balance scan above cannot see.
    """
    violations = []
    for path, rel in _python_files():
        if rel in CONSTRUCT_EXEMPT:
            continue
        tree = ast.parse(path.read_text(encoding="utf-8-sig"), filename=str(path))
        for node in ast.walk(tree):
            if (isinstance(node, ast.Call)
                    and isinstance(node.func, ast.Name)
                    and node.func.id == "VirtualAccount"):
                violations.append(f"{rel}:{node.lineno}")

    assert not violations, (
        "VirtualAccount must only be constructed in app/services/auth_service.py, "
        "which opens it at zero and credits it through the ledger. Offending "
        "constructions:\n  " + "\n  ".join(violations)
    )


def test_exempt_files_exist():
    """Guard against the allowlists silently going stale after a rename."""
    for rel in BALANCE_EXEMPT | CONSTRUCT_EXEMPT:
        assert (APP_DIR / rel).is_file(), f"allowlisted file no longer exists: {rel}"
