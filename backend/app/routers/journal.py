"""
app/routers/journal.py
───────────────────────
Journal endpoints:
  GET  /journal              → paginated trade journal
  GET  /journal/{entry_id}   → single entry detail
  PUT  /journal/{entry_id}   → add emotion tag, notes, review
"""

import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import CurrentUser
from app.models.journal_entry import JournalEntry
from app.schemas.journal import (
    JournalEntryResponse,
    JournalListResponse,
    UpdateJournalRequest,
)
from datetime import datetime

router = APIRouter(prefix="/journal", tags=["Journal"])


@router.get("", response_model=JournalListResponse)
def get_journal(
    current_user: CurrentUser,
    db: Session = Depends(get_db),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    setup_tag: str = Query(default=None),
    is_reviewed: bool = Query(default=None),
    is_compliant: bool = Query(default=None),
):
    """
    List all journal entries, newest first.
    Filter by setup_tag, is_reviewed, is_discipline_compliant.
    Returns win rate and average P&L in the response.
    """
    query = db.query(JournalEntry).filter(
        JournalEntry.user_id == current_user.id
    )

    if setup_tag:
        query = query.filter(JournalEntry.setup_tag == setup_tag.upper())
    if is_reviewed is not None:
        query = query.filter(JournalEntry.is_reviewed == is_reviewed)
    if is_compliant is not None:
        query = query.filter(JournalEntry.is_discipline_compliant == is_compliant)

    total   = query.count()
    entries = (
        query.order_by(JournalEntry.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    # Calculate win rate + avg P&L from all filtered entries
    all_entries  = query.all()
    trades_with_pnl = [e for e in all_entries if e.pnl is not None]
    winning      = [e for e in trades_with_pnl if e.pnl > 0]
    win_rate     = round(len(winning) / len(trades_with_pnl) * 100, 1) if trades_with_pnl else 0.0
    avg_pnl      = (
        sum(e.pnl for e in trades_with_pnl) / len(trades_with_pnl)
        if trades_with_pnl else Decimal("0")
    )

    return JournalListResponse(
        entries=[JournalEntryResponse.model_validate(e) for e in entries],
        total=total,
        page=page,
        page_size=page_size,
        win_rate=win_rate,
        avg_pnl=avg_pnl,
    )


@router.get("/{entry_id}", response_model=JournalEntryResponse)
def get_entry(
    entry_id: uuid.UUID,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Get a single journal entry by ID."""
    entry = db.query(JournalEntry).filter(
        JournalEntry.id == entry_id,
        JournalEntry.user_id == current_user.id,
    ).first()

    if not entry:
        raise HTTPException(status_code=404, detail="Journal entry not found")

    return JournalEntryResponse.model_validate(entry)


@router.put("/{entry_id}", response_model=JournalEntryResponse)
def update_entry(
    entry_id: uuid.UUID,
    data: UpdateJournalRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """
    Add emotion tag, mistake category, pre/post trade notes to a journal entry.
    Only user-editable fields are updated — auto-populated fields are never changed.

    Emotion tags:     CONFIDENT | FEARFUL | GREEDY | CALM | IMPATIENT | FOMO
    Mistake categories: EARLY_EXIT | SL_TOO_TIGHT | IGNORED_LEVEL | FOMO_ENTRY | OVERSIZE | NONE
    """
    entry = db.query(JournalEntry).filter(
        JournalEntry.id == entry_id,
        JournalEntry.user_id == current_user.id,
    ).first()

    if not entry:
        raise HTTPException(status_code=404, detail="Journal entry not found")

    if data.emotion_tag is not None:
        entry.emotion_tag = data.emotion_tag
    if data.mistake_category is not None:
        entry.mistake_category = data.mistake_category
    if data.pre_trade_thesis is not None:
        entry.pre_trade_thesis = data.pre_trade_thesis
    if data.post_trade_review is not None:
        entry.post_trade_review = data.post_trade_review
    if data.is_reviewed is not None:
        entry.is_reviewed = data.is_reviewed

    entry.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(entry)

    return JournalEntryResponse.model_validate(entry)