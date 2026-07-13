"""app/main.py — FastAPI entry point"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.core.error_handlers import register_error_handlers
from app.core.rate_limit import AuthRateLimitMiddleware
from app.core.security_kernel import SecurityHeadersMiddleware, audit_route_security


@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"\n  StrikeFluency API starting")
    print(f"  Environment  : {settings.ENVIRONMENT}")
    print(f"  Market data  : {settings.MARKET_DATA_PROVIDER}")
    print(f"  Access TTL   : {settings.ACCESS_TOKEN_EXPIRE_MINUTES} min")
    print(f"  Cookie secure: {settings.COOKIE_SECURE}")
    print(f"  Route audit  : {app.state.security_audit['authenticated']} authenticated, "
          f"{app.state.security_audit['public']} declared public")
    if settings.is_development:
        print(f"  Docs         : /docs on the active Uvicorn host/port")
    print()

    from app.brokers.connections import load_fyers_token_into_store
    loaded_fyers_token = load_fyers_token_into_store()
    if not loaded_fyers_token:
        from app.services.fyers_auth_service import get_saved_access_token
        get_saved_access_token()

    from app.market.market_scheduler import start_market_scheduler
    start_market_scheduler()
    from app.services.auth_maintenance import start_auth_maintenance
    start_auth_maintenance()

    yield

    from app.market.market_scheduler import stop_market_scheduler
    stop_market_scheduler()
    from app.services.auth_maintenance import stop_auth_maintenance
    stop_auth_maintenance()
    print("\n  StrikeFluency shutting down\n")


app = FastAPI(
    title="StrikeFluency API",
    description="Virtual options trading platform for Indian retail traders.",
    version="1.0.0",
    lifespan=lifespan,
    # API docs are a recon gift in production — development only.
    docs_url="/docs" if settings.is_development else None,
    redoc_url="/redoc" if settings.is_development else None,
    openapi_url="/openapi.json" if settings.is_development else None,
)

register_error_handlers(app)

# Single source of truth for browser origins: settings.TRUSTED_ORIGINS.
# The same list drives CORS here and the Origin check on cookie-authenticated
# endpoints — they can never drift apart.
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.trusted_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(AuthRateLimitMiddleware)
app.add_middleware(SecurityHeadersMiddleware)

# ── All routers ───────────────────────────────────────────────
from app.routers import auth, market, trading, discipline, journal, analytics, broker, oauth

app.include_router(auth.router,        prefix="/api/v1")
app.include_router(market.router,      prefix="/api/v1")
app.include_router(trading.router,     prefix="/api/v1")
app.include_router(discipline.router,  prefix="/api/v1")
app.include_router(journal.router,     prefix="/api/v1")
app.include_router(analytics.router,   prefix="/api/v1")
app.include_router(broker.router,      prefix="/api/v1")

app.include_router(oauth.router, prefix="/api/v1")


@app.get("/health", tags=["system"])
def health_check():
    return {"status": "ok", "environment": settings.ENVIRONMENT}


# ── SECURITY KERNEL: fail-closed boot audit ───────────────────
# Runs at import time, after every router is registered. If any route
# is neither authenticated nor declared public in
# app/core/security_kernel.py, this raises and the process never binds
# a port. Adding a feature without connecting it to the security
# system is therefore impossible — the app won't start.
app.state.security_audit = audit_route_security(app)
