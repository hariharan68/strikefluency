"""
app/services/slippage_engine.py
────────────────────────────────
Simulates realistic order slippage on virtual trades.

Slippage = the difference between the price you see and the
price you actually get filled at. In real markets, your order
moves the price slightly against you.

Rules (from SRS):
  ATM ± 5 strikes (liquid)  : 0.5% – 1.5% of LTP
  Beyond ± 5 strikes (OTM)  : 2.0% – 4.0% of LTP
  Direction: always against the trader
    BUY  → fill price = LTP + slippage  (you pay more)
    SELL → fill price = LTP - slippage  (you receive less)
"""

import random
from decimal import Decimal, ROUND_HALF_UP


# Slippage bands (as percentage of LTP)
LIQUID_SLIPPAGE_MIN = Decimal("0.005")   # 0.5%
LIQUID_SLIPPAGE_MAX = Decimal("0.015")   # 1.5%
ILLIQUID_SLIPPAGE_MIN = Decimal("0.020") # 2.0%
ILLIQUID_SLIPPAGE_MAX = Decimal("0.040") # 4.0%

# Strike distance threshold for liquid vs illiquid
LIQUID_STRIKE_DISTANCE = 5


def calculate_slippage(
    ltp: Decimal,
    strike: int,
    atm_strike: int,
    action: str,
) -> tuple[Decimal, Decimal]:
    """
    Calculate slippage and return (fill_price, slippage_points).

    Args:
        ltp        : Last Traded Price (pre-slippage)
        strike     : option strike price
        atm_strike : current ATM strike (from option chain)
        action     : "BUY" or "SELL"

    Returns:
        (fill_price, slippage_points)
        fill_price      = price trader actually gets filled at
        slippage_points = how many rupees of slippage applied

    Example:
        ltp = 150.00, atm = 22150, strike = 22150 (ATM)
        slippage_pct = random 0.5–1.5% = say 1.0%
        slippage_pts = 150 × 0.01 = 1.50
        BUY fill = 150.00 + 1.50 = 151.50
    """
    ltp = Decimal(str(ltp))

    # Determine if this strike is liquid or illiquid
    strike_distance = abs(strike - atm_strike)
    # Convert distance to number of strikes (assuming 50-point intervals for NIFTY)
    strike_interval = _get_strike_interval(atm_strike)
    strikes_from_atm = strike_distance // strike_interval

    if strikes_from_atm <= LIQUID_STRIKE_DISTANCE:
        # Liquid strike — tight slippage
        slippage_pct = _random_decimal(LIQUID_SLIPPAGE_MIN, LIQUID_SLIPPAGE_MAX)
    else:
        # Illiquid/far OTM — wider slippage
        slippage_pct = _random_decimal(ILLIQUID_SLIPPAGE_MIN, ILLIQUID_SLIPPAGE_MAX)

    slippage_points = (ltp * slippage_pct).quantize(Decimal("0.05"), rounding=ROUND_HALF_UP)

    # Slippage always goes against the trader
    if action == "BUY":
        fill_price = ltp + slippage_points
    else:
        fill_price = ltp - slippage_points
        fill_price = max(Decimal("0.05"), fill_price)  # floor at minimum tick

    return fill_price.quantize(Decimal("0.05"), rounding=ROUND_HALF_UP), slippage_points


def _random_decimal(min_val: Decimal, max_val: Decimal) -> Decimal:
    """Generate a random Decimal between min and max."""
    random_float = random.uniform(float(min_val), float(max_val))
    return Decimal(str(round(random_float, 4)))


def _get_strike_interval(atm_strike: int) -> int:
    """
    Estimate strike interval from ATM strike price.
    NIFTY ≈ 50-point intervals
    BANKNIFTY / SENSEX ≈ 100-point intervals
    """
    if atm_strike < 30000:
        return 50   # NIFTY
    return 100      # BANKNIFTY or SENSEX