"""
app/services/brokerage_calculator.py
──────────────────────────────────────
Calculates realistic trading costs for virtual orders.

Fee structure (mirrors Zerodha/Fyers for options):
  Flat brokerage   : ₹20 per order
  STT              : 0.05% of (LTP × lot_size × qty) on SELL side only
  Exchange charges : 0.053% of turnover
  SEBI charges     : ₹10 per crore of turnover
  GST              : 18% on (brokerage + exchange charges)

All values in Decimal — never float for financial calculations.
"""

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP


# Fee constants
FLAT_BROKERAGE     = Decimal("20.00")
STT_RATE           = Decimal("0.0005")    # 0.05%
EXCHANGE_RATE      = Decimal("0.00053")   # 0.053%
SEBI_RATE          = Decimal("10")        # ₹10 per crore
CRORE              = Decimal("10000000")  # 1 crore
GST_RATE           = Decimal("0.18")      # 18%


@dataclass
class BrokerageBreakdown:
    """Full cost breakdown for one order."""
    flat_brokerage:    Decimal
    stt:               Decimal
    exchange_charges:  Decimal
    sebi_charges:      Decimal
    gst:               Decimal
    total:             Decimal

    def __str__(self) -> str:
        return (
            f"Brokerage=₹{self.flat_brokerage} "
            f"STT=₹{self.stt} "
            f"Exchange=₹{self.exchange_charges} "
            f"SEBI=₹{self.sebi_charges} "
            f"GST=₹{self.gst} "
            f"Total=₹{self.total}"
        )


def calculate_brokerage(
    ltp: Decimal,
    quantity: int,
    lot_size: int,
    action: str,
) -> BrokerageBreakdown:
    """
    Calculate total brokerage for one order leg.

    Args:
        ltp      : fill price (post-slippage)
        quantity : number of lots
        lot_size : units per lot (NIFTY=50)
        action   : "BUY" or "SELL"

    Returns BrokerageBreakdown with all fee components.

    Example:
        NIFTY CE, LTP=150, qty=1 lot, lot_size=50, action=BUY
        turnover       = 150 × 1 × 50 = ₹7,500
        flat_brokerage = ₹20
        stt            = 0 (BUY side, no STT on options buy)
        exchange       = 7500 × 0.053% = ₹3.975 → ₹3.98
        sebi           = (7500 / 1cr) × 10 = ₹0.0075 → ₹0.01
        gst            = (20 + 3.98) × 18% = ₹4.32
        total          = 20 + 0 + 3.98 + 0.01 + 4.32 = ₹28.31
    """
    ltp      = Decimal(str(ltp))
    turnover = ltp * Decimal(quantity) * Decimal(lot_size)

    flat_brokerage = FLAT_BROKERAGE

    # STT only on SELL side for options
    stt = Decimal("0")
    if action == "SELL":
        stt = (turnover * STT_RATE).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    exchange_charges = (turnover * EXCHANGE_RATE).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )

    sebi_charges = ((turnover / CRORE) * SEBI_RATE).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )

    # GST on brokerage + exchange charges (not on STT or SEBI)
    gst = ((flat_brokerage + exchange_charges) * GST_RATE).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )

    total = flat_brokerage + stt + exchange_charges + sebi_charges + gst

    return BrokerageBreakdown(
        flat_brokerage=flat_brokerage,
        stt=stt,
        exchange_charges=exchange_charges,
        sebi_charges=sebi_charges,
        gst=gst,
        total=total.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
    )


def calculate_round_trip_brokerage(
    entry_price: Decimal,
    exit_price: Decimal,
    quantity: int,
    lot_size: int,
) -> Decimal:
    """
    Calculate total brokerage for both entry (BUY) and exit (SELL).
    Convenience function for P&L calculation on position close.

    Returns total cost of both legs combined.
    """
    entry_cost = calculate_brokerage(entry_price, quantity, lot_size, "BUY")
    exit_cost  = calculate_brokerage(exit_price,  quantity, lot_size, "SELL")
    return (entry_cost.total + exit_cost.total).quantize(Decimal("0.01"))