"""
app/routers/options.py
──────────────────────
Option Chain intelligence API.

  GET /options/{instrument}/metrics  → PCR, max pain, OI walls, ATM IV, GEX, ...
  GET /options/{instrument}/chain    → per-leg rows with buildup + greeks

instrument is a name (NIFTY|BANKNIFTY|SENSEX), matching the rest of the app.
Both endpoints are read-only (never persist) and require an authenticated user.
"""

from fastapi import APIRouter, HTTPException

from app.core.instruments import UnknownInstrumentError, get_spec
from app.dependencies import CurrentUser
from app.services import options_service

router = APIRouter(prefix="/options", tags=["Option Chain"])


def _validate(instrument: str) -> str:
    try:
        return get_spec(instrument).symbol
    except UnknownInstrumentError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/{instrument}/metrics")
def option_metrics(instrument: str, current_user: CurrentUser, expiry: str | None = None):
    return options_service.get_metrics(_validate(instrument), expiry)


@router.get("/{instrument}/chain")
def option_chain(instrument: str, current_user: CurrentUser, expiry: str | None = None):
    return options_service.get_chain(_validate(instrument), expiry)
