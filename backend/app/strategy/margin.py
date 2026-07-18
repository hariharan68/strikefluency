"""
app/strategy/margin.py
──────────────────────
Simplified SPAN-style margin estimator.

Pure maths — no DB, no network, floats only.

⚠️  THIS IS AN ESTIMATE, NOT A BROKER FIGURE.
    Real SPAN margin comes from the exchange's daily margin parameter files and
    scans ~16 price/volatility scenarios per portfolio. We approximate with flat
    percentages of notional. Every constant below is configurable and marked
    `# VERIFY` — calibrate against real broker margins before trusting output.
    Expect to be in the right ballpark, not right to the rupee.

The core idea is hedge recognition. Charging full naked margin on every short
leg would make an iron condor cost ~4x what a broker actually blocks, which
would make the whole Strategy Builder unusable. So each short leg is paired with
a long leg of the same option type, and only the residual risk is charged.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.core.constants import LegInstrumentType
from app.strategy.domain import Leg, Strategy

# ── Configurable model constants ──────────────────────────────
# Percentages of notional (spot × quantity).
SPAN_PCT_OF_NOTIONAL = 0.075        # VERIFY — initial margin on a naked short
EXPOSURE_PCT_OF_NOTIONAL = 0.020    # VERIFY — exposure margin on a naked short
FUTURES_MARGIN_PCT = 0.12           # VERIFY — a futures leg

# A naked short call and a naked short put cannot both finish deep ITM, so SPAN
# charges a strangle far less than the sum of both legs. Approximation: charge
# the larger side in full, plus this fraction of the smaller side.
SHORT_OFFSET_PCT = 0.30             # VERIFY

# Cushion over theoretical worst case, for gap risk.
DEFINED_RISK_BUFFER_PCT = 0.10      # VERIFY


@dataclass
class HedgePair:
    """A short leg and the long leg that caps its risk."""
    short: Leg
    long: Leg
    width: float            # points of unhedged risk between the two strikes
    quantity: int           # contracts actually hedged
    margin: float

    def label(self) -> str:
        return f"{self.short.contract.label()} hedged by {self.long.contract.label()}"


@dataclass
class MarginEstimate:
    total: float
    naked_margin: float = 0.0
    spread_margin: float = 0.0
    futures_margin: float = 0.0
    premium_credit: float = 0.0
    hedged_pairs: list[HedgePair] = field(default_factory=list)
    naked_legs: list[Leg] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    @property
    def is_defined_risk(self) -> bool:
        """True when every short leg is hedged — no naked exposure remains."""
        return not self.naked_legs


def notional(leg: Leg, spot: float) -> float:
    """Contract value: spot × quantity. Index options are cash-settled."""
    return spot * leg.quantity


def naked_leg_margin(leg: Leg, spot: float) -> float:
    """
    Margin for one unhedged short leg: SPAN + exposure, on notional.

    Long legs get 0 — the premium is paid upfront and IS the entire risk, so
    blocking margin on top would double-count it.
    """
    if leg.sign > 0:
        return 0.0
    if leg.contract.is_future:
        return notional(leg, spot) * FUTURES_MARGIN_PCT
    return notional(leg, spot) * (SPAN_PCT_OF_NOTIONAL + EXPOSURE_PCT_OF_NOTIONAL)


def _risk_width(short_strike: float, long_strike: float, option_type: str) -> float:
    """
    Unhedged points between a short and a long of the same type.

    For CALLS, a long ABOVE the short caps the loss at the gap between them, so
    risk = long - short. A long BELOW the short (a bull call spread) fully
    covers it — the long gains at least as fast as the short loses — so risk is
    zero and only the debit already paid is at stake. max(0, ...) expresses
    both, and puts mirror it.
    """
    if option_type == LegInstrumentType.CE:
        return max(0.0, long_strike - short_strike)
    return max(0.0, short_strike - long_strike)


def _expand_to_lots(legs: list[Leg]) -> list[Leg]:
    """
    One entry per lot, so a 2-lot short can be half-hedged by a 1-lot long.

    Pairing whole legs would mis-credit the hedge whenever leg sizes differ —
    and ratio spreads exist precisely to be uneven.
    """
    out: list[Leg] = []
    for leg in legs:
        for _ in range(leg.lots):
            out.append(Leg(
                contract=leg.contract, action=leg.action, lots=1,
                lot_size=leg.lot_size, entry_price=leg.entry_price,
                status=leg.status, id=leg.id,
            ))
    return out


def _pair_hedges(legs: list[Leg], option_type: str) -> tuple[list[HedgePair], list[Leg]]:
    """
    Match each short lot with the long lot that minimises residual risk.

    Greedy nearest-width matching, not a true min-cost assignment. With the
    10-leg ceiling the difference is negligible, and the whole figure is an
    estimate anyway.
    """
    of_type = [l for l in legs if l.contract.instrument_type == option_type]
    shorts = _expand_to_lots([l for l in of_type if l.sign < 0])
    longs = _expand_to_lots([l for l in of_type if l.sign > 0])

    pairs: list[HedgePair] = []
    unhedged: list[Leg] = []
    available = list(longs)

    for short in shorts:
        if not available:
            unhedged.append(short)
            continue
        best = min(available, key=lambda l: _risk_width(
            short.contract.strike, l.contract.strike, option_type))
        width = _risk_width(short.contract.strike, best.contract.strike, option_type)
        available.remove(best)
        pairs.append(HedgePair(
            short=short, long=best, width=width, quantity=short.quantity,
            margin=width * short.quantity,
        ))

    return pairs, unhedged


def estimate_margin(strategy: Strategy, spot: float) -> MarginEstimate:
    """
    Estimated margin blocked to hold `strategy`.

      1. Pair short legs with longs of the same type; charge only the residual
         width between strikes.
      2. Charge full SPAN+exposure on whatever shorts remain naked, offsetting
         the call side against the put side.
      3. Charge futures legs on notional.
      4. Net off premium received — a credit lands in the account and reduces
         what must be blocked.
      5. Add a buffer for gap risk.
    """
    if not strategy.legs:
        raise ValueError("Cannot estimate margin for a strategy with no legs")

    notes: list[str] = []
    hedged: list[HedgePair] = []

    # Risk is tallied per side (CE vs PE) because the two sides lose under
    # opposite conditions — the call side loses when price rises, the put side
    # when it falls — so at expiry only ONE side can be in the money. They are
    # combined with max(), not sum(). Summing was the bug that charged an iron
    # condor for both wings at once (~2.5x a broker's number).
    spread = {LegInstrumentType.CE: 0.0, LegInstrumentType.PE: 0.0}
    naked = {LegInstrumentType.CE: 0.0, LegInstrumentType.PE: 0.0}
    naked_legs: list[Leg] = []

    for opt_type in (LegInstrumentType.CE, LegInstrumentType.PE):
        pairs, unhedged = _pair_hedges(strategy.legs, opt_type)
        hedged.extend(pairs)
        spread[opt_type] = sum(p.margin for p in pairs)
        naked[opt_type] = sum(naked_leg_margin(l, spot) for l in unhedged)
        naked_legs.extend(unhedged)

    spread_ce, spread_pe = spread[LegInstrumentType.CE], spread[LegInstrumentType.PE]
    naked_ce, naked_pe = naked[LegInstrumentType.CE], naked[LegInstrumentType.PE]

    # Defined-risk spreads on opposite sides are strictly mutually exclusive at
    # expiry → pure max.
    spread_margin = max(spread_ce, spread_pe)

    # Naked shorts on both sides are only *softly* exclusive (gap and vol risk
    # keep a tail), so charge the larger in full plus a fraction of the smaller.
    if naked_ce > 0 and naked_pe > 0:
        naked_margin = max(naked_ce, naked_pe) + SHORT_OFFSET_PCT * min(naked_ce, naked_pe)
        notes.append(
            f"Short both sides: charged the larger side in full plus "
            f"{SHORT_OFFSET_PCT:.0%} of the smaller (they cannot both finish deep ITM)."
        )
    else:
        naked_margin = naked_ce + naked_pe

    futures_margin = sum(
        naked_leg_margin(l, spot) for l in strategy.legs if l.contract.is_future
    )

    # A net credit reduces what must be blocked. Applied only against spread
    # margin: on a naked short, premium is already assumed inside SPAN.
    net_premium = strategy.net_premium
    credit = 0.0
    if net_premium is not None and net_premium > 0 and spread_margin > 0:
        credit = min(net_premium, spread_margin)

    subtotal = max(0.0, spread_margin - credit) + naked_margin + futures_margin
    total = subtotal * (1.0 + DEFINED_RISK_BUFFER_PCT)

    if naked_legs:
        notes.append(f"{len(naked_legs)} naked short lot(s) — margin dominated by SPAN.")
    elif hedged:
        notes.append("Fully hedged: margin ≈ max loss + buffer, not naked margin per leg.")
    if net_premium is None:
        notes.append("Some legs unfilled — premium credit not applied.")

    return MarginEstimate(
        total=round(total, 2),
        naked_margin=round(naked_margin, 2),
        spread_margin=round(spread_margin, 2),
        futures_margin=round(futures_margin, 2),
        premium_credit=round(credit, 2),
        hedged_pairs=hedged,
        naked_legs=naked_legs,
        notes=notes,
    )
