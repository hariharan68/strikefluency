"""Origin validation for cookie-authenticated routes.

Lives in core/ rather than in a router because both app.routers.auth and
app.routers.oauth need it, and importing one router from the other would create
a cycle.
"""

from urllib.parse import urlsplit

from fastapi import HTTPException

from app.config import settings


def _reduce(value: str) -> str:
    """Collapse a URL to a bare, lowercased ``scheme://host[:port]``.

    An ``Origin`` header is already in that form; a ``Referer`` is a full URL.
    Reducing both means the comparison below can be exact equality.
    """
    parts = urlsplit(value.strip())
    if not parts.scheme or not parts.netloc:
        return ""
    return f"{parts.scheme.lower()}://{parts.netloc.lower()}"


def request_origin(request) -> str | None:
    """The request's origin, preferring Origin and falling back to Referer.

    The Referer fallback is safe only because it is reduced to an origin first,
    and because SecurityHeadersMiddleware sets
    ``Referrer-Policy: strict-origin-when-cross-origin`` — so a cross-origin
    Referer is already just the origin anyway.
    """
    raw = request.headers.get("origin") or request.headers.get("referer")
    if not raw:
        return None
    return _reduce(raw) or None


def check_origin(request) -> None:
    """Reject a state-changing cookie-authenticated request from another site.

    Matching is exact set membership, never a prefix test: with ``startswith``,
    ``http://localhost:5173.evil.com`` and ``http://localhost:51739`` both pass
    for a trusted ``http://localhost:5173``.
    """
    origin = request_origin(request)
    trusted = {_reduce(value) for value in settings.trusted_origins}
    trusted.discard("")
    if not origin or origin not in trusted:
        raise HTTPException(status_code=403, detail="Untrusted origin")
