"""Read-only Console workspace: Reports (P&L) and Funds (ledger).

Every route takes `current_user: CurrentUser`, which is what satisfies the
security kernel — do not add these to PUBLIC_ROUTES.
"""

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import CurrentUser
from app.schemas.console import (
    ConsoleFundsResponse, ConsolePnlResponse, ConsoleTradesResponse,
)
from app.services import console_service

router = APIRouter(prefix="/console", tags=["Console"])


@router.get("/pnl", response_model=ConsolePnlResponse)
def get_pnl(
    current_user: CurrentUser,
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    instrument: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """Daily P&L calendar + realised/charges/unrealised summary for a date range."""
    return console_service.get_pnl(db, current_user, from_date, to_date, instrument)


@router.get("/trades", response_model=ConsoleTradesResponse)
def get_trades(
    current_user: CurrentUser,
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    instrument: str | None = Query(default=None),
    search: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Paginated closed-order rows, filterable by date range, instrument, search."""
    return console_service.get_trades(
        db, current_user, from_date, to_date, instrument, search, page, page_size,
    )


@router.get("/funds", response_model=ConsoleFundsResponse)
def get_funds(
    current_user: CurrentUser,
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Account balance/margin + a period ledger statement grouped by type."""
    return console_service.get_funds(db, current_user, from_date, to_date, page, page_size)
