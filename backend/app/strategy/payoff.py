"""
app/strategy/payoff.py
──────────────────────
Payoff at expiry for a Strategy.

Pure maths — no DB, no network, floats only (see app/strategy/__init__.py).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from app.core.constants import LegInstrumentType
from app.strategy.domain import Leg, OptionContract, Strategy


@dataclass
class PayoffResult:
    prices: list[float]          # x-axis for the chart
    pnls: list[float]            # y-axis for the chart
    max_profit: Optional[float]  # None means unlimited
    max_loss: Optional[float]    # None means unlimited
    breakevens: list[float]
    net_premium: Optional[float]

    @property
    def is_profit_unlimited(self) -> bool:
        return self.max_profit is None

    @property
    def is_loss_unlimited(self) -> bool:
        return self.max_loss is None


def value_at_expiry(contract: OptionContract, spot: float) -> float:
    """What one contract is worth if the market ends at `spot`."""
    t = contract.instrument_type
    if t == LegInstrumentType.CE:
        return max(spot - contract.strike, 0.0)
    if t == LegInstrumentType.PE:
        return max(contract.strike - spot, 0.0)
    if t == LegInstrumentType.FUT:
        return spot
    raise ValueError(f"Cannot value unknown instrument_type {t!r}")


def leg_pnl_at(leg: Leg, spot: float) -> float:
    """P&L of one leg if the market ends at `spot`."""
    if leg.entry_price is None:
        raise ValueError(f"Leg {leg.label()} has no entry price; cannot compute payoff")
    value = value_at_expiry(leg.contract, spot)
    return leg.sign * (value - leg.entry_price) * leg.quantity


def strategy_pnl_at(strategy: Strategy, spot: float) -> float:
    """P&L of the whole strategy if the market ends at `spot`."""
    return sum(leg_pnl_at(leg, spot) for leg in strategy.legs)


def find_breakevens(prices: list[float], pnls: list[float]) -> list[float]:
    """
    Prices where P&L crosses zero, found by interpolating between points
    rather than snapping to the nearest one.
    """
    found: list[float] = []
    for i in range(len(prices) - 1):
        x0, x1 = prices[i], prices[i + 1]
        y0, y1 = pnls[i], pnls[i + 1]
        if y0 == 0.0:
            found.append(x0)
        elif y0 * y1 < 0:
            found.append(x0 + (x1 - x0) * (-y0 / (y1 - y0)))
    if pnls and pnls[-1] == 0.0:
        found.append(prices[-1])

    unique: list[float] = []
    for x in found:
        if not any(abs(x - seen) < 0.01 for seen in unique):
            unique.append(round(x, 2))
    return unique


def _strikes(strategy: Strategy) -> list[float]:
    return sorted({
        float(leg.contract.strike)
        for leg in strategy.legs
        if leg.contract.strike is not None
    })


def _analysis_prices(strategy: Strategy, spot: float) -> list[float]:
    """
    The only prices that matter for exact max/min: zero, every strike,
    and one point past the highest strike.
    """
    strikes = _strikes(strategy)
    if strikes:
        far = strikes[-1] + max(2000.0, strikes[-1] * 0.10)
    else:
        far = spot * 2.0
    return sorted({0.0, *strikes, far})


def _display_prices(strategy: Strategy, spot: float,
                    range_pct: float, points: int) -> list[float]:
    """An evenly spaced grid for charting, with every strike forced in."""
    lo, hi = spot * (1 - range_pct), spot * (1 + range_pct)
    step = (hi - lo) / (points - 1)
    grid = {lo + i * step for i in range(points)}
    for k in _strikes(strategy):
        if lo <= k <= hi:
            grid.add(k)
    return sorted(grid)


def _right_tail_slope(strategy: Strategy, far: float) -> float:
    """P&L change per point above the highest strike. Sign tells us if it runs away."""
    return strategy_pnl_at(strategy, far + 1.0) - strategy_pnl_at(strategy, far)


def payoff_curve(strategy: Strategy, spot: float,
                 range_pct: float = 0.10, points: int = 121) -> PayoffResult:
    if not strategy.legs:
        raise ValueError("Cannot compute payoff for a strategy with no legs")

    analysis = _analysis_prices(strategy, spot)
    analysis_pnls = [strategy_pnl_at(strategy, p) for p in analysis]

    breakevens = find_breakevens(analysis, analysis_pnls)

    slope = _right_tail_slope(strategy, analysis[-1])
    max_profit = None if slope > 1e-9 else max(analysis_pnls)
    max_loss = None if slope < -1e-9 else min(analysis_pnls)

    prices = _display_prices(strategy, spot, range_pct, points)
    pnls = [strategy_pnl_at(strategy, p) for p in prices]

    return PayoffResult(
        prices=prices,
        pnls=pnls,
        max_profit=max_profit,
        max_loss=max_loss,
        breakevens=breakevens,
        net_premium=strategy.net_premium,
    )