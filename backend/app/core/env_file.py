"""Read-modify-write helper for backend/.env.

Preserves comments, blank lines, ordering, and unknown keys. Used by the
broker setup wizard to persist credentials the user enters in the UI so
they survive restarts. Values are never logged.
"""

import os
import re
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2]  # .../backend
DEFAULT_ENV_PATH = BACKEND_DIR / ".env"


def update_env_file(updates: dict[str, str], env_path: Path | None = None) -> Path:
    """Set KEY=value lines in the .env file, replacing existing keys in place.

    - Existing keys keep their position; later duplicates are dropped.
    - Missing keys are appended at the end.
    - Everything else in the file is preserved byte-for-byte.
    """
    path = env_path or DEFAULT_ENV_PATH

    for key, value in updates.items():
        if not re.fullmatch(r"[A-Z][A-Z0-9_]*", key):
            raise ValueError(f"Invalid env key: {key!r}")
        if any(ch in value for ch in ("\r", "\n", "#")):
            raise ValueError(f"Value for {key} contains characters not allowed in .env")

    if path.exists():
        lines = path.read_text(encoding="utf-8").splitlines()
    else:
        lines = ["# Created by StrikeFluency setup wizard"]

    remaining = dict(updates)
    seen: set[str] = set()
    out: list[str] = []
    for line in lines:
        matched_key = None
        for key in list(remaining) + list(seen):
            if re.match(rf"\s*{re.escape(key)}\s*=", line):
                matched_key = key
                break
        if matched_key is None:
            out.append(line)
        elif matched_key in remaining:
            out.append(f"{matched_key}={remaining.pop(matched_key)}")
            seen.add(matched_key)
        # matched_key in seen → duplicate line for an updated key: drop it

    for key, value in remaining.items():
        out.append(f"{key}={value}")

    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text("\n".join(out) + "\n", encoding="utf-8")
    os.replace(tmp, path)
    return path
