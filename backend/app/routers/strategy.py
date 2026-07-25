"""
app/routers/strategy.py
───────────────────────
Strategy Builder API. Thin routers over the service layer; every endpoint is
authenticated with CurrentUser (required by the security kernel), sync def, and
owns its db.commit() (services never commit).

  GET    /strategy/templates              list ready-made templates
  POST   /strategy/from-template          build a draft from a template
  POST   /strategy/draft                  create an empty draft
  GET    /strategy                        list my strategies
  GET    /strategy/{id}                   strategy detail (with legs)
  POST   /strategy/{id}/legs              add a leg to a draft
  DELETE /strategy/{id}/legs/{leg_id}     remove a leg from a draft
  PATCH  /strategy/{id}/setup-tag         set the setup tag
  DELETE /strategy/{id}                   delete a draft
  GET    /strategy/{id}/analytics         payoff + greeks + margin
  POST   /strategy/{id}/execute           execute (fill, block margin, open)
  POST   /strategy/{id}/legs/{leg_id}/close   partial exit of one leg
  POST   /strategy/{id}/square-off        close all legs
  POST   /strategy/{id}/mark-to-market    recompute unrealized P&L
"""

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import CurrentUser
from app.market.provider_factory import get_market_provider
from app.market.websocket_manager import notify_trading_update
from app.schemas.strategy import (
    AddLegRequest,
    AnalyticsResponse,
    AnalyzeRequest,
    AnalyzeResponse,
    BuilderConfigurationCreate,
    BuilderConfigurationResponse,
    BuilderConfigurationUpdate,
    BuildFromTemplateRequest,
    CreateDraftRequest,
    CloseLegRequest,
    ExecutePreviewRequest,
    ExecuteResponse,
    LegResponse,
    MarkToMarketResponse,
    PositionResponse,
    SetSetupTagRequest,
    SquareOffRequest,
    StrategyListResponse,
    StrategyResponse,
    SimulateStrategyRequest,
    TemplateResponse,
)
from app.services import strategy_service as svc
from app.services import strategy_execution_service as ex
from app.services import strategy_workspace_service as workspace
from app.strategy import templates

router = APIRouter(prefix="/strategy", tags=["Strategy Builder"])


# ── helpers ───────────────────────────────────────────────────
def _spot(underlying: str) -> float:
    return float(get_market_provider().get_spot_price(underlying))


def _expiries(underlying: str, needed: int) -> list[date]:
    raw = get_market_provider().get_expiries(underlying)
    out = [date.fromisoformat(e) if isinstance(e, str) else e for e in raw]
    if len(out) < needed:
        raise HTTPException(400, f"Provider offers {len(out)} expiries, need {needed}")
    return out


# ── templates ─────────────────────────────────────────────────
@router.get("/templates/{template_id}/legs")
def expand_template(template_id: str, underlying: str, current_user: CurrentUser,
                    expiry: str | None = None):
    return svc.expand_template(template_id, underlying, expiry)


@router.get("/templates", response_model=list[TemplateResponse])
def list_templates(
    current_user: CurrentUser,
    category: str | None = Query(default=None),
):
    metas = templates.list_templates(category)
    return [
        TemplateResponse(
            id=m.id, name=m.name, category=m.category, description=m.description,
            leg_count=len(m.legs), needs_calendar=m.needs_calendar,
        )
        for m in metas
    ]


# ── live analysis (no persistence) ────────────────────────────
@router.post("/analyze", response_model=AnalyzeResponse)
def analyze(
    body: AnalyzeRequest,
    current_user: CurrentUser,
):
    return AnalyzeResponse.model_validate(
        svc.analyze(body.underlying, body.spot, body.legs)
    )


@router.post("/simulate")
def simulate_strategy(
    body: SimulateStrategyRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Atomic rich analysis for the two-pane Strategy Builder workspace."""
    return workspace.simulate(db, current_user, body)


@router.get("/market-context")
def strategy_market_context(
    current_user: CurrentUser,
    underlying: str = Query(pattern="^(NIFTY|BANKNIFTY|SENSEX)$"),
):
    return workspace.market_context(underlying)


@router.get(
    "/configurations",
    response_model=list[BuilderConfigurationResponse],
)
def list_builder_configurations(
    current_user: CurrentUser,
    kind: str | None = Query(default=None, pattern="^(SAVED|DRAFT)$"),
    db: Session = Depends(get_db),
):
    return [
        BuilderConfigurationResponse.model_validate(row)
        for row in workspace.list_configurations(db, current_user, kind)
    ]


@router.post(
    "/configurations",
    response_model=BuilderConfigurationResponse,
    status_code=201,
)
def create_builder_configuration(
    body: BuilderConfigurationCreate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    try:
        row = workspace.create_configuration(db, current_user, body)
        db.commit()
        db.refresh(row)
        return BuilderConfigurationResponse.model_validate(row)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get(
    "/configurations/{configuration_id}",
    response_model=BuilderConfigurationResponse,
)
def get_builder_configuration(
    configuration_id: uuid.UUID,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    return BuilderConfigurationResponse.model_validate(
        workspace.get_configuration(db, current_user, configuration_id)
    )


@router.patch(
    "/configurations/{configuration_id}",
    response_model=BuilderConfigurationResponse,
)
def update_builder_configuration(
    configuration_id: uuid.UUID,
    body: BuilderConfigurationUpdate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    try:
        row = workspace.update_configuration(
            db, current_user, configuration_id, body
        )
        db.commit()
        db.refresh(row)
        return BuilderConfigurationResponse.model_validate(row)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete(
    "/configurations/{configuration_id}",
    status_code=204,
)
def delete_builder_configuration(
    configuration_id: uuid.UUID,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    workspace.delete_configuration(db, current_user, configuration_id)
    db.commit()
    return Response(status_code=204)


@router.post("/execute-preview", response_model=ExecuteResponse)
def execute_preview(
    body: ExecutePreviewRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    """Create and execute the included editor legs in one transaction."""
    included = [leg for leg in body.legs if leg.included]
    if not included:
        raise HTTPException(status_code=422, detail="Select at least one leg")
    try:
        orm = svc.create_empty_draft(
            db,
            current_user,
            underlying=body.underlying,
            name=body.name,
            allow_calendar=len({leg.expiry for leg in included}) > 1,
            setup_tag=body.setup_tag,
            product_type=body.product_type,
        )
        for leg in included:
            svc.add_leg(
                db,
                current_user,
                orm.id,
                instrument_type=leg.instrument_type,
                action=leg.action,
                lots=leg.lots * body.multiplier,
                expiry=leg.expiry,
                strike=leg.strike,
            )
        position = ex.execute_strategy(db, current_user, orm.id)
        db.commit()
        db.refresh(position)
        notify_trading_update(current_user.id, "strategy_executed")
        strategy = svc.get_strategy(db, current_user, orm.id)
        return ExecuteResponse(
            strategy=StrategyResponse.model_validate(strategy),
            position=PositionResponse.model_validate(position),
            message="Strategy executed.",
        )
    except Exception:
        db.rollback()
        raise


# ── draft creation ────────────────────────────────────────────
@router.post("/from-template", response_model=StrategyResponse, status_code=201)
def build_from_template(
    body: BuildFromTemplateRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    meta = templates.get_template(body.template_id)   # 404s below if unknown
    spot = _spot(body.underlying)
    expiries = body.expiries or _expiries(body.underlying, meta.min_expiries)
    orm = svc.create_from_template(
        db, current_user, template_id=body.template_id, underlying=body.underlying,
        spot=spot, expiries=expiries, lots=body.lots, setup_tag=body.setup_tag,
        product_type=body.product_type,
    )
    db.commit()
    db.refresh(orm)
    return StrategyResponse.model_validate(orm)


@router.post("/draft", response_model=StrategyResponse, status_code=201)
def create_draft(
    body: CreateDraftRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    orm = svc.create_empty_draft(
        db, current_user, underlying=body.underlying, name=body.name,
        allow_calendar=body.allow_calendar, setup_tag=body.setup_tag,
        product_type=body.product_type,
    )
    db.commit()
    db.refresh(orm)
    return StrategyResponse.model_validate(orm)


# ── lookups ───────────────────────────────────────────────────
@router.get("", response_model=StrategyListResponse)
def list_strategies(
    current_user: CurrentUser,
    status: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    offset = (page - 1) * page_size
    rows = svc.list_strategies(db, current_user, status=status, limit=page_size, offset=offset)
    return StrategyListResponse(
        strategies=[StrategyResponse.model_validate(r) for r in rows],
        total=len(rows), page=page, page_size=page_size,
    )


@router.get("/{strategy_id}", response_model=StrategyResponse)
def get_strategy(
    strategy_id: uuid.UUID,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    return StrategyResponse.model_validate(svc.get_strategy(db, current_user, strategy_id))


# ── draft leg editing ─────────────────────────────────────────
@router.post("/{strategy_id}/legs", response_model=StrategyResponse, status_code=201)
def add_leg(
    strategy_id: uuid.UUID,
    body: AddLegRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    svc.add_leg(
        db, current_user, strategy_id, instrument_type=body.instrument_type,
        action=body.action, lots=body.lots, expiry=body.expiry, strike=body.strike,
    )
    db.commit()
    return StrategyResponse.model_validate(svc.get_strategy(db, current_user, strategy_id))


@router.delete("/{strategy_id}/legs/{leg_id}", response_model=StrategyResponse)
def remove_leg(
    strategy_id: uuid.UUID,
    leg_id: uuid.UUID,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    svc.remove_leg(db, current_user, strategy_id, leg_id)
    db.commit()
    return StrategyResponse.model_validate(svc.get_strategy(db, current_user, strategy_id))


@router.patch("/{strategy_id}/setup-tag", response_model=StrategyResponse)
def set_setup_tag(
    strategy_id: uuid.UUID,
    body: SetSetupTagRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    orm = svc.get_strategy(db, current_user, strategy_id)
    orm.setup_tag = body.setup_tag
    db.commit()
    db.refresh(orm)
    return StrategyResponse.model_validate(orm)


@router.delete("/{strategy_id}", status_code=204)
def delete_draft(
    strategy_id: uuid.UUID,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    svc.delete_draft(db, current_user, strategy_id)
    db.commit()


# ── analytics ─────────────────────────────────────────────────
@router.get("/{strategy_id}/analytics", response_model=AnalyticsResponse)
def analytics(
    strategy_id: uuid.UUID,
    current_user: CurrentUser,
    spot: float | None = Query(default=None),
    db: Session = Depends(get_db),
):
    orm = svc.get_strategy(db, current_user, strategy_id)
    spot_val = spot if spot is not None else _spot(orm.underlying)
    return AnalyticsResponse.model_validate(svc.analytics(orm, spot_val))


# ── execution ─────────────────────────────────────────────────
@router.post("/{strategy_id}/execute", response_model=ExecuteResponse)
def execute(
    strategy_id: uuid.UUID,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    position = ex.execute_strategy(db, current_user, strategy_id)
    db.commit()
    db.refresh(position)
    notify_trading_update(current_user.id, "strategy_executed")
    orm = svc.get_strategy(db, current_user, strategy_id)
    return ExecuteResponse(
        strategy=StrategyResponse.model_validate(orm),
        position=PositionResponse.model_validate(position),
        message="Strategy executed.",
    )


@router.post("/{strategy_id}/legs/{leg_id}/close", response_model=LegResponse)
def close_leg(
    strategy_id: uuid.UUID,
    leg_id: uuid.UUID,
    body: CloseLegRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    row = ex.close_leg(db, current_user, strategy_id, leg_id, exit_ltp=body.exit_ltp)
    db.commit()
    db.refresh(row)
    notify_trading_update(current_user.id, "leg_closed")
    return LegResponse.model_validate(row)


@router.post("/{strategy_id}/square-off", response_model=PositionResponse)
def square_off(
    strategy_id: uuid.UUID,
    body: SquareOffRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    position = ex.square_off(db, current_user, strategy_id, reason=body.reason)
    db.commit()
    db.refresh(position)
    notify_trading_update(current_user.id, "strategy_squareoff")
    return PositionResponse.model_validate(position)


@router.post("/{strategy_id}/mark-to-market", response_model=MarkToMarketResponse)
def mark_to_market(
    strategy_id: uuid.UUID,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    updated = ex.mark_to_market(db, current_user, strategy_id)
    db.commit()
    return MarkToMarketResponse(updated=updated, message=f"Updated {updated} position(s).")
