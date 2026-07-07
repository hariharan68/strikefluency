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
    print(f"  Docs         : http://localhost:8001/docs\n")

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
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:5175", "http://localhost:5176", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── All routers ───────────────────────────────────────────────
from app.routers import auth, market, trading, discipline, journal, analytics

app.include_router(auth.router,        prefix="/api/v1")
app.include_router(market.router,      prefix="/api/v1")
app.include_router(trading.router,     prefix="/api/v1")
app.include_router(discipline.router,  prefix="/api/v1")
app.include_router(journal.router,     prefix="/api/v1")
app.include_router(analytics.router,   prefix="/api/v1")

# from app.routers import oauth
# app.include_router(oauth.router, prefix="/api/v1")


@app.get("/health", tags=["system"])
def health_check():
    return {"status": "ok", "environment": settings.ENVIRONMENT}