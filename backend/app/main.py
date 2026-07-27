"""app/main.py — FastAPI entry point"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.core.error_handlers import register_error_handlers
from app.core.paper_trading_policy import (
    assert_paper_trading_configuration,
    public_capabilities,
)
from app.core.rate_limit import AuthRateLimitMiddleware
from app.core.security_kernel import SecurityHeadersMiddleware, audit_route_security


@asynccontextmanager
async def lifespan(app: FastAPI):
    assert_paper_trading_configuration(settings)
    print(f"\n  StrikeFluency API starting")
    print(f"  Environment  : {settings.ENVIRONMENT}")
    print(f"  Market data  : {settings.MARKET_DATA_PROVIDER}")
    print(f"  Execution    : {settings.EXECUTION_MODE}")
    print(f"  Broker access: {settings.BROKER_ACCESS_MODE}")
    print(f"  Access TTL   : {settings.ACCESS_TOKEN_EXPIRE_MINUTES} min")
    print(f"  Cookie secure: {settings.COOKIE_SECURE}")
    print(f"  Route audit  : {app.state.security_audit['authenticated']} authenticated, "
          f"{app.state.security_audit['public']} declared public")
    if settings.is_development:
        print(f"  Docs         : /docs on the active Uvicorn host/port")
    print()

    # Hydrate only the ACTIVE broker's token into the shared store — the two
    # brokers are mutually exclusive, so we never load both.
    if settings.MARKET_DATA_PROVIDER == "kite":
        from app.brokers.connections import load_kite_token_into_store
        load_kite_token_into_store()
    elif settings.MARKET_DATA_PROVIDER == "nuvama":
        from app.brokers.connections import load_nuvama_token_into_store
        if not load_nuvama_token_into_store():
            from app.services.nuvama_auth_service import get_saved_access_token
            get_saved_access_token()
    else:
        from app.brokers.connections import load_fyers_token_into_store
        if not load_fyers_token_into_store():
            from app.services.fyers_auth_service import get_saved_access_token
            get_saved_access_token()

    from app.market.market_scheduler import start_market_scheduler
    start_market_scheduler()
    from app.services.auth_maintenance import start_auth_maintenance
    start_auth_maintenance()

    yield

    from app.market.market_scheduler import stop_market_scheduler
    stop_market_scheduler()
    from app.market.provider_factory import reset_provider
    reset_provider()
    from app.services.auth_maintenance import stop_auth_maintenance
    stop_auth_maintenance()
    print("\n  StrikeFluency shutting down\n")


app = FastAPI(
    title="StrikeFluency API",
    description="Paper-only options trading and journaling platform with read-only broker market data.",
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
from app.routers import admin, auth, market, trading, discipline, journal, analytics, broker, nuvama, kite, oauth, strategy, options, settings as settings_router

app.include_router(auth.router,        prefix="/api/v1")
app.include_router(market.router,      prefix="/api/v1")
app.include_router(trading.router,     prefix="/api/v1")
app.include_router(discipline.router,  prefix="/api/v1")
app.include_router(journal.router,     prefix="/api/v1")
app.include_router(analytics.router,   prefix="/api/v1")
app.include_router(broker.router,      prefix="/api/v1")
app.include_router(nuvama.router,      prefix="/api/v1")
app.include_router(kite.router,        prefix="/api/v1")
app.include_router(strategy.router,    prefix="/api/v1")
app.include_router(options.router,     prefix="/api/v1")
app.include_router(settings_router.router, prefix="/api/v1")
app.include_router(admin.router,       prefix="/api/v1")

app.include_router(oauth.router, prefix="/api/v1")


@app.get("/health", tags=["system"])
def health_check():
    return {
        "status": "ok",
        "environment": settings.ENVIRONMENT,
        **public_capabilities(),
    }


# ── SECURITY KERNEL: fail-closed boot audit ───────────────────
# Runs at import time, after every router is registered. If any route
# is neither authenticated nor declared public in
# app/core/security_kernel.py, this raises and the process never binds
# a port. Adding a feature without connecting it to the security
# system is therefore impossible — the app won't start.
app.state.security_audit = audit_route_security(app)
assert_paper_trading_configuration(settings)
