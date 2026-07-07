"""
app/core/error_handlers.py
───────────────────────────
Maps custom exceptions → HTTP responses.
Registered in main.py so FastAPI catches them automatically.

Every exception from exceptions.py gets a consistent JSON shape:
  {
    "error": "DISCIPLINE_VIOLATION",
    "message": "You have already placed 3 trades today.",
    "rule_code": "MAX_TRADES_PER_DAY"   ← only on discipline errors
  }
"""

from fastapi import Request
from fastapi.responses import JSONResponse

from app.core.exceptions import (
    DisciplineViolationError,
    InsufficientBalanceError,
    InvalidCredentialsError,
    MarketClosedError,
    OrderAlreadyClosedError,
    OrderNotFoundError,
    PositionNotFoundError,
    TenantNotFoundError,
    TokenExpiredError,
    TokenInvalidError,
    TokenRevokedError,
    UserAlreadyExistsError,
    UserNotFoundError,
)


def register_error_handlers(app):
    """
    Call this in main.py during app creation.
    Registers all custom exception → HTTP response mappings.
    """

    @app.exception_handler(InvalidCredentialsError)
    async def invalid_credentials_handler(request: Request, exc: InvalidCredentialsError):
        return JSONResponse(
            status_code=401,
            content={"error": "INVALID_CREDENTIALS", "message": str(exc)},
        )

    @app.exception_handler(TokenExpiredError)
    async def token_expired_handler(request: Request, exc: TokenExpiredError):
        return JSONResponse(
            status_code=401,
            content={"error": "TOKEN_EXPIRED", "message": "Token has expired"},
        )

    @app.exception_handler(TokenInvalidError)
    async def token_invalid_handler(request: Request, exc: TokenInvalidError):
        return JSONResponse(
            status_code=401,
            content={"error": "TOKEN_INVALID", "message": "Token is invalid"},
        )

    @app.exception_handler(TokenRevokedError)
    async def token_revoked_handler(request: Request, exc: TokenRevokedError):
        return JSONResponse(
            status_code=401,
            content={"error": "TOKEN_REVOKED", "message": "Token has been revoked"},
        )

    @app.exception_handler(UserNotFoundError)
    async def user_not_found_handler(request: Request, exc: UserNotFoundError):
        return JSONResponse(
            status_code=404,
            content={"error": "USER_NOT_FOUND", "message": str(exc)},
        )

    @app.exception_handler(UserAlreadyExistsError)
    async def user_exists_handler(request: Request, exc: UserAlreadyExistsError):
        return JSONResponse(
            status_code=409,
            content={"error": "USER_ALREADY_EXISTS", "message": str(exc)},
        )

    @app.exception_handler(InsufficientBalanceError)
    async def insufficient_balance_handler(request: Request, exc: InsufficientBalanceError):
        return JSONResponse(
            status_code=400,
            content={"error": "INSUFFICIENT_BALANCE", "message": str(exc)},
        )

    @app.exception_handler(MarketClosedError)
    async def market_closed_handler(request: Request, exc: MarketClosedError):
        return JSONResponse(
            status_code=400,
            content={"error": "MARKET_CLOSED", "message": str(exc)},
        )

    @app.exception_handler(DisciplineViolationError)
    async def discipline_violation_handler(request: Request, exc: DisciplineViolationError):
        return JSONResponse(
            status_code=400,
            content={
                "error": "DISCIPLINE_VIOLATION",
                "rule_code": exc.rule_code,
                "message": exc.message,
            },
        )

    @app.exception_handler(OrderNotFoundError)
    async def order_not_found_handler(request: Request, exc: OrderNotFoundError):
        return JSONResponse(
            status_code=404,
            content={"error": "ORDER_NOT_FOUND", "message": str(exc)},
        )

    @app.exception_handler(OrderAlreadyClosedError)
    async def order_closed_handler(request: Request, exc: OrderAlreadyClosedError):
        return JSONResponse(
            status_code=400,
            content={"error": "ORDER_ALREADY_CLOSED", "message": str(exc)},
        )

    @app.exception_handler(PositionNotFoundError)
    async def position_not_found_handler(request: Request, exc: PositionNotFoundError):
        return JSONResponse(
            status_code=404,
            content={"error": "POSITION_NOT_FOUND", "message": str(exc)},
        )

    @app.exception_handler(TenantNotFoundError)
    async def tenant_not_found_handler(request: Request, exc: TenantNotFoundError):
        return JSONResponse(
            status_code=404,
            content={"error": "TENANT_NOT_FOUND", "message": str(exc)},
        )