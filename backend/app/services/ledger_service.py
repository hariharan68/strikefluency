"""
app/services/ledger_service.py
──────────────────────────────
The only place virtual_accounts.balance is ever written.

Every balance change posts a matching virtual_fund_ledger row in the same
transaction, so the account balance and its audit trail can never disagree.
tests/unit/test_ledger_boundary.py enforces this structurally: a direct
`account.balance = ...` anywhere else in app/ fails the suite.

Callers must already hold the account row lock (SELECT ... FOR UPDATE) before
posting. Every existing call site does, as part of the account -> order ->
position -> session lock ordering documented in virtual_order_service.

Like the rest of the service layer, nothing here commits. The router owns the
transaction.
"""

import uuid
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from app.core.exceptions import InsufficientBalanceError
from app.models.virtual_account import VirtualAccount
from app.models.virtual_fund_ledger import VirtualFundLedger

_PAISE = Decimal("0.01")


class LedgerTxnType:
    """The transaction types from the architecture doc, section 21."""
    INITIAL_CREDIT = "INITIAL_CREDIT"
    TRADE_DEBIT = "TRADE_DEBIT"
    TRADE_CREDIT = "TRADE_CREDIT"
    CHARGE = "CHARGE"
    REFUND = "REFUND"
    MANUAL_ADJUSTMENT = "MANUAL_ADJUSTMENT"
    RESET = "RESET"


class LedgerRef:
    """What a ledger row points at. Mirrors ck_vfl_reference_type."""
    VIRTUAL_ORDER = "VIRTUAL_ORDER"
    PENDING_ORDER = "PENDING_ORDER"
    STRATEGY_POSITION = "STRATEGY_POSITION"
    ACCOUNT = "ACCOUNT"
    MANUAL = "MANUAL"


def post(
    db: Session,
    account: VirtualAccount,
    *,
    txn_type: str,
    amount: Decimal,
    description: str,
    reference_type: Optional[str] = None,
    reference_id: Optional[uuid.UUID] = None,
) -> VirtualFundLedger:
    """
    Apply a signed delta to the account balance and record why.

    `amount` is a signed delta, never a target balance: callers that think in
    absolute terms (discipline_mode_service topping capital up) compute the
    delta themselves, so that the ledger row always reads as a movement.

    Raises InsufficientBalanceError if the delta would take the balance below
    zero, *before* mutating anything. Without this the negative balance would
    instead trip ck_virtual_accounts_balance_non_negative at the router's
    commit — an IntegrityError 500 rather than the 400 every caller already
    handles.

    Post-condition, asserted below:
        row.balance_after == row.balance_before + amount == account.balance
    """
    if amount is None:
        raise ValueError("ledger_service.post() requires an amount")

    amount = Decimal(str(amount)).quantize(_PAISE)

    # A zero post is always a caller bug — it means something believed it moved
    # money and did not. Callers with a legitimately-zero case (releasing an
    # already-released margin) guard visibly at the call site instead.
    if amount == 0:
        raise ValueError(
            f"ledger_service.post() called with a zero amount "
            f"({txn_type}, {description!r}); guard at the call site instead"
        )

    balance_before = Decimal(str(account.balance)).quantize(_PAISE)
    balance_after = balance_before + amount

    if balance_after < 0:
        raise InsufficientBalanceError(
            f"Insufficient balance. Required: ₹{-amount}, Available: ₹{balance_before}"
        )

    row = VirtualFundLedger(
        id=uuid.uuid4(),
        tenant_id=account.tenant_id,
        user_id=account.user_id,
        account_id=account.id,
        transaction_type=txn_type,
        amount=amount,
        balance_before=balance_before,
        balance_after=balance_after,
        reference_type=reference_type,
        reference_id=reference_id,
        description=description,
    )
    db.add(row)

    account.balance = balance_after

    assert row.balance_after == account.balance, "ledger row and account balance diverged"
    return row


# ── Wrappers ──────────────────────────────────────────────────────
# Thin, so that call sites read as the domain action rather than as bookkeeping.

def open_account(
    db: Session, account: VirtualAccount, amount: Decimal,
) -> VirtualFundLedger:
    """
    Opening credit for a newly created account.

    The account must be created with balance = 0 and flushed; this posts the
    opening capital as a real movement so the very first row already satisfies
    `balance == SUM(amount)`. Creating the account at its full balance and then
    posting the same amount again would double it.
    """
    return post(
        db, account,
        txn_type=LedgerTxnType.INITIAL_CREDIT,
        amount=Decimal(str(amount)),
        description="Opening virtual balance",
        reference_type=LedgerRef.ACCOUNT,
        reference_id=account.id,
    )


def block_margin(
    db: Session, account: VirtualAccount, amount: Decimal,
    *, reference_type: str, reference_id: uuid.UUID, description: str,
) -> VirtualFundLedger:
    """Reserve margin for an order or a resting limit. `amount` is positive."""
    return post(
        db, account,
        txn_type=LedgerTxnType.TRADE_DEBIT,
        amount=-Decimal(str(amount)),
        description=description,
        reference_type=reference_type,
        reference_id=reference_id,
    )


def release_margin(
    db: Session, account: VirtualAccount, amount: Decimal,
    *, reference_type: str, reference_id: uuid.UUID, description: str,
    txn_type: str = LedgerTxnType.TRADE_CREDIT,
) -> VirtualFundLedger:
    """
    Return reserved margin. `amount` is positive.

    txn_type is TRADE_CREDIT when a position closes and REFUND when a
    reservation is undone without a trade (cancel / expiry / rejection).
    """
    return post(
        db, account,
        txn_type=txn_type,
        amount=Decimal(str(amount)),
        description=description,
        reference_type=reference_type,
        reference_id=reference_id,
    )


def charge(
    db: Session, account: VirtualAccount, amount: Decimal,
    *, reference_type: str, reference_id: uuid.UUID, description: str,
) -> VirtualFundLedger:
    """Deduct brokerage or fees. `amount` is positive."""
    return post(
        db, account,
        txn_type=LedgerTxnType.CHARGE,
        amount=-Decimal(str(amount)),
        description=description,
        reference_type=reference_type,
        reference_id=reference_id,
    )


def settle_pnl(
    db: Session, account: VirtualAccount, net_pnl: Decimal,
    *, reference_type: str, reference_id: uuid.UUID, description: str,
) -> Optional[VirtualFundLedger]:
    """
    Apply realised P&L. Signed: a profit credits, a loss debits.

    Returns None for an exactly-flat trade, which is legitimate rather than a
    bug, so this is the one wrapper that tolerates zero.
    """
    net_pnl = Decimal(str(net_pnl)).quantize(_PAISE)
    if net_pnl == 0:
        return None
    return post(
        db, account,
        txn_type=(
            LedgerTxnType.TRADE_CREDIT if net_pnl > 0 else LedgerTxnType.TRADE_DEBIT
        ),
        amount=net_pnl,
        description=description,
        reference_type=reference_type,
        reference_id=reference_id,
    )


def adjust(
    db: Session, account: VirtualAccount, delta: Decimal, description: str,
) -> VirtualFundLedger:
    """A deliberate out-of-band correction: capital unlock, manual fix, reset."""
    return post(
        db, account,
        txn_type=LedgerTxnType.MANUAL_ADJUSTMENT,
        amount=Decimal(str(delta)),
        description=description,
        reference_type=LedgerRef.ACCOUNT,
        reference_id=account.id,
    )
