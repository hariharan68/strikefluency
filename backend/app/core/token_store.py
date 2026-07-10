from __future__ import annotations

from datetime import datetime, timezone
from threading import RLock
from typing import Any

_LOCK = RLock()
_STATE: dict[str, Any] = {
    "access_token": "",
    "source": "",
    "updated_at": None,
}


def set_in_memory(access_token: str, source: str = "memory") -> None:
    token = (access_token or "").strip()
    with _LOCK:
        _STATE["access_token"] = token
        _STATE["source"] = source if token else ""
        _STATE["updated_at"] = datetime.now(timezone.utc).isoformat() if token else None


def set_access_token(access_token: str, source: str = "manual") -> None:
    set_in_memory(access_token, source=source)


def clear_access_token() -> None:
    set_in_memory("", source="")


def get_access_token() -> str:
    with _LOCK:
        return _STATE["access_token"]


def get_token_info(include_token: bool = False) -> dict[str, Any]:
    with _LOCK:
        token = _STATE["access_token"]
        info = {
            "has_token": bool(token),
            "token_preview": _mask_token(token),
            "source": _STATE["source"],
            "updated_at": _STATE["updated_at"],
        }
        if include_token:
            info["access_token"] = token
        return info


def _mask_token(token: str) -> str:
    if not token:
        return ""
    if len(token) <= 12:
        return "***"
    return f"{token[:6]}...{token[-6:]}"
