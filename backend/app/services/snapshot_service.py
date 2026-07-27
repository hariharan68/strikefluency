"""
app/services/snapshot_service.py
────────────────────────────────
Daily portfolio and per-position marks, captured at the close.

Most of an equity curve can be rebuilt from closed orders. One part cannot: the
unrealised mark on positions still open at the close. A carried NRML position
leaves no trace of what it was worth on each intervening day, because
`virtual_positions.current_ltp` holds only the latest value and the exit price
eventually overwrites it. That history is destroyed rather than merely
inconvenient to compute, which is the reason these tables exist.

Runs after the 15:29 square-off, so intraday positions are already settled and
what remains is genuine carry-forward.

Idempotent by construction: re-running a day updates the existing rows instead
of duplicating, enforced by unique constraints. Snapshots are derived
observations, not an audit trail, so unlike the ledger they are not append-only.

Follows the service conventions: plain module function taking (db, ...), and it
never commits — the scheduler owns the transaction.
"""

import logging
import uuid
from decimal import Decimal
from datetime import date
from typing import Optional

from sqlalchemy.orm import Session

from app.core.constants import PendingOrderStatus
from app.core.utils import current_trading_day
from app.models.pending_order import PendingOrder
from app.models.pnl_snapshot import PnlSnapshot
from app.models.portfolio_snapshot import PortfolioSnapshot
from app.models.strategy import StrategyPosition
from app.models.trading_session import TradingSession
from app.models.virtual_account import VirtualAccount
from app.models.virtual_position import VirtualPosition

logger = logging.getLogger(__name__)

_ZERO = Decimal("0.00")


def _money(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.01"))


def capture_daily_snapshots(db: Session, as_of: Optional[date] = None) -> int:
    """
    Snapshot every account's closing state for `as_of` (default: today's
    trading day). Returns the number of accounts captured.

    The caller owns the transaction.
    """
    snapshot_date = as_of or current_trading_day()
    accounts = db.query(VirtualAccount).all()
    if not accounts:
        return 0

    captured = 0
    for account in accounts:
        try:
            _capture_one(db, account, snapshot_date)
            captured += 1
        except Exception as e:  # noqa: BLE001
            # One bad account must not cost every other user their snapshot.
            # The caller commits once, so a failure here leaves that user
            # without a row rather than poisoning the batch.
            logger.error(
                "Snapshot failed for account %s (user %s): %s",
                account.id, account.user_id, e,
            )

    logger.info("Captured %d portfolio snapshot(s) for %s", captured, snapshot_date)
    return captured


def _capture_one(db: Session, account: VirtualAccount, snapshot_date: date) -> None:
    positions = db.query(VirtualPosition).filter(
        VirtualPosition.user_id == account.user_id,
        VirtualPosition.is_open == True,   # noqa: E712
    ).all()

    strategy_positions = db.query(StrategyPosition).filter(
        StrategyPosition.user_id == account.user_id,
        StrategyPosition.is_open == True,  # noqa: E712
    ).all()

    # Resting limits hold cash too — omitting them would understate equity by
    # exactly the amount the user cannot currently spend.
    pendings = db.query(PendingOrder).filter(
        PendingOrder.user_id == account.user_id,
        PendingOrder.status == PendingOrderStatus.PENDING,
    ).all()

    margin_blocked = (
        sum((_money(p.margin_blocked) for p in positions), _ZERO)
        + sum((_money(p.margin_blocked) for p in strategy_positions), _ZERO)
        + sum((_money(p.margin_blocked) for p in pendings), _ZERO)
    )
    unrealized = (
        sum((_money(p.unrealized_pnl) for p in positions), _ZERO)
        + sum((_money(p.unrealized_pnl) for p in strategy_positions), _ZERO)
    )

    session = db.query(TradingSession).filter(
        TradingSession.user_id == account.user_id,
        TradingSession.session_date == snapshot_date,
    ).first()

    balance = _money(account.balance)
    row = db.query(PortfolioSnapshot).filter(
        PortfolioSnapshot.user_id == account.user_id,
        PortfolioSnapshot.snapshot_date == snapshot_date,
    ).first()

    values = dict(
        tenant_id=account.tenant_id,
        user_id=account.user_id,
        account_id=account.id,
        snapshot_date=snapshot_date,
        balance=balance,
        margin_blocked=margin_blocked,
        unrealized_pnl=unrealized,
        realized_pnl_today=_money(session.realized_pnl) if session else _ZERO,
        # ck_portfolio_snapshots_equity enforces this arithmetic in the DB.
        equity=balance + margin_blocked + unrealized,
        open_positions=len(positions) + len(strategy_positions),
        trades_today=session.trades_count if session else 0,
        tier=account.tier,
        discipline_score=_money(account.discipline_score),
    )

    if row is None:
        db.add(PortfolioSnapshot(id=uuid.uuid4(), **values))
    else:
        for key, value in values.items():
            setattr(row, key, value)

    _capture_positions(db, account, positions, snapshot_date)


def _capture_positions(db: Session, account: VirtualAccount,
                       positions: list, snapshot_date: date) -> None:
    """Per-position marks — the attribution a portfolio total cannot give."""
    existing = {
        row.position_id: row
        for row in db.query(PnlSnapshot).filter(
            PnlSnapshot.user_id == account.user_id,
            PnlSnapshot.snapshot_date == snapshot_date,
        ).all()
    }

    for position in positions:
        values = dict(
            tenant_id=account.tenant_id,
            user_id=account.user_id,
            snapshot_date=snapshot_date,
            position_id=position.id,
            order_id=position.order_id,
            instrument=position.instrument,
            strike_price=_money(position.strike_price),
            option_type=position.option_type,
            quantity=position.quantity,
            avg_entry_price=_money(position.avg_entry_price),
            mark_price=_money(position.current_ltp),
            unrealized_pnl=_money(position.unrealized_pnl),
            margin_blocked=_money(position.margin_blocked),
        )
        row = existing.get(position.id)
        if row is None:
            db.add(PnlSnapshot(id=uuid.uuid4(), **values))
        else:
            for key, value in values.items():
                setattr(row, key, value)
