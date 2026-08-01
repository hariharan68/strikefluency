"""Profile workspace: a lifetime account + trade-stats overview.

The single route takes `current_user: CurrentUser`, which satisfies the security
kernel — do not add it to PUBLIC_ROUTES.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import CurrentUser
from app.schemas.auth import UserProfile
from app.schemas.profile import AvatarPresetUpdate, AvatarUpdate, ProfileOverviewResponse
from app.services import profile_service

router = APIRouter(prefix="/profile", tags=["Profile"])


@router.get("/overview", response_model=ProfileOverviewResponse)
def get_overview(current_user: CurrentUser, db: Session = Depends(get_db)):
    """All-time virtual-account balance + trade count + simulated P&L."""
    return profile_service.get_overview(db, current_user)


@router.put("/avatar", response_model=UserProfile)
def set_avatar(data: AvatarUpdate, current_user: CurrentUser, db: Session = Depends(get_db)):
    """Store the (validated) profile photo as a data URI on the user."""
    current_user.avatar_url = data.image
    db.commit()
    db.refresh(current_user)
    return UserProfile.model_validate(current_user)


@router.delete("/avatar", response_model=UserProfile)
def clear_avatar(current_user: CurrentUser, db: Session = Depends(get_db)):
    """Remove the profile photo, reverting to the initials avatar."""
    current_user.avatar_url = None
    db.commit()
    db.refresh(current_user)
    return UserProfile.model_validate(current_user)


@router.put("/avatar-preset", response_model=UserProfile)
def set_avatar_preset(data: AvatarPresetUpdate, current_user: CurrentUser, db: Session = Depends(get_db)):
    """Choose a preset illustration avatar (independent of the uploaded photo)."""
    current_user.avatar_preset = data.preset
    db.commit()
    db.refresh(current_user)
    return UserProfile.model_validate(current_user)


@router.delete("/avatar-preset", response_model=UserProfile)
def clear_avatar_preset(current_user: CurrentUser, db: Session = Depends(get_db)):
    """Clear the chosen preset avatar."""
    current_user.avatar_preset = None
    db.commit()
    db.refresh(current_user)
    return UserProfile.model_validate(current_user)
