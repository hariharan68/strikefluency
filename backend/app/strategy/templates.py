"""
app/strategy/templates.py
─────────────────────────
Ready-made strategy generators — the 32 templates from the StockMojo reference
UI, grouped into the four filter tabs (Bullish / Bearish / Neutral / Other).

Each template is declared as a list of LegTemplate rows — pure structure, no
prices. Strikes are expressed in grid-steps from ATM (see strikes.py), so one
declaration works across NIFTY, BANKNIFTY and SENSEX. Assembly resolves the
steps to real strikes for the given underlying/spot and runs every leg through
builder.add_leg, so a template can never produce an invalid strategy.

Pricing is deliberately separate: build_template optionally takes a `price_fn`
(supplied by the option-chain adapter in Phase 6, or a model in tests) to fill
entry prices. Without one, legs come back unpriced (entry_price=None) — the
structure is still correct, it just isn't costed yet.

NOTE ON EXOTICS: "Batman" and "Double Plateau" are StockMojo's own names, not
standard exchange strategies. They are implemented here as the twin-structure
their payoff diagrams show — Batman = two butterflies (twin peaks), Double
Plateau = two condors (twin plateaus). Tune the offsets if your definition
differs; the assembly is generic.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Callable, Optional

from app.core.constants import (
    LegInstrumentType,
    OrderAction,
    StrategyCategory,
)
from app.core.instruments import get_spec
from app.strategy import strikes
from app.strategy.builder import add_leg, make_leg
from app.strategy.domain import OptionContract, Strategy

BUY, SELL = OrderAction.BUY, OrderAction.SELL
CE, PE, FUT = LegInstrumentType.CE, LegInstrumentType.PE, LegInstrumentType.FUT

PriceFn = Callable[[OptionContract], Optional[float]]


@dataclass(frozen=True)
class LegTemplate:
    """One leg of a template, before it is bound to an underlying/spot."""
    action: str
    opt_type: str
    steps: Optional[int] = 0     # grid-steps from ATM; None for FUT
    ratio: int = 1               # multiplied by the caller's base lots
    expiry_index: int = 0        # 0 = near expiry, 1 = far (calendars)


@dataclass(frozen=True)
class TemplateMeta:
    id: str
    name: str
    category: str
    legs: list[LegTemplate]
    needs_calendar: bool = False
    description: str = ""

    @property
    def min_expiries(self) -> int:
        return 1 + max(l.expiry_index for l in self.legs)


def L(action, opt_type, steps=0, ratio=1, expiry_index=0) -> LegTemplate:
    return LegTemplate(action, opt_type, steps, ratio, expiry_index)


# ── The registry ──────────────────────────────────────────────
# Offsets are conservative defaults; callers override via build_template(**offsets)
# is out of scope here — edit the step numbers to retune a template house-wide.
_TEMPLATES: dict[str, TemplateMeta] = {}


def _register(meta: TemplateMeta) -> None:
    _TEMPLATES[meta.id] = meta


def _def(id, name, category, legs, needs_calendar=False, description=""):
    _register(TemplateMeta(id, name, category, legs, needs_calendar, description))


# ── BULLISH ───────────────────────────────────────────────────
_def("buy_call", "Buy Call", StrategyCategory.BULLISH,
     [L(BUY, CE, 0)], description="Long ATM call. Unlimited upside, risk = premium.")
_def("sell_put", "Sell Put", StrategyCategory.BULLISH,
     [L(SELL, PE, 0)], description="Short ATM put. Collect premium if price holds/rises.")
_def("long_synthetic_future", "Long Synthetic Future", StrategyCategory.BULLISH,
     [L(BUY, CE, 0), L(SELL, PE, 0)], description="Long call + short put at ATM ≈ long future.")
_def("bull_call_spread", "Bull Call Spread", StrategyCategory.BULLISH,
     [L(BUY, CE, 0), L(SELL, CE, 2)], description="Debit spread; capped profit and loss.")
_def("bull_put_spread", "Bull Put Spread", StrategyCategory.BULLISH,
     [L(SELL, PE, 0), L(BUY, PE, -2)], description="Credit spread; profit if price holds up.")
_def("long_calendar_calls", "Long Calendar with Calls", StrategyCategory.BULLISH,
     [L(SELL, CE, 0, expiry_index=0), L(BUY, CE, 0, expiry_index=1)],
     needs_calendar=True, description="Sell near call, buy far call at same strike.")
_def("bull_condor", "Bull Condor", StrategyCategory.BULLISH,
     [L(BUY, CE, 0), L(SELL, CE, 2), L(SELL, CE, 4), L(BUY, CE, 6)],
     description="Long call condor with the profit plateau above spot.")
_def("bull_butterfly", "Bull Butterfly", StrategyCategory.BULLISH,
     [L(BUY, CE, 1), L(SELL, CE, 3, ratio=2), L(BUY, CE, 5)],
     description="Long call butterfly peaking above spot.")
_def("range_forward", "Range Forward", StrategyCategory.BULLISH,
     [L(BUY, CE, 2), L(SELL, PE, -2)], description="Long OTM call financed by a short OTM put.")

# ── BEARISH ───────────────────────────────────────────────────
_def("buy_put", "Buy Put", StrategyCategory.BEARISH,
     [L(BUY, PE, 0)], description="Long ATM put. Profit as price falls.")
_def("sell_call", "Sell Call", StrategyCategory.BEARISH,
     [L(SELL, CE, 0)], description="Short ATM call. Collect premium if price holds/falls.")
_def("short_synthetic_future", "Short Synthetic Future", StrategyCategory.BEARISH,
     [L(SELL, CE, 0), L(BUY, PE, 0)], description="Short call + long put at ATM ≈ short future.")
_def("bear_call_spread", "Bear Call Spread", StrategyCategory.BEARISH,
     [L(SELL, CE, 0), L(BUY, CE, 2)], description="Credit spread; profit if price holds down.")
_def("bear_put_spread", "Bear Put Spread", StrategyCategory.BEARISH,
     [L(BUY, PE, 0), L(SELL, PE, -2)], description="Debit spread; capped profit and loss.")
_def("long_calendar_puts", "Long Calendar with Puts", StrategyCategory.BEARISH,
     [L(SELL, PE, 0, expiry_index=0), L(BUY, PE, 0, expiry_index=1)],
     needs_calendar=True, description="Sell near put, buy far put at same strike.")
_def("bear_condor", "Bear Condor", StrategyCategory.BEARISH,
     [L(BUY, PE, 0), L(SELL, PE, -2), L(SELL, PE, -4), L(BUY, PE, -6)],
     description="Long put condor with the profit plateau below spot.")
_def("bear_butterfly", "Bear Butterfly", StrategyCategory.BEARISH,
     [L(BUY, PE, -1), L(SELL, PE, -3, ratio=2), L(BUY, PE, -5)],
     description="Long put butterfly peaking below spot.")
_def("risk_reversal", "Risk Reversal", StrategyCategory.BEARISH,
     [L(SELL, CE, 2), L(BUY, PE, -2)], description="Short OTM call + long OTM put (bearish).")

# ── NEUTRAL ───────────────────────────────────────────────────
_def("short_straddle", "Short Straddle", StrategyCategory.NEUTRAL,
     [L(SELL, CE, 0), L(SELL, PE, 0)], description="Sell ATM call + put. Max theta, unlimited risk.")
_def("short_strangle", "Short Strangle", StrategyCategory.NEUTRAL,
     [L(SELL, CE, 2), L(SELL, PE, -2)], description="Sell OTM call + put. Wider profit zone.")
_def("short_iron_condor", "Short Iron Condor", StrategyCategory.NEUTRAL,
     [L(SELL, CE, 2), L(BUY, CE, 4), L(SELL, PE, -2), L(BUY, PE, -4)],
     description="Credit condor. Defined risk both sides.")
_def("short_iron_butterfly", "Short Iron Butterfly", StrategyCategory.NEUTRAL,
     [L(SELL, CE, 0), L(SELL, PE, 0), L(BUY, CE, 2), L(BUY, PE, -2)],
     description="Short ATM straddle wrapped in protective wings.")
_def("batman", "Batman", StrategyCategory.NEUTRAL,
     [L(BUY, PE, -1), L(SELL, PE, -3, ratio=2), L(BUY, PE, -5),
      L(BUY, CE, 1), L(SELL, CE, 3, ratio=2), L(BUY, CE, 5)],
     description="Two butterflies (put + call) — twin profit peaks either side of spot.")
_def("jade_lizard", "Jade Lizard", StrategyCategory.NEUTRAL,
     [L(SELL, PE, -2), L(SELL, CE, 2), L(BUY, CE, 4)],
     description="Short put + short call spread. No upside risk when credit ≥ call width.")
_def("reverse_jade_lizard", "Reverse Jade Lizard", StrategyCategory.NEUTRAL,
     [L(SELL, CE, 2), L(SELL, PE, -2), L(BUY, PE, -4)],
     description="Short call + short put spread. No downside risk when credit ≥ put width.")
_def("double_plateau", "Double Plateau", StrategyCategory.NEUTRAL,
     [L(BUY, PE, -1), L(SELL, PE, -2), L(SELL, PE, -4), L(BUY, PE, -5),
      L(BUY, CE, 1), L(SELL, CE, 2), L(SELL, CE, 4), L(BUY, CE, 5)],
     description="Two condors (put + call) — twin profit plateaus either side of spot.")

# ── OTHER ─────────────────────────────────────────────────────
_def("long_straddle", "Long Straddle", StrategyCategory.OTHER,
     [L(BUY, CE, 0), L(BUY, PE, 0)], description="Buy ATM call + put. Profit on a big move either way.")
_def("long_strangle", "Long Strangle", StrategyCategory.OTHER,
     [L(BUY, CE, 2), L(BUY, PE, -2)], description="Buy OTM call + put. Cheaper, needs a bigger move.")
_def("long_iron_condor", "Long Iron Condor", StrategyCategory.OTHER,
     [L(BUY, CE, 2), L(SELL, CE, 4), L(BUY, PE, -2), L(SELL, PE, -4)],
     description="Debit condor — profits on a move out of the range.")
_def("long_iron_butterfly", "Long Iron Butterfly", StrategyCategory.OTHER,
     [L(BUY, CE, 0), L(BUY, PE, 0), L(SELL, CE, 2), L(SELL, PE, -2)],
     description="Long ATM straddle capped by short wings.")
_def("call_ratio_spread", "Call Ratio Spread", StrategyCategory.OTHER,
     [L(BUY, CE, 0), L(SELL, CE, 2, ratio=2)],
     description="Buy 1 call, sell 2 higher calls (1:2).")
_def("put_ratio_spread", "Put Ratio Spread", StrategyCategory.OTHER,
     [L(BUY, PE, 0), L(SELL, PE, -2, ratio=2)],
     description="Buy 1 put, sell 2 lower puts (1:2).")


# ── Public API ────────────────────────────────────────────────
class UnknownTemplateError(ValueError):
    pass


def list_templates(category: Optional[str] = None) -> list[TemplateMeta]:
    """All templates, optionally filtered to one UI tab."""
    metas = list(_TEMPLATES.values())
    if category:
        metas = [m for m in metas if m.category == category.strip().upper()]
    return metas


def get_template(template_id: str) -> TemplateMeta:
    try:
        return _TEMPLATES[template_id]
    except KeyError:
        raise UnknownTemplateError(
            f"Unknown template {template_id!r}. "
            f"Known: {', '.join(sorted(_TEMPLATES))}"
        ) from None


def _resolve_strike(spec, spot: float, tmpl: LegTemplate) -> Optional[float]:
    if tmpl.opt_type == FUT:
        return None
    atm = strikes.atm_strike(spec, spot)
    return float(strikes.step(spec, atm, tmpl.steps or 0))


def build_template(template_id: str, underlying: str, spot: float,
                   expiries, lots: int = 1,
                   price_fn: Optional[PriceFn] = None) -> Strategy:
    """
    Assemble a template into a validated draft Strategy.

    expiries : a date, or a list of dates (near first). Calendar templates need
               at least two; single-expiry templates use the first.
    lots     : base lot count; a template's per-leg ratio multiplies this.
    price_fn : optional (contract) -> ltp to fill entry prices. When omitted,
               legs are structurally complete but unpriced.
    """
    meta = get_template(template_id)
    spec = get_spec(underlying)

    if isinstance(expiries, date):
        expiries = [expiries]
    if len(expiries) < meta.min_expiries:
        raise ValueError(
            f"{meta.name} needs {meta.min_expiries} expiries, got {len(expiries)}."
        )

    strategy = Strategy(
        underlying=underlying,
        name=meta.name,
        template_id=meta.id,
        allow_calendar=meta.needs_calendar,
    )

    for tmpl in meta.legs:
        expiry = expiries[tmpl.expiry_index]
        strike = _resolve_strike(spec, spot, tmpl)
        contract = OptionContract(
            underlying=underlying, expiry=expiry,
            instrument_type=tmpl.opt_type, strike=strike,
        )
        entry_price = price_fn(contract) if price_fn else None
        if entry_price is not None:
            contract.ltp = entry_price
        leg = make_leg(
            underlying=underlying, instrument_type=tmpl.opt_type,
            action=tmpl.action, lots=lots * tmpl.ratio,
            expiry=expiry, strike=strike, entry_price=entry_price,
            contract=contract,
        )
        add_leg(strategy, leg)

    return strategy


def all_template_ids() -> list[str]:
    return list(_TEMPLATES.keys())
