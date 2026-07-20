"""
app/routers/discipline.py
──────────────────────────
Discipline endpoints:
  GET  /discipline/rules              → user's 7 rules + current values
  PUT  /discipline/rules/{rule_code}  → update a rule value
  GET  /discipline/score              → score, streak, tier progress
  GET  /discipline/violations         → full violation history
  GET  /discipline/violations/today   → today's violations only
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.constants import DisciplineRuleCode, TIER_UNLOCK_STREAK
from app.database import get_db
from app.dependencies import CurrentUser
from app.models.discipline_rule import DisciplineRule
from app.models.discipline_violation import DisciplineViolation
from app.models.virtual_account import VirtualAccount
from app.schemas.discipline import (
    DisciplineModeResponse,
    DisciplineRuleResponse,
    DisciplineScoreResponse,
    SetDisciplineModeRequest,
    UpdateRuleRequest,
    ViolationResponse,
)
from app.services import discipline_mode_service
from datetime import date

router = APIRouter(prefix="/discipline", tags=["Discipline"])


# ── Master mode switch ────────────────────────────────────────

@router.get("/mode", response_model=DisciplineModeResponse)
def get_mode(
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Current Discipline Mode state (on/off, capital unlocked, tier, balance)."""
    return discipline_mode_service.get_mode(db, current_user)


@router.put("/mode", response_model=DisciplineModeResponse)
def set_mode(
    data: SetDisciplineModeRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Flip the master Discipline Mode switch.

    OFF → all 7 rules are bypassed and full sandbox capital (₹10,00,000) is
          unlocked. Trades placed while OFF do not affect the discipline score.
    ON  → rules gate every order again (money is kept, not reset).
    """
    result = discipline_mode_service.set_mode(db, current_user, data.enabled)
    db.commit()
    return result


@router.get("/rules", response_model=list[DisciplineRuleResponse])
def get_rules(
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Get all 7 discipline rules for the current user with their current values."""
    rules = db.query(DisciplineRule).filter(
        DisciplineRule.user_id == current_user.id
    ).all()
    return [DisciplineRuleResponse.model_validate(r) for r in rules]


@router.put("/rules/{rule_code}", response_model=DisciplineRuleResponse)
def update_rule(
    rule_code: str,
    data: UpdateRuleRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Update a discipline rule value.

    Examples:
      MAX_TRADES_PER_DAY  → {"max_trades": 5}
      REVENGE_COOLDOWN    → {"cooldown_minutes": 30}
      MAX_DAILY_LOSS      → {"loss_pct": 3.0}
    """
    rule_code = rule_code.upper()
    if rule_code not in DisciplineRuleCode.ALL:
        raise HTTPException(status_code=400, detail=f"Unknown rule code: {rule_code}")

    rule = db.query(DisciplineRule).filter(
        DisciplineRule.user_id == current_user.id,
        DisciplineRule.rule_code == rule_code,
    ).first()

    if not rule:
        raise HTTPException(status_code=404, detail=f"Rule {rule_code} not found")

    rule.rule_value = data.rule_value
    db.commit()
    db.refresh(rule)
    return DisciplineRuleResponse.model_validate(rule)


@router.get("/score", response_model=DisciplineScoreResponse)
def get_score(
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Get current discipline score, consecutive disciplined trade streak,
    and how many trades until the next capital tier unlocks.
    """
    account = db.query(VirtualAccount).filter(
        VirtualAccount.user_id == current_user.id
    ).first()

    streak = account.consecutive_disciplined_trades
    trades_to_next = max(0, TIER_UNLOCK_STREAK - streak)

    return DisciplineScoreResponse(
        score=account.discipline_score,
        consecutive_disciplined_trades=streak,
        tier=account.tier,
        trades_to_next_tier=trades_to_next,
    )


@router.get("/violations", response_model=list[ViolationResponse])
def get_violations(
    current_user: CurrentUser,
    db: Session = Depends(get_db),
    limit: int = Query(default=50, ge=1, le=200),
):
    """Get violation history, newest first."""
    violations = (
        db.query(DisciplineViolation)
        .filter(DisciplineViolation.user_id == current_user.id)
        .order_by(DisciplineViolation.created_at.desc())
        .limit(limit)
        .all()
    )
    return [ViolationResponse.model_validate(v) for v in violations]


@router.get("/violations/today", response_model=list[ViolationResponse])
def get_today_violations(
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Get today's violations only."""
    violations = (
        db.query(DisciplineViolation)
        .filter(
            DisciplineViolation.user_id == current_user.id,
            DisciplineViolation.session_date == date.today(),
        )
        .order_by(DisciplineViolation.created_at.desc())
        .all()
    )
    return [ViolationResponse.model_validate(v) for v in violations]