"""
app/routers/settings.py
─────────────────────────
Per-user preferences:

  GET /settings  → full settings object (defaults merged with stored overrides)
  PUT /settings  → patch one or more keys, returns the merged result

Both require CurrentUser (Security Kernel contract). Settings are always scoped
to the authenticated user — the client never supplies a user id.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import CurrentUser
from app.models.user_settings import UserSettings
from app.schemas.user_settings import DEFAULTS, SettingsResponse, SettingsUpdate

router = APIRouter(prefix="/settings", tags=["Settings"])


def _get_or_create(db: Session, user) -> UserSettings:
    row = db.query(UserSettings).filter(UserSettings.user_id == user.id).first()
    if not row:
        row = UserSettings(user_id=user.id, tenant_id=user.tenant_id, data={})
        db.add(row)
        db.flush()
    return row


def _merged(row: UserSettings) -> SettingsResponse:
    return SettingsResponse(**{**DEFAULTS, **(row.data or {})})


@router.get("", response_model=SettingsResponse)
def get_settings(current_user: CurrentUser, db: Session = Depends(get_db)):
    row = _get_or_create(db, current_user)
    db.commit()
    return _merged(row)


@router.put("", response_model=SettingsResponse)
def update_settings(
    patch: SettingsUpdate,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
):
    row = _get_or_create(db, current_user)
    updates = patch.model_dump(exclude_none=True)
    # Reassign (not mutate) so SQLAlchemy flags the JSONB column dirty.
    row.data = {**(row.data or {}), **updates}
    db.commit()
    db.refresh(row)
    return _merged(row)
