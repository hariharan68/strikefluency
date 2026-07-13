import uuid
from datetime import datetime
from pydantic import BaseModel


class SessionSummary(BaseModel):
    family_id: uuid.UUID
    device_info: str | None
    session_policy: str
    created_at: datetime
    last_used_at: datetime
    expires_at: datetime
    current: bool = False
