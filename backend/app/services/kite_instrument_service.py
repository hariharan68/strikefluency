"""Daily Zerodha instrument catalog sync and contract resolution."""

from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.paper_trading_policy import read_only_broker_client
from app.models.kite_instrument import KiteInstrument

CANONICAL_SPOTS = {
    "NIFTY": ("NSE", "NIFTY 50"),
    "BANKNIFTY": ("NSE", "NIFTY BANK"),
    "SENSEX": ("BSE", "SENSEX"),
}
DERIVATIVE_EXCHANGES = {
    "NIFTY": "NFO",
    "BANKNIFTY": "NFO",
    "SENSEX": "BFO",
}


def _underlying(row: dict[str, Any]) -> str | None:
    name = str(row.get("name") or "").upper().replace(" ", "")
    symbol = str(row.get("tradingsymbol") or "").upper()
    if name in {"NIFTY", "NIFTY50"} or symbol.startswith("NIFTY"):
        return "NIFTY"
    if name in {"BANKNIFTY", "NIFTYBANK"} or symbol.startswith("BANKNIFTY"):
        return "BANKNIFTY"
    if name == "SENSEX" or symbol.startswith("SENSEX"):
        return "SENSEX"
    return None


def normalize_instrument(row: dict[str, Any], synced_at: datetime) -> dict[str, Any]:
    expiry = row.get("expiry")
    if isinstance(expiry, str) and expiry:
        expiry = date.fromisoformat(expiry[:10])
    return {
        "instrument_token": int(row["instrument_token"]),
        "exchange_token": str(row.get("exchange_token") or "") or None,
        "exchange": str(row.get("exchange") or "").upper(),
        "segment": str(row.get("segment") or "").upper(),
        "tradingsymbol": str(row.get("tradingsymbol") or ""),
        "name": str(row.get("name") or "") or None,
        "expiry": expiry or None,
        "strike": Decimal(str(row.get("strike") or 0)),
        "tick_size": Decimal(str(row.get("tick_size") or 0)),
        "lot_size": int(row.get("lot_size") or 1),
        "instrument_type": str(row.get("instrument_type") or "").upper(),
        "underlying": _underlying(row),
        "synced_at": synced_at,
    }


def sync_instruments(db: Session, kite: Any) -> dict[str, Any]:
    """Validate the complete dump before atomically replacing the catalog."""
    from app.market.kite_cache import acquire_rate_slot
    if not acquire_rate_slot("other", 10):
        raise RuntimeError("Kite REST rate limit reached; retry shortly")
    kite = read_only_broker_client(kite, allowed_operations={"instruments"})
    raw_rows = kite.instruments()
    if not isinstance(raw_rows, list) or len(raw_rows) < 10_000:
        raise RuntimeError("Kite instrument sync returned an unexpectedly small catalog")
    exchanges = {str(row.get("exchange") or "").upper() for row in raw_rows}
    required = {"NSE", "NFO", "BSE", "BFO"}
    missing = sorted(required - exchanges)
    if missing:
        raise RuntimeError(f"Kite instrument catalog is missing exchanges: {', '.join(missing)}")

    synced_at = datetime.now(timezone.utc).replace(tzinfo=None)
    rows = [normalize_instrument(row, synced_at) for row in raw_rows]

    # The download and validation happen before this transaction. A failed
    # insert rolls the delete back, preserving the previous valid catalog.
    with db.begin_nested():
        db.execute(delete(KiteInstrument))
        db.bulk_insert_mappings(KiteInstrument, rows)
    db.commit()
    return {
        "synced": len(rows),
        "synced_at": synced_at.replace(tzinfo=timezone.utc).isoformat(),
        "exchanges": sorted(exchanges),
    }


def catalog_status(db: Session) -> dict[str, Any]:
    count, synced_at = db.execute(
        select(func.count(KiteInstrument.instrument_token), func.max(KiteInstrument.synced_at))
    ).one()
    return {
        "instrument_count": int(count or 0),
        "instruments_synced_at": (
            synced_at.replace(tzinfo=timezone.utc).isoformat() if synced_at else None
        ),
    }


def spot_instrument(db: Session, underlying: str) -> KiteInstrument | None:
    exchange, symbol = CANONICAL_SPOTS[underlying.upper()]
    return db.execute(select(KiteInstrument).where(
        KiteInstrument.exchange == exchange,
        KiteInstrument.tradingsymbol == symbol,
    )).scalars().first()


def expiries(
    db: Session, underlying: str, instrument_type: str = "OPT",
) -> list[date]:
    underlying = underlying.upper()
    exchange = DERIVATIVE_EXCHANGES[underlying]
    type_filter = ["CE", "PE"] if instrument_type.upper() == "OPT" else ["FUT"]
    return list(db.execute(
        select(KiteInstrument.expiry)
        .where(
            KiteInstrument.underlying == underlying,
            KiteInstrument.exchange == exchange,
            KiteInstrument.instrument_type.in_(type_filter),
            KiteInstrument.expiry.is_not(None),
            KiteInstrument.expiry >= date.today(),
        )
        .distinct()
        .order_by(KiteInstrument.expiry)
    ).scalars())


def option_contracts(
    db: Session, underlying: str, expiry: date,
) -> list[KiteInstrument]:
    return list(db.execute(
        select(KiteInstrument)
        .where(
            KiteInstrument.underlying == underlying.upper(),
            KiteInstrument.exchange == DERIVATIVE_EXCHANGES[underlying.upper()],
            KiteInstrument.expiry == expiry,
            KiteInstrument.instrument_type.in_(["CE", "PE"]),
        )
        .order_by(KiteInstrument.strike, KiteInstrument.instrument_type)
    ).scalars())


def futures_contracts(
    db: Session, underlying: str, expiry: date | None = None,
) -> list[KiteInstrument]:
    conditions = [
        KiteInstrument.underlying == underlying.upper(),
        KiteInstrument.exchange == DERIVATIVE_EXCHANGES[underlying.upper()],
        KiteInstrument.instrument_type == "FUT",
    ]
    if expiry:
        conditions.append(KiteInstrument.expiry == expiry)
    return list(db.execute(
        select(KiteInstrument).where(*conditions).order_by(KiteInstrument.expiry)
    ).scalars())


def search_instruments(
    db: Session,
    *,
    q: str = "",
    exchange: str | None = None,
    segment: str | None = None,
    instrument_type: str | None = None,
    expiry: date | None = None,
    limit: int = 50,
) -> list[KiteInstrument]:
    stmt = select(KiteInstrument)
    if q:
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(
            KiteInstrument.tradingsymbol.ilike(pattern) | KiteInstrument.name.ilike(pattern)
        )
    if exchange:
        stmt = stmt.where(KiteInstrument.exchange == exchange.upper())
    if segment:
        stmt = stmt.where(KiteInstrument.segment == segment.upper())
    if instrument_type:
        stmt = stmt.where(KiteInstrument.instrument_type == instrument_type.upper())
    if expiry:
        stmt = stmt.where(KiteInstrument.expiry == expiry)
    return list(db.execute(
        stmt.order_by(KiteInstrument.exchange, KiteInstrument.tradingsymbol).limit(min(limit, 200))
    ).scalars())


def instrument_dict(row: KiteInstrument) -> dict[str, Any]:
    return {
        "instrument_token": row.instrument_token,
        "exchange_token": row.exchange_token,
        "exchange": row.exchange,
        "segment": row.segment,
        "tradingsymbol": row.tradingsymbol,
        "name": row.name,
        "expiry": row.expiry.isoformat() if row.expiry else None,
        "strike": float(row.strike or 0),
        "tick_size": float(row.tick_size),
        "lot_size": row.lot_size,
        "instrument_type": row.instrument_type,
        "underlying": row.underlying,
    }
