"""
app/strategy/greeks.py
──────────────────────
Black-Scholes pricing and greeks for European, cash-settled index options.

Pure maths — no DB, no network, floats only.

Greeks are computed here rather than read from the market provider: Fyers
supplies only delta+IV, and the mock provider's delta is random.uniform() —
i.e. noise. Nothing downstream should trust a provider greek.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date
from statistics import NormalDist
from typing import Optional

from app.core.constants import LegInstrumentType
from app.strategy.domain import Leg, OptionContract, Strategy

_N = NormalDist()

# Configurable model constants. Not truth — override per call if needed.
RISK_FREE_RATE = 0.065      # VERIFY — annualised, decimal (0.065 = 6.5%)
DIVIDEND_YIELD = 0.0        # index options: 0 is the standard simplification
DAYS_IN_YEAR = 365.0


@dataclass
class Greeks:
    """
    Conventions (these matter — greeks are meaningless without them):
      delta  per 1 point move in the underlying
      gamma  change in delta per 1 point move
      theta  per CALENDAR DAY, in rupees (negative = decay against you)
      vega   per 1% change in IV, in rupees
      price  theoretical Black-Scholes value
    """
    price: float = 0.0
    delta: float = 0.0
    gamma: float = 0.0
    theta: float = 0.0
    vega: float = 0.0

    def __add__(self, other: "Greeks") -> "Greeks":
        return Greeks(
            price=self.price + other.price,
            delta=self.delta + other.delta,
            gamma=self.gamma + other.gamma,
            theta=self.theta + other.theta,
            vega=self.vega + other.vega,
        )

    def scaled(self, factor: float) -> "Greeks":
        return Greeks(
            price=self.price * factor,
            delta=self.delta * factor,
            gamma=self.gamma * factor,
            theta=self.theta * factor,
            vega=self.vega * factor,
        )


def years_to_expiry(expiry: date, as_of: Optional[date] = None) -> float:
    days = (expiry - (as_of or date.today())).days
    return max(days, 0) / DAYS_IN_YEAR


def _at_expiry_greeks(spot: float, strike: float, option_type: str) -> Greeks:
    """T=0: no time value left, so Black-Scholes divides by zero. Use intrinsic."""
    if option_type == LegInstrumentType.CE:
        return Greeks(price=max(spot - strike, 0.0),
                      delta=1.0 if spot > strike else 0.0)
    return Greeks(price=max(strike - spot, 0.0),
                  delta=-1.0 if spot < strike else 0.0)


def black_scholes(spot: float, strike: float, t_years: float, iv: float,
                  option_type: str, rate: float = RISK_FREE_RATE,
                  dividend: float = DIVIDEND_YIELD) -> Greeks:
    if option_type not in LegInstrumentType.OPTIONS:
        raise ValueError(f"black_scholes needs CE or PE, got {option_type!r}")
    if spot <= 0 or strike <= 0:
        raise ValueError(f"spot and strike must be positive (got {spot}, {strike})")
    if t_years <= 0 or iv <= 0:
        return _at_expiry_greeks(spot, strike, option_type)

    sqrt_t = math.sqrt(t_years)
    d1 = (math.log(spot / strike) + (rate - dividend + 0.5 * iv * iv) * t_years) / (iv * sqrt_t)
    d2 = d1 - iv * sqrt_t

    disc_r = math.exp(-rate * t_years)      # discounts the strike
    disc_q = math.exp(-dividend * t_years)  # discounts the spot
    pdf_d1 = _N.pdf(d1)

    # Identical for calls and puts.
    gamma = disc_q * pdf_d1 / (spot * iv * sqrt_t)
    vega = spot * disc_q * pdf_d1 * sqrt_t / 100.0

    if option_type == LegInstrumentType.CE:
        price = spot * disc_q * _N.cdf(d1) - strike * disc_r * _N.cdf(d2)
        delta = disc_q * _N.cdf(d1)
        theta_year = (-spot * disc_q * pdf_d1 * iv / (2 * sqrt_t)
                      - rate * strike * disc_r * _N.cdf(d2)
                      + dividend * spot * disc_q * _N.cdf(d1))
    else:
        price = strike * disc_r * _N.cdf(-d2) - spot * disc_q * _N.cdf(-d1)
        delta = disc_q * (_N.cdf(d1) - 1.0)
        theta_year = (-spot * disc_q * pdf_d1 * iv / (2 * sqrt_t)
                      + rate * strike * disc_r * _N.cdf(-d2)
                      - dividend * spot * disc_q * _N.cdf(-d1))

    return Greeks(price=price, delta=delta, gamma=gamma,
                  theta=theta_year / DAYS_IN_YEAR, vega=vega)


def contract_greeks(contract: OptionContract, spot: float,
                    as_of: Optional[date] = None, rate: float = RISK_FREE_RATE,
                    dividend: float = DIVIDEND_YIELD) -> Greeks:
    """Greeks for ONE unit of a contract."""
    if contract.is_future:
        # A future moves 1:1 with spot and has no optionality.
        return Greeks(price=spot, delta=1.0)
    if contract.iv is None or contract.iv <= 0:
        raise ValueError(f"{contract.label()} has no IV; cannot compute greeks")
    return black_scholes(spot, contract.strike,
                         years_to_expiry(contract.expiry, as_of),
                         contract.iv, contract.instrument_type, rate, dividend)


def leg_greeks(leg: Leg, spot: float, as_of: Optional[date] = None,
               rate: float = RISK_FREE_RATE, dividend: float = DIVIDEND_YIELD) -> Greeks:
    """Position greeks: unit greeks × direction × lots × lot_size."""
    unit = contract_greeks(leg.contract, spot, as_of, rate, dividend)
    return unit.scaled(leg.signed_quantity)


def strategy_greeks(strategy: Strategy, spot: float, as_of: Optional[date] = None,
                    rate: float = RISK_FREE_RATE, dividend: float = DIVIDEND_YIELD) -> Greeks:
    """Net greeks across every leg. Safe to call on every tick."""
    total = Greeks()
    for leg in strategy.legs:
        total = total + leg_greeks(leg, spot, as_of, rate, dividend)
    return total


def populate_greeks(contract: OptionContract, spot: float,
                    as_of: Optional[date] = None) -> OptionContract:
    """Fill a contract's greek fields in place. Used by live MTM in Phase 8."""
    g = contract_greeks(contract, spot, as_of)
    contract.delta, contract.gamma = g.delta, g.gamma
    contract.theta, contract.vega = g.theta, g.vega
    return contract