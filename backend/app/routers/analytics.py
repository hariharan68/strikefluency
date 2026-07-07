"""
app/routers/analytics.py
─────────────────────────
Analytics endpoints:
  GET /analytics/summary           → overall trading stats
  GET /analytics/discipline-trend  → score per day (30 days)
  GET /analytics/pnl-curve         → cumulative P&L per trade
  GET /analytics/mistakes          → mistake category breakdown
"""

from collections import Counter
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import CurrentUser
from app.models.discipline_score import DisciplineScore
from app.models.discipline_violation import DisciplineViolation
from app.models.journal_entry import JournalEntry
from app.models.virtual_order import VirtualOrder
from app.schemas.analytics import (
    DisciplineTrendPoint,
    MistakeBreakdownItem,
    PnLCurvePoint,
    TradeSummaryResponse,
)

router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.get("/summary", response_model=TradeSummaryResponse)
def get_summary(
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Overall trading statistics — all time."""
    orders = db.query(VirtualOrder).filter(
        VirtualOrder.user_id == current_user.id,
        VirtualOrder.status != "OPEN",
    ).all()

    if not orders:
        return TradeSummaryResponse(
            total_trades=0, winning_trades=0, losing_trades=0,
            win_rate=0.0, total_pnl=Decimal("0"), avg_pnl=Decimal("0"),
            best_trade=Decimal("0"), worst_trade=Decimal("0"),
            total_brokerage=Decimal("0"), most_used_setup=None,
            most_violated_rule=None,
        )

    trades_with_pnl = [o for o in orders if o.pnl is not None]
    winning  = [o for o in trades_with_pnl if o.pnl > 0]
    losing   = [o for o in trades_with_pnl if o.pnl <= 0]
    win_rate = round(len(winning) / len(trades_with_pnl) * 100, 1) if trades_with_pnl else 0.0

    pnl_values  = [o.pnl for o in trades_with_pnl]
    total_pnl   = sum(pnl_values) if pnl_values else Decimal("0")
    avg_pnl     = total_pnl / len(pnl_values) if pnl_values else Decimal("0")
    best_trade  = max(pnl_values) if pnl_values else Decimal("0")
    worst_trade = min(pnl_values) if pnl_values else Decimal("0")
    total_brokerage = sum(o.brokerage for o in orders)

    # Most used setup tag
    setup_counter = Counter(o.setup_tag for o in orders if o.setup_tag)
    most_used_setup = setup_counter.most_common(1)[0][0] if setup_counter else None

    # Most violated rule
    violations = db.query(DisciplineViolation).filter(
        DisciplineViolation.user_id == current_user.id
    ).all()
    rule_counter = Counter(v.rule_code for v in violations)
    most_violated_rule = rule_counter.most_common(1)[0][0] if rule_counter else None

    return TradeSummaryResponse(
        total_trades=len(orders),
        winning_trades=len(winning),
        losing_trades=len(losing),
        win_rate=win_rate,
        total_pnl=total_pnl.quantize(Decimal("0.01")),
        avg_pnl=avg_pnl.quantize(Decimal("0.01")),
        best_trade=best_trade.quantize(Decimal("0.01")),
        worst_trade=worst_trade.quantize(Decimal("0.01")),
        total_brokerage=total_brokerage.quantize(Decimal("0.01")),
        most_used_setup=most_used_setup,
        most_violated_rule=most_violated_rule,
    )


@router.get("/discipline-trend", response_model=list[DisciplineTrendPoint])
def get_discipline_trend(
    current_user: CurrentUser,
    db: Session = Depends(get_db),
    days: int = Query(default=30, ge=7, le=90),
):
    """
    Discipline score per day for the last N days.
    Used for the score trend chart on the discipline dashboard.
    """
    from datetime import date, timedelta
    cutoff = date.today() - timedelta(days=days)

    scores = (
        db.query(DisciplineScore)
        .filter(
            DisciplineScore.user_id == current_user.id,
            DisciplineScore.score_date >= cutoff,
        )
        .order_by(DisciplineScore.score_date.asc())
        .all()
    )

    return [
        DisciplineTrendPoint(
            score_date=s.score_date,
            score=s.score,
            trades_analyzed=s.trades_analyzed,
        )
        for s in scores
    ]


@router.get("/pnl-curve", response_model=list[PnLCurvePoint])
def get_pnl_curve(
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Cumulative P&L per trade in chronological order.
    Used for the equity curve chart on the analytics page.
    Each point = one closed trade + running total.
    """
    orders = (
        db.query(VirtualOrder)
        .filter(
            VirtualOrder.user_id == current_user.id,
            VirtualOrder.status != "OPEN",
            VirtualOrder.pnl != None,
        )
        .order_by(VirtualOrder.entry_time.asc())
        .all()
    )

    curve      = []
    cumulative = Decimal("0")

    for i, order in enumerate(orders, start=1):
        cumulative += order.pnl
        curve.append(
            PnLCurvePoint(
                trade_number=i,
                trade_date=order.entry_time.date(),
                pnl=order.pnl.quantize(Decimal("0.01")),
                cumulative_pnl=cumulative.quantize(Decimal("0.01")),
                setup_tag=order.setup_tag,
            )
        )

    return curve


@router.get("/mistakes", response_model=list[MistakeBreakdownItem])
def get_mistakes(
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Breakdown of mistake categories from journal entries.
    Used for the mistake chart — shows what the trader does wrong most often.
    Only includes entries where mistake_category was set by the user.
    """
    entries = (
        db.query(JournalEntry)
        .filter(
            JournalEntry.user_id == current_user.id,
            JournalEntry.mistake_category != None,
        )
        .all()
    )

    if not entries:
        return []

    counter = Counter(e.mistake_category for e in entries)
    total   = sum(counter.values())

    return [
        MistakeBreakdownItem(
            category=category,
            count=count,
            percentage=round(count / total * 100, 1),
        )
        for category, count in counter.most_common()
    ]