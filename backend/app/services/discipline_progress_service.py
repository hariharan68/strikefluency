"""Read models for the Discipline Control Center progress tab."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.core.constants import TIER_CAPITALS, TIER_UNLOCK_STREAK, Tier
from app.models.discipline_score import DisciplineScore
from app.models.discipline_violation import DisciplineViolation
from app.models.user import User
from app.models.virtual_account import VirtualAccount
from app.models.virtual_order import VirtualOrder


def _performance(db: Session, user_id, free_play: bool) -> dict:
    """Aggregate closed-order performance without loading unbounded order rows."""
    totals = (
        db.query(
            func.count(VirtualOrder.id),
            func.sum(case((VirtualOrder.pnl > 0, 1), else_=0)),
            func.avg(case((VirtualOrder.pnl < 0, VirtualOrder.pnl), else_=None)),
            func.coalesce(func.sum(VirtualOrder.pnl), 0),
            func.sum(case((VirtualOrder.is_discipline_compliant == True, 1), else_=0)),
        )
        .filter(
            VirtualOrder.user_id == user_id,
            VirtualOrder.status != "OPEN",
            VirtualOrder.pnl.isnot(None),
            VirtualOrder.was_free_play == free_play,
        )
        .one()
    )
    total = int(totals[0] or 0)
    winners = int(totals[1] or 0)
    compliant = int(totals[4] or 0)
    return {
        "total_trades": total,
        "win_rate": round(winners / total * 100, 1) if total else 0.0,
        "average_loss": totals[2],
        "total_pnl": Decimal(str(totals[3] or 0)),
        "compliance_rate": (
            round(compliant / total * 100, 1)
            if total and not free_play
            else None
        ),
    }


def get_progress(db: Session, user: User) -> dict:
    account = (
        db.query(VirtualAccount)
        .filter(VirtualAccount.user_id == user.id)
        .first()
    )

    recent_scores = (
        db.query(DisciplineScore)
        .filter(DisciplineScore.user_id == user.id)
        .order_by(DisciplineScore.score_date.desc())
        .limit(30)
        .all()
    )
    score_history = list(reversed(recent_scores))
    best_streak = (
        db.query(func.max(DisciplineScore.consecutive_disciplined_streak))
        .filter(DisciplineScore.user_id == user.id)
        .scalar()
        or account.consecutive_disciplined_trades
    )
    sessions_tracked = len(score_history)
    disciplined_sessions = sum(
        1
        for point in score_history
        if point.trades_analyzed > 0 and point.violations_count == 0
    )
    week_start = date.today() - timedelta(days=6)
    violations_this_week = (
        db.query(func.count(DisciplineViolation.id))
        .filter(
            DisciplineViolation.user_id == user.id,
            DisciplineViolation.session_date >= week_start,
        )
        .scalar()
        or 0
    )

    tier_order = [Tier.TIER_1, Tier.TIER_2, Tier.TIER_3]
    current_tier = account.tier
    current_index = tier_order.index(current_tier)
    next_tier = tier_order[current_index + 1] if current_index < len(tier_order) - 1 else None
    streak = account.consecutive_disciplined_trades
    tier_progress = {
        "current_tier": current_tier,
        "next_tier": next_tier,
        "current_capital_limit": Decimal(str(TIER_CAPITALS[current_tier])),
        "next_capital_limit": Decimal(str(TIER_CAPITALS[next_tier])) if next_tier else None,
        "progress_pct": (
            min(100.0, round(streak / TIER_UNLOCK_STREAK * 100, 1))
            if next_tier
            else 100.0
        ),
        "streak_required": TIER_UNLOCK_STREAK,
        "streak_remaining": max(0, TIER_UNLOCK_STREAK - streak) if next_tier else 0,
    }

    return {
        "score_history": score_history,
        "best_streak": int(best_streak),
        "sessions_tracked": sessions_tracked,
        "disciplined_sessions": disciplined_sessions,
        "violations_this_week": int(violations_this_week),
        "tier_progress": tier_progress,
        "discipline_on": _performance(db, user.id, free_play=False),
        "discipline_off": _performance(db, user.id, free_play=True),
    }
