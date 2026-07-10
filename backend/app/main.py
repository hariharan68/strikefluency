"""app/main.py — FastAPI entry point"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.core.error_handlers import register_error_handlers


@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"\n  StrikeFluency API starting")
    print(f"  Environment  : {settings.ENVIRONMENT}")
    print(f"  Market data  : {settings.MARKET_DATA_PROVIDER}")
    print(f"  Docs         : /docs on the active Uvicorn host/port\n")

    from app.brokers.connections import load_fyers_token_into_store
    loaded_fyers_token = load_fyers_token_into_store()
    if not loaded_fyers_token:
        from app.services.fyers_auth_service import get_saved_access_token
        get_saved_access_token()

    from app.market.market_scheduler import start_market_scheduler
    start_market_scheduler()

    yield

    from app.market.market_scheduler import stop_market_scheduler
    stop_market_scheduler()
    print("\n  StrikeFluency shutting down\n")


app = FastAPI(
    title="StrikeFluency API",
    description="Virtual options trading platform for Indian retail traders.",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

register_error_handlers(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:5175", "http://localhost:5176", "http://localhost:3000", "http://127.0.0.1:5173", "http://127.0.0.1:5174", "http://127.0.0.1:5175", "http://127.0.0.1:5176"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── All routers ───────────────────────────────────────────────
from app.routers import auth, market, trading, discipline, journal, analytics, broker

app.include_router(auth.router,        prefix="/api/v1")
app.include_router(market.router,      prefix="/api/v1")
app.include_router(trading.router,     prefix="/api/v1")
app.include_router(discipline.router,  prefix="/api/v1")
app.include_router(journal.router,     prefix="/api/v1")
app.include_router(analytics.router,   prefix="/api/v1")
app.include_router(broker.router,      prefix="/api/v1")

# from app.routers import oauth
# app.include_router(oauth.router, prefix="/api/v1")


@app.get("/health", tags=["system"])
def health_check():
    return {"status": "ok", "environment": settings.ENVIRONMENT}


