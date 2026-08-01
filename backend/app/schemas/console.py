"""Response models for the read-only Console workspace (Reports / Funds)."""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict


# ── Reports: P&L ──────────────────────────────────────────────────

class ConsolePeriod(BaseModel):
    from_date: date
    to_date: date


class PnlCalendarDay(BaseModel):
    date: date
    net_pnl: Decimal
    trade_count: int


class PnlSummary(BaseModel):
    realized_gross: Decimal        # P&L before costs
    charges: Decimal               # total brokerage + taxes (positive magnitude)
    other_credits_debits: Decimal  # ledger adjustments / refunds / resets (signed)
    net_realized: Decimal          # realized_gross - charges
    unrealized: Decimal            # live mark-to-market on open positions
    trade_count: int
    win_rate: float


class ConsolePnlResponse(BaseModel):
    period: ConsolePeriod
    calendar: list[PnlCalendarDay]
    summary: PnlSummary


# ── Reports: trades table ─────────────────────────────────────────

class TradeRow(BaseModel):
    id: uuid.UUID
    trade_date: date
    instrument: str
    strike_price: Decimal
    option_type: str
    action: str
    quantity: int
    entry_price: Decimal
    exit_price: Optional[Decimal]
    pnl: Optional[Decimal]
    brokerage: Decimal
    net_pnl: Decimal
    setup_tag: str
    status: str
    strategy_id: Optional[uuid.UUID]


class ConsoleTradesResponse(BaseModel):
    rows: list[TradeRow]
    total: int
    page: int
    page_size: int


# ── Funds ─────────────────────────────────────────────────────────

class FundsAccount(BaseModel):
    balance: Decimal
    available_margin: Decimal
    blocked_margin: Decimal
    initial_capital: Decimal
    tier: str


class FundsSummary(BaseModel):
    charges: Decimal        # CHARGE rows (negative)
    trade_credit: Decimal   # TRADE_CREDIT rows (positive)
    trade_debit: Decimal    # TRADE_DEBIT rows (negative)
    refund: Decimal         # REFUND rows (positive)
    adjustment: Decimal     # MANUAL_ADJUSTMENT + RESET (signed)
    net_change: Decimal     # sum of every ledger amount in range


class LedgerRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    seq: int
    created_at: datetime
    transaction_type: str
    amount: Decimal
    balance_after: Decimal
    description: str
    reference_type: Optional[str]


class ConsoleFundsResponse(BaseModel):
    account: FundsAccount
    summary: FundsSummary
    ledger_rows: list[LedgerRow]
    ledger_total: int
    page: int
    page_size: int
