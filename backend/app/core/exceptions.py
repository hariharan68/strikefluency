"""
app/core/exceptions.py
───────────────────────
Custom exceptions for StrikeFluency.

Why custom exceptions?
  FastAPI routes return HTTP responses. But service layer code
  shouldn't know about HTTP — it just raises a domain exception.
  The error_handlers.py file maps these exceptions → HTTP responses.

  This keeps services clean:
    raise InsufficientBalanceError("Balance too low")
  Instead of:
    raise HTTPException(status_code=400, detail="Balance too low")
"""


class StrikeFluencyError(Exception):
    """Base exception for all StrikeFluency errors."""
    pass


# ── Auth errors ───────────────────────────────────────────────

class InvalidCredentialsError(StrikeFluencyError):
    """Wrong email or password."""
    pass


class TokenExpiredError(StrikeFluencyError):
    """JWT token has expired."""
    pass


class TokenInvalidError(StrikeFluencyError):
    """JWT token is malformed or signature invalid."""
    pass


class TokenRevokedError(StrikeFluencyError):
    """Refresh token has been revoked (user logged out)."""
    pass


class UserNotFoundError(StrikeFluencyError):
    """No user found with given ID or email."""
    pass


class UserAlreadyExistsError(StrikeFluencyError):
    """Email already registered in this tenant."""
    pass


# ── Trading errors ────────────────────────────────────────────

class InsufficientBalanceError(StrikeFluencyError):
    """Virtual account balance too low to place this order."""
    pass


class MarketClosedError(StrikeFluencyError):
    """Order attempted outside 09:15–15:30 IST."""
    pass


class OrderNotFoundError(StrikeFluencyError):
    """No order found with given ID for this user."""
    pass


class PositionNotFoundError(StrikeFluencyError):
    """No open position found for this order."""
    pass


class OrderAlreadyClosedError(StrikeFluencyError):
    """Attempted to close an order that is not OPEN."""
    pass


# ── Discipline errors ─────────────────────────────────────────

class DisciplineViolationError(StrikeFluencyError):
    """
    Raised when an order violates a discipline rule.
    Carries the rule_code so the frontend can show a specific message.

    Usage:
        raise DisciplineViolationError(
            rule_code="MAX_TRADES_PER_DAY",
            message="You have already placed 3 trades today.",
        )
    """
    def __init__(self, rule_code: str, message: str):
        self.rule_code = rule_code
        self.message = message
        super().__init__(message)


# ── Tenant errors ─────────────────────────────────────────────

class TenantNotFoundError(StrikeFluencyError):
    """No tenant found with given ID or code."""
    pass