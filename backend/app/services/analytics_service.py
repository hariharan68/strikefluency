"""Server-side performance analytics for the Advanced Dashboard."""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session, selectinload

from app.models.discipline_score import DisciplineScore
from app.models.discipline_violation import DisciplineViolation
from app.models.journal_entry import JournalEntry
from app.models.portfolio_snapshot import PortfolioSnapshot
from app.models.strategy import StrategyPosition
from app.models.user import User
from app.models.virtual_account import VirtualAccount
from app.models.virtual_order import VirtualOrder


IST = ZoneInfo("Asia/Kolkata")
ZERO = Decimal("0.00")
MONEY = Decimal("0.01")
WEEKDAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday")


@dataclass(frozen=True)
class TradeUnit:
    """One trader decision: a standalone order or one complete strategy."""

    closed_at: datetime
    opened_at: datetime
    net_pnl: Decimal
    setup_tag: str
    instrument: str
    label: str
    is_strategy: bool


def _money(value: Decimal | int | float | str | None) -> Decimal:
    return Decimal(str(value or 0)).quantize(MONEY, rounding=ROUND_HALF_UP)


def _as_ist(value: datetime) -> datetime:
    # Database timestamps are stored as UTC. PostgreSQL may return them as
    # timezone-naive depending on the driver/column configuration.
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(IST)


def _period_bounds(days: int, now: datetime | None = None) -> tuple[date, date, datetime, datetime]:
    local_now = now.astimezone(IST) if now and now.tzinfo else (now.replace(tzinfo=IST) if now else datetime.now(IST))
    end_date = local_now.date()
    start_date = end_date - timedelta(days=days - 1)
    start_utc = datetime.combine(start_date, time.min, IST).astimezone(timezone.utc).replace(tzinfo=None)
    end_utc = datetime.combine(end_date + timedelta(days=1), time.min, IST).astimezone(timezone.utc).replace(tzinfo=None)
    return start_date, end_date, start_utc, end_utc


def _load_trade_units(
    db: Session,
    user: User,
    start_utc: datetime,
    end_utc: datetime,
) -> list[TradeUnit]:
    standalone = (
        db.query(VirtualOrder)
        .filter(
            VirtualOrder.user_id == user.id,
            VirtualOrder.strategy_id.is_(None),
            VirtualOrder.pnl.is_not(None),
            VirtualOrder.exit_time.is_not(None),
            VirtualOrder.exit_time >= start_utc,
            VirtualOrder.exit_time < end_utc,
        )
        .order_by(VirtualOrder.exit_time.asc())
        .all()
    )

    positions = (
        db.query(StrategyPosition)
        .options(selectinload(StrategyPosition.strategy))
        .filter(
            StrategyPosition.user_id == user.id,
            StrategyPosition.is_open.is_(False),
            StrategyPosition.closed_at.is_not(None),
            StrategyPosition.closed_at >= start_utc,
            StrategyPosition.closed_at < end_utc,
        )
        .order_by(StrategyPosition.closed_at.asc())
        .all()
    )

    units = [
        TradeUnit(
            closed_at=order.exit_time,
            opened_at=order.entry_time,
            # Single-order entry brokerage is debited at entry and therefore is
            # not included in VirtualOrder.pnl. Subtract it for true net results.
            net_pnl=_money(order.pnl) - _money(order.entry_brokerage),
            setup_tag=order.setup_tag or "OTHER",
            instrument=order.instrument,
            label=f"{order.instrument} {order.strike_price} {order.option_type}",
            is_strategy=False,
        )
        for order in standalone
    ]

    for position in positions:
        strategy = position.strategy
        if strategy is None:
            continue
        units.append(
            TradeUnit(
                closed_at=position.closed_at,
                opened_at=position.opened_at,
                # StrategyPosition.realized_pnl includes exit brokerage; the
                # stored position brokerage is the entry leg, netted at close.
                net_pnl=_money(position.realized_pnl) - _money(position.brokerage),
                setup_tag=strategy.setup_tag or "OTHER",
                instrument=strategy.underlying,
                label=strategy.name or strategy.template_id or f"{strategy.underlying} strategy",
                is_strategy=True,
            )
        )

    return sorted(units, key=lambda unit: unit.closed_at)


def _drawdown(values: Iterable[Decimal]) -> tuple[list[Decimal], Decimal]:
    peak = ZERO
    largest = ZERO
    points: list[Decimal] = []
    for value in values:
        value = _money(value)
        peak = max(peak, value)
        current = value - peak
        points.append(_money(current))
        largest = max(largest, abs(current))
    return points, _money(largest)


def _group_performance(units: list[TradeUnit], key_fn) -> list[dict]:
    grouped: dict[str, list[TradeUnit]] = defaultdict(list)
    for unit in units:
        grouped[str(key_fn(unit))].append(unit)

    rows = []
    for label, group in grouped.items():
        total = sum((unit.net_pnl for unit in group), ZERO)
        wins = sum(1 for unit in group if unit.net_pnl > 0)
        rows.append({
            "label": label,
            "trade_count": len(group),
            "winning_trades": wins,
            "win_rate": round(wins / len(group) * 100, 1),
            "net_pnl": _money(total),
            "avg_pnl": _money(total / len(group)),
        })
    return sorted(rows, key=lambda row: (row["net_pnl"], row["trade_count"]), reverse=True)


def _summary(units: list[TradeUnit], initial_balance: Decimal) -> dict:
    wins = [unit for unit in units if unit.net_pnl > 0]
    losses = [unit for unit in units if unit.net_pnl < 0]
    breakeven = [unit for unit in units if unit.net_pnl == 0]
    gross_profit = sum((unit.net_pnl for unit in wins), ZERO)
    gross_loss = abs(sum((unit.net_pnl for unit in losses), ZERO))
    net_pnl = sum((unit.net_pnl for unit in units), ZERO)

    cumulative = ZERO
    cumulative_values = []
    for unit in units:
        cumulative += unit.net_pnl
        cumulative_values.append(cumulative)
    _, max_drawdown = _drawdown(cumulative_values)

    avg_win = gross_profit / len(wins) if wins else ZERO
    avg_loss = gross_loss / len(losses) if losses else ZERO
    durations = [
        max(0.0, (_as_ist(unit.closed_at) - _as_ist(unit.opened_at)).total_seconds() / 60)
        for unit in units
    ]

    return {
        "total_trades": len(units),
        "winning_trades": len(wins),
        "losing_trades": len(losses),
        "breakeven_trades": len(breakeven),
        "net_pnl": _money(net_pnl),
        "gross_profit": _money(gross_profit),
        "gross_loss": _money(gross_loss),
        "win_rate": round(len(wins) / len(units) * 100, 1) if units else 0.0,
        "profit_factor": round(float(gross_profit / gross_loss), 2) if gross_loss else None,
        "expectancy": _money(net_pnl / len(units)) if units else ZERO,
        "avg_win": _money(avg_win),
        "avg_loss": _money(avg_loss),
        "payoff_ratio": round(float(avg_win / avg_loss), 2) if avg_loss else None,
        "best_trade": _money(max((unit.net_pnl for unit in units), default=ZERO)),
        "worst_trade": _money(min((unit.net_pnl for unit in units), default=ZERO)),
        "max_drawdown": max_drawdown,
        "max_drawdown_pct": round(float(max_drawdown / initial_balance * 100), 2) if initial_balance else 0.0,
        "avg_holding_minutes": round(sum(durations) / len(durations), 1) if durations else None,
    }


def _daily_series(
    units: list[TradeUnit],
    scores: list[DisciplineScore],
    violations: list[DisciplineViolation],
) -> list[dict]:
    pnl_by_day: dict[date, Decimal] = defaultdict(lambda: ZERO)
    units_by_day: dict[date, list[TradeUnit]] = defaultdict(list)
    for unit in units:
        day = _as_ist(unit.closed_at).date()
        pnl_by_day[day] += unit.net_pnl
        units_by_day[day].append(unit)

    score_by_day = {row.score_date: float(row.score) for row in scores}
    violation_count = Counter(row.session_date for row in violations)
    dates = sorted(set(pnl_by_day) | set(score_by_day) | set(violation_count))

    cumulative = ZERO
    cumulative_values = []
    provisional = []
    for day in dates:
        day_units = units_by_day.get(day, [])
        daily_pnl = _money(pnl_by_day[day])
        cumulative += daily_pnl
        cumulative_values.append(cumulative)
        provisional.append({
            "date": day,
            "trade_count": len(day_units),
            "winning_trades": sum(1 for unit in day_units if unit.net_pnl > 0),
            "losing_trades": sum(1 for unit in day_units if unit.net_pnl < 0),
            "net_pnl": daily_pnl,
            "cumulative_pnl": _money(cumulative),
            "discipline_score": score_by_day.get(day),
            "violation_count": violation_count[day],
        })

    drawdowns, _ = _drawdown(cumulative_values)
    for row, drawdown in zip(provisional, drawdowns):
        row["drawdown"] = drawdown
    return provisional


def _portfolio_series(
    snapshots: list[PortfolioSnapshot],
    daily: list[dict],
    initial_balance: Decimal,
) -> tuple[str, list[dict]]:
    if len(snapshots) >= 2:
        equities = [_money(row.equity) for row in snapshots]
        drawdowns, _ = _drawdown(equities)
        return "portfolio_snapshots", [
            {
                "date": row.snapshot_date,
                "equity": _money(row.equity),
                "balance": _money(row.balance),
                "unrealized_pnl": _money(row.unrealized_pnl),
                "drawdown": drawdown,
            }
            for row, drawdown in zip(snapshots, drawdowns)
        ]

    return "realized_pnl_fallback", [
        {
            "date": row["date"],
            "equity": _money(initial_balance + row["cumulative_pnl"]),
            "balance": None,
            "unrealized_pnl": None,
            "drawdown": row["drawdown"],
        }
        for row in daily
        if row["trade_count"] > 0
    ]


def get_advanced_analytics(
    db: Session,
    user: User,
    days: int = 30,
    now: datetime | None = None,
) -> dict:
    """Build the complete, user-scoped Advanced Dashboard payload."""

    start_date, end_date, start_utc, end_utc = _period_bounds(days, now)
    account = db.query(VirtualAccount).filter(VirtualAccount.user_id == user.id).first()
    initial_balance = _money(account.initial_balance if account else 0)
    units = _load_trade_units(db, user, start_utc, end_utc)

    scores = (
        db.query(DisciplineScore)
        .filter(
            DisciplineScore.user_id == user.id,
            DisciplineScore.score_date >= start_date,
            DisciplineScore.score_date <= end_date,
        )
        .order_by(DisciplineScore.score_date.asc())
        .all()
    )
    violations = (
        db.query(DisciplineViolation)
        .filter(
            DisciplineViolation.user_id == user.id,
            DisciplineViolation.session_date >= start_date,
            DisciplineViolation.session_date <= end_date,
        )
        .order_by(DisciplineViolation.session_date.asc())
        .all()
    )
    snapshots = (
        db.query(PortfolioSnapshot)
        .filter(
            PortfolioSnapshot.user_id == user.id,
            PortfolioSnapshot.snapshot_date >= start_date,
            PortfolioSnapshot.snapshot_date <= end_date,
        )
        .order_by(PortfolioSnapshot.snapshot_date.asc())
        .all()
    )
    mistakes = (
        db.query(JournalEntry.mistake_category)
        .filter(
            JournalEntry.user_id == user.id,
            JournalEntry.trade_date >= start_date,
            JournalEntry.trade_date <= end_date,
            JournalEntry.mistake_category.is_not(None),
            JournalEntry.mistake_category != "NONE",
        )
        .all()
    )

    summary = _summary(units, initial_balance)
    summary["avg_discipline_score"] = (
        round(sum(float(row.score) for row in scores) / len(scores), 1) if scores else None
    )
    summary["violation_count"] = len(violations)

    daily = _daily_series(units, scores, violations)
    equity_source, portfolio = _portfolio_series(snapshots, daily, initial_balance)
    rule_counts = Counter(row.rule_code for row in violations)
    mistake_counts = Counter(row.mistake_category for row in mistakes if row.mistake_category)

    total_violations = sum(rule_counts.values())
    total_mistakes = sum(mistake_counts.values())
    outcomes = [
        {
            "label": label,
            "count": len(group),
            "net_pnl": _money(sum((unit.net_pnl for unit in group), ZERO)),
        }
        for label, group in (
            ("Winning", [unit for unit in units if unit.net_pnl > 0]),
            ("Losing", [unit for unit in units if unit.net_pnl < 0]),
            ("Breakeven", [unit for unit in units if unit.net_pnl == 0]),
        )
    ]

    weekday_rows = _group_performance(units, lambda unit: _as_ist(unit.closed_at).strftime("%A"))
    weekday_by_label = {row["label"]: row for row in weekday_rows}
    weekday_performance = [
        weekday_by_label.get(day, {
            "label": day,
            "trade_count": 0,
            "winning_trades": 0,
            "win_rate": 0.0,
            "net_pnl": ZERO,
            "avg_pnl": ZERO,
        })
        for day in WEEKDAYS
    ]

    return {
        "period": {
            "days": days,
            "start_date": start_date,
            "end_date": end_date,
            "generated_at": datetime.now(timezone.utc),
            "timezone": "Asia/Kolkata",
        },
        "summary": summary,
        "equity_source": equity_source,
        "daily_series": daily,
        "portfolio_series": portfolio,
        "outcome_breakdown": outcomes,
        "setup_performance": _group_performance(units, lambda unit: unit.setup_tag),
        "instrument_performance": _group_performance(units, lambda unit: unit.instrument),
        "weekday_performance": weekday_performance,
        "rule_breakdown": [
            {
                "key": key,
                "count": count,
                "percentage": round(count / total_violations * 100, 1) if total_violations else 0.0,
            }
            for key, count in rule_counts.most_common()
        ],
        "mistake_breakdown": [
            {
                "key": key,
                "count": count,
                "percentage": round(count / total_mistakes * 100, 1) if total_mistakes else 0.0,
            }
            for key, count in mistake_counts.most_common()
        ],
    }
