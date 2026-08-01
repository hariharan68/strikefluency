"""Read-only queries behind the Console workspace (Reports P&L + Funds ledger).

The P&L numbers here are deliberately the same trade-unit definition the Advanced
Dashboard uses (a standalone order or one complete strategy, brokerage-netted),
so the two surfaces never disagree. The one thing this adds over analytics is an
*arbitrary* date range and a ledger read — neither of which analytics exposes.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from zoneinfo import ZoneInfo

from sqlalchemy import String, cast, func, or_
from sqlalchemy.orm import Session, selectinload

from app.models.strategy import StrategyPosition
from app.models.user import User
from app.models.virtual_account import VirtualAccount
from app.models.virtual_fund_ledger import VirtualFundLedger
from app.models.virtual_order import VirtualOrder
from app.models.virtual_position import VirtualPosition

IST = ZoneInfo("Asia/Kolkata")
ZERO = Decimal("0.00")
MONEY = Decimal("0.01")
MAX_SPAN_DAYS = 366
SUPPORTED_INSTRUMENTS = {"NIFTY", "BANKNIFTY", "SENSEX"}


def _money(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(MONEY, rounding=ROUND_HALF_UP)


def _as_ist_date(value: datetime) -> date:
    # DB timestamps are stored as naive UTC (see analytics_service).
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(IST).date()


def resolve_range(from_date: date | None, to_date: date | None) -> tuple[date, date]:
    """Clamp/normalise the requested window. Defaults to the last 90 IST days."""
    end = to_date or datetime.now(IST).date()
    start = from_date or (end - timedelta(days=89))
    if start > end:
        start, end = end, start
    # Bound the scan so a hand-typed range can't ask for a decade.
    if (end - start).days > MAX_SPAN_DAYS:
        start = end - timedelta(days=MAX_SPAN_DAYS)
    return start, end


def _utc_bounds(start: date, end: date) -> tuple[datetime, datetime]:
    start_utc = datetime.combine(start, time.min, IST).astimezone(timezone.utc).replace(tzinfo=None)
    # Half-open upper bound: everything strictly before the day after `end`.
    end_utc = datetime.combine(end + timedelta(days=1), time.min, IST).astimezone(timezone.utc).replace(tzinfo=None)
    return start_utc, end_utc


def _ledger_in_range(start: date, end: date):
    """Calendar-day filter for ledger rows.

    Order timestamps (`exit_time`) are written by Python as naive UTC, but the
    ledger's `created_at` uses `func.now()`, which stores the DB session's local
    wall clock (Asia/Calcutta in this app). Comparing that against a UTC instant
    shifts the boundary by the IST offset. Matching on the stored value's own
    calendar date sidesteps the mismatch and gives the IST statement day the user
    expects.
    """
    return func.date(VirtualFundLedger.created_at).between(start, end)


@dataclass(frozen=True)
class _Unit:
    day: date
    net_pnl: Decimal
    charges: Decimal


def _load_units(db: Session, user: User, start_utc: datetime, end_utc: datetime, instrument: str | None) -> list[_Unit]:
    """One entry per trader decision: standalone order or complete strategy.

    Mirrors analytics_service._load_trade_units, plus a per-unit `charges` figure
    and an optional instrument filter. `net_pnl` is brokerage-netted; `charges`
    is the stored brokerage so that realized_gross = net_pnl + charges holds.
    """
    order_q = db.query(VirtualOrder).filter(
        VirtualOrder.user_id == user.id,
        VirtualOrder.strategy_id.is_(None),
        VirtualOrder.pnl.is_not(None),
        VirtualOrder.exit_time.is_not(None),
        VirtualOrder.exit_time >= start_utc,
        VirtualOrder.exit_time < end_utc,
    )
    if instrument:
        order_q = order_q.filter(VirtualOrder.instrument == instrument)

    units: list[_Unit] = []
    for order in order_q.all():
        units.append(_Unit(
            day=_as_ist_date(order.exit_time),
            net_pnl=_money(order.pnl) - _money(order.entry_brokerage),
            charges=_money(order.brokerage),
        ))

    strat_q = (
        db.query(StrategyPosition)
        .options(selectinload(StrategyPosition.strategy))
        .filter(
            StrategyPosition.user_id == user.id,
            StrategyPosition.is_open.is_(False),
            StrategyPosition.closed_at.is_not(None),
            StrategyPosition.closed_at >= start_utc,
            StrategyPosition.closed_at < end_utc,
        )
    )
    for position in strat_q.all():
        strategy = position.strategy
        if strategy is None:
            continue
        if instrument and strategy.underlying != instrument:
            continue
        units.append(_Unit(
            day=_as_ist_date(position.closed_at),
            net_pnl=_money(position.realized_pnl) - _money(position.brokerage),
            charges=_money(position.brokerage),
        ))
    return units


def _live_unrealized(db: Session, user: User) -> Decimal:
    single = db.query(func.coalesce(func.sum(VirtualPosition.unrealized_pnl), 0)).filter(
        VirtualPosition.user_id == user.id, VirtualPosition.is_open.is_(True),
    ).scalar()
    strat = db.query(func.coalesce(func.sum(StrategyPosition.unrealized_pnl), 0)).filter(
        StrategyPosition.user_id == user.id, StrategyPosition.is_open.is_(True),
    ).scalar()
    return _money(single) + _money(strat)


def _blocked_margin(db: Session, user: User) -> Decimal:
    single = db.query(func.coalesce(func.sum(VirtualPosition.margin_blocked), 0)).filter(
        VirtualPosition.user_id == user.id, VirtualPosition.is_open.is_(True),
    ).scalar()
    strat = db.query(func.coalesce(func.sum(StrategyPosition.margin_blocked), 0)).filter(
        StrategyPosition.user_id == user.id, StrategyPosition.is_open.is_(True),
    ).scalar()
    return _money(single) + _money(strat)


# ── Reports: P&L ──────────────────────────────────────────────────

def get_pnl(db: Session, user: User, from_date: date | None, to_date: date | None, instrument: str | None) -> dict:
    start, end = resolve_range(from_date, to_date)
    start_utc, end_utc = _utc_bounds(start, end)
    instrument = instrument if instrument in SUPPORTED_INSTRUMENTS else None

    units = _load_units(db, user, start_utc, end_utc, instrument)

    per_day_pnl: dict[date, Decimal] = defaultdict(lambda: ZERO)
    per_day_count: dict[date, int] = defaultdict(int)
    net_realized = ZERO
    charges = ZERO
    winners = 0
    for unit in units:
        per_day_pnl[unit.day] += unit.net_pnl
        per_day_count[unit.day] += 1
        net_realized += unit.net_pnl
        charges += unit.charges
        if unit.net_pnl > 0:
            winners += 1

    calendar = [
        {"date": day, "net_pnl": per_day_pnl[day], "trade_count": per_day_count[day]}
        for day in sorted(per_day_pnl)
    ]

    # Other credits & debits: ledger movements that are neither trade settlement
    # nor P&L — capital unlocks, resets, refunds.
    other = db.query(func.coalesce(func.sum(VirtualFundLedger.amount), 0)).filter(
        VirtualFundLedger.user_id == user.id,
        _ledger_in_range(start, end),
        VirtualFundLedger.transaction_type.in_(("MANUAL_ADJUSTMENT", "REFUND", "RESET")),
    ).scalar()

    total = len(units)
    return {
        "period": {"from_date": start, "to_date": end},
        "calendar": calendar,
        "summary": {
            # gross = net + charges holds by construction, so the three P&L tiles
            # are always mutually consistent for the reader.
            "realized_gross": net_realized + charges,
            "charges": charges,
            "other_credits_debits": _money(other),
            "net_realized": net_realized,
            "unrealized": _live_unrealized(db, user),
            "trade_count": total,
            "win_rate": round((winners / total * 100), 2) if total else 0.0,
        },
    }


# ── Reports: trades table ─────────────────────────────────────────

def get_trades(
    db: Session, user: User, from_date: date | None, to_date: date | None,
    instrument: str | None, search: str | None, page: int, page_size: int,
) -> dict:
    start, end = resolve_range(from_date, to_date)
    start_utc, end_utc = _utc_bounds(start, end)

    query = db.query(VirtualOrder).filter(
        VirtualOrder.user_id == user.id,
        VirtualOrder.pnl.is_not(None),
        VirtualOrder.exit_time.is_not(None),
        VirtualOrder.exit_time >= start_utc,
        VirtualOrder.exit_time < end_utc,
    )
    if instrument in SUPPORTED_INSTRUMENTS:
        query = query.filter(VirtualOrder.instrument == instrument)
    if search:
        term = f"%{search.strip()}%"
        # No single tradingsymbol column — a contract is instrument + strike +
        # type, so match the underlying or the strike text.
        query = query.filter(or_(
            VirtualOrder.instrument.ilike(term),
            cast(VirtualOrder.strike_price, String).ilike(term),
        ))

    total = query.count()
    orders = (
        query.order_by(VirtualOrder.exit_time.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    rows = [{
        "id": order.id,
        "trade_date": order.trading_day,
        "instrument": order.instrument,
        "strike_price": order.strike_price,
        "option_type": order.option_type,
        "action": order.action,
        "quantity": order.quantity,
        "entry_price": order.entry_price,
        "exit_price": order.exit_price,
        "pnl": order.pnl,
        "brokerage": order.brokerage,
        "net_pnl": _money(order.pnl) - _money(order.entry_brokerage),
        "setup_tag": order.setup_tag,
        "status": order.status,
        "strategy_id": order.strategy_id,
    } for order in orders]

    return {"rows": rows, "total": total, "page": page, "page_size": page_size}


# ── Funds ─────────────────────────────────────────────────────────

_TYPE_TO_KEY = {
    "CHARGE": "charges",
    "TRADE_CREDIT": "trade_credit",
    "TRADE_DEBIT": "trade_debit",
    "REFUND": "refund",
}


def get_funds(db: Session, user: User, from_date: date | None, to_date: date | None, page: int, page_size: int) -> dict:
    start, end = resolve_range(from_date, to_date)

    account = db.query(VirtualAccount).filter(VirtualAccount.user_id == user.id).first()
    blocked = _blocked_margin(db, user)
    balance = _money(account.balance) if account else ZERO

    summary = {
        "charges": ZERO, "trade_credit": ZERO, "trade_debit": ZERO,
        "refund": ZERO, "adjustment": ZERO, "net_change": ZERO,
    }
    grouped = db.query(
        VirtualFundLedger.transaction_type, func.sum(VirtualFundLedger.amount),
    ).filter(
        VirtualFundLedger.user_id == user.id,
        _ledger_in_range(start, end),
    ).group_by(VirtualFundLedger.transaction_type).all()
    for txn_type, amount in grouped:
        signed = _money(amount)
        summary["net_change"] += signed
        if txn_type in _TYPE_TO_KEY:
            summary[_TYPE_TO_KEY[txn_type]] += signed
        elif txn_type in ("MANUAL_ADJUSTMENT", "RESET"):
            summary["adjustment"] += signed
        # INITIAL_CREDIT is excluded from the per-type tiles but still counts in
        # net_change, so an account's opening credit shows in the running total.

    ledger_q = db.query(VirtualFundLedger).filter(
        VirtualFundLedger.user_id == user.id,
        _ledger_in_range(start, end),
    )
    ledger_total = ledger_q.count()
    ledger_rows = (
        ledger_q.order_by(VirtualFundLedger.seq.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return {
        "account": {
            "balance": balance,
            "available_margin": balance,   # balance is already net of blocked margin
            "blocked_margin": blocked,
            "initial_capital": _money(account.initial_balance) if account else ZERO,
            "tier": account.tier if account else "TIER_1",
        },
        "summary": summary,
        "ledger_rows": ledger_rows,
        "ledger_total": ledger_total,
        "page": page,
        "page_size": page_size,
    }
