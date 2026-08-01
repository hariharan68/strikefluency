"""Schemas for the Profile workspace (overview + avatar upload)."""

import base64
import binascii
import re
from decimal import Decimal

from pydantic import BaseModel, field_validator

# Only raster formats renderable in an <img>. SVG is deliberately excluded — it
# can carry script and has no place as an untrusted upload.
_AVATAR_RE = re.compile(r"^data:image/(png|jpeg|webp);base64,", re.IGNORECASE)
AVATAR_MAX_BYTES = 512 * 1024  # decoded ceiling; the client resizes to ~20–40 KB
# Magic bytes proving the payload really is the raster image it claims to be.
_MAGIC = (
    b"\x89PNG\r\n\x1a\n",   # PNG
    b"\xff\xd8\xff",          # JPEG
)


def _is_webp(raw: bytes) -> bool:
    return len(raw) >= 12 and raw[:4] == b"RIFF" and raw[8:12] == b"WEBP"


class ProfileAccount(BaseModel):
    balance: Decimal
    initial_capital: Decimal
    tier: str


class ProfileStats(BaseModel):
    total_trades: int
    net_realized: Decimal   # all-time realised P&L, brokerage-netted
    unrealized: Decimal     # live mark-to-market on open positions
    win_rate: float


class ProfileOverviewResponse(BaseModel):
    account: ProfileAccount
    stats: ProfileStats


# The 10 preset illustrations live in the frontend; the backend only needs to
# refuse keys outside this known set. Keep in sync with utils/presetAvatars.js.
AVATAR_PRESETS = frozenset(
    [f"men_{i}" for i in range(1, 6)] + [f"women_{i}" for i in range(1, 6)]
)


class AvatarPresetUpdate(BaseModel):
    """Body for PUT /profile/avatar-preset — one of the known preset keys."""
    preset: str

    @field_validator("preset")
    @classmethod
    def known_preset(cls, v: str) -> str:
        v = (v or "").strip().lower()
        if v not in AVATAR_PRESETS:
            raise ValueError("Unknown avatar preset")
        return v


class AvatarUpdate(BaseModel):
    """Body for PUT /profile/avatar — a validated raster-image data URI."""
    image: str

    @field_validator("image")
    @classmethod
    def valid_image_data_uri(cls, v: str) -> str:
        v = (v or "").strip()
        if not _AVATAR_RE.match(v):
            raise ValueError("Avatar must be a PNG, JPEG or WEBP data URI")
        b64 = v.split(",", 1)[1]
        try:
            raw = base64.b64decode(b64, validate=True)
        except (binascii.Error, ValueError):
            raise ValueError("Avatar image is not valid base64")
        if len(raw) > AVATAR_MAX_BYTES:
            raise ValueError("Avatar image is too large")
        if not (raw.startswith(_MAGIC) or _is_webp(raw)):
            raise ValueError("Avatar image is not a valid PNG, JPEG or WEBP")
        return v
