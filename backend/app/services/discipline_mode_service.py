"""
app/services/discipline_mode_service.py
───────────────────────────────────────
The master Discipline Mode switch.

ON (default)  → the 7 discipline rules gate every order (see discipline_engine).
OFF           → free-play sandbox: rules are bypassed in the execution paths,
                full sandbox capital is unlocked, and trades are flagged
                was_free_play so they never affect the discipline score/streak.

Turning OFF tops the balance up to the full sandbox capital NON-DESTRUCTIVELY
(it never reduces an already-larger balance) and moves the account to TIER_3.
Turning back ON simply re-enables the rules — the money is kept (no claw-back).

Follows app conventions: plain module functions, the router owns db.commit().
"""

from __future__ import annotations

import logging
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.constants import FULL_SANDBOX_CAPITAL, Tier
from app.core.exceptions import OrderNotFoundError
from app.models.strategy import StrategyPosition
from app.models.user import User
from app.models.virtual_account import VirtualAccount
from app.models.virtual_position import VirtualPosition

logger = logging.getLogger(__name__)


def _account(db: Session, user: User) -> VirtualAccount:
    account = db.query(VirtualAccount).filter(
        VirtualAccount.user_id == user.id
    ).first()
    if account is None:
        raise OrderNotFoundError("Virtual account not found for user.")
    return account


def _blocked_margin(db: Session, user: User) -> Decimal:
    """Total margin currently blocked across open single positions + strategies."""
    single = db.query(VirtualPosition).filter(
        VirtualPosition.user_id == user.id,
        VirtualPosition.is_open == True,
    ).all()
    strat = db.query(StrategyPosition).filter(
        StrategyPosition.user_id == user.id,
        StrategyPosition.is_open == True,
    ).all()
    total = sum((p.margin_blocked for p in single), Decimal("0")) \
        + sum((p.margin_blocked for p in strat), Decimal("0"))
    return Decimal(str(total))


def get_mode(db: Session, user: User) -> dict:
    account = _account(db, user)
    return {
        "enabled":          account.discipline_mode_enabled,
        "capital_unlocked": account.capital_unlocked,
        "tier":             account.tier,
        "balance":          account.balance,
    }


def set_mode(db: Session, user: User, enabled: bool) -> dict:
    """
    Flip the master switch. Router owns the commit.

    OFF → unlock full capital: balance is topped up to (FULL_SANDBOX_CAPITAL −
          currently-blocked margin) but never lowered, tier → TIER_3.
    ON  → re-enable rules only; balance/tier are left untouched.
    """
    account = _account(db, user)
    account.discipline_mode_enabled = enabled

    if not enabled:
        blocked = _blocked_margin(db, user)
        target = Decimal(str(FULL_SANDBOX_CAPITAL)) - blocked
        if target > account.balance:
            account.balance = target
        account.tier = Tier.TIER_3
        account.capital_unlocked = True
        logger.info(
            "Discipline Mode OFF for user %s — capital unlocked, balance ₹%s",
            user.id, account.balance,
        )
    else:
        logger.info("Discipline Mode ON for user %s — rules re-enabled", user.id)

    return get_mode(db, user)
