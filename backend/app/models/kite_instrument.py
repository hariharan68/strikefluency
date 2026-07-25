from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import BigInteger, Date, DateTime, Index, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class KiteInstrument(Base):
    """Durable copy of Zerodha's once-daily instrument master."""

    __tablename__ = "kite_instruments"

    instrument_token: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    exchange_token: Mapped[str | None] = mapped_column(String(32), nullable=True)
    exchange: Mapped[str] = mapped_column(String(16), nullable=False)
    segment: Mapped[str] = mapped_column(String(32), nullable=False)
    tradingsymbol: Mapped[str] = mapped_column(String(128), nullable=False)
    name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    expiry: Mapped[date | None] = mapped_column(Date, nullable=True)
    strike: Mapped[Decimal | None] = mapped_column(Numeric(16, 4), nullable=True)
    tick_size: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    lot_size: Mapped[int] = mapped_column(Integer, nullable=False)
    instrument_type: Mapped[str] = mapped_column(String(16), nullable=False)
    underlying: Mapped[str | None] = mapped_column(String(32), nullable=True)
    synced_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    __table_args__ = (
        Index("idx_kite_exchange_symbol", "exchange", "tradingsymbol"),
        Index(
            "idx_kite_underlying_expiry_type_strike",
            "underlying", "expiry", "instrument_type", "strike",
        ),
        Index("idx_kite_segment_type", "segment", "instrument_type"),
        Index("idx_kite_expiry", "expiry"),
    )
