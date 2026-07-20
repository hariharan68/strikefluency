"""
app/options/math.py
───────────────────
Pure option-chain math. Zero DB / network / framework imports — every function
is independently unit-testable.

Fyers returns flat CE/PE legs (OI, LTP, volume) and sometimes an unreliable IV.
We recover IV ourselves by inverting Black-76 (European index options priced off
the forward), then derive greeks and the aggregate intelligence (PCR, max pain,
OI walls, buildup, ATM IV / percentile, GEX).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional

_RISK_FREE = 0.065   # India risk-free proxy (annualised)


@dataclass(frozen=True)
class ChainRow:
    strike: float
    opt_type: str          # "CE" | "PE"
    oi: int
    oi_change: int
    ltp: float
    volume: int
    price_change: float    # underlying % change since prev snapshot
    iv: Optional[float] = None


# ── PCR ───────────────────────────────────────────────────────
def pcr_oi(rows: list[ChainRow]) -> float:
    """Put/Call OI ratio. >1.2 put-heavy, <0.8 call-heavy. 0.0 if no call OI."""
    ce = sum(r.oi for r in rows if r.opt_type == "CE")
    pe = sum(r.oi for r in rows if r.opt_type == "PE")
    return round(pe / ce, 4) if ce > 0 else 0.0


def pcr_volume(rows: list[ChainRow]) -> float:
    """Put/Call volume ratio — more responsive intraday. 0.0 if no call volume."""
    ce = sum(r.volume for r in rows if r.opt_type == "CE")
    pe = sum(r.volume for r in rows if r.opt_type == "PE")
    return round(pe / ce, 4) if ce > 0 else 0.0


# ── OI buildup ────────────────────────────────────────────────
_BUILDUP = {
    (True, True):   (1, "LONG_BUILDUP"),    # price↑ oi↑  fresh longs
    (False, True):  (2, "SHORT_BUILDUP"),   # price↓ oi↑  fresh shorts
    (True, False):  (3, "SHORT_COVERING"),  # price↑ oi↓  shorts exiting
    (False, False): (4, "LONG_UNWINDING"),  # price↓ oi↓  longs exiting
}


def classify_buildup(price_chg: float, oi_chg: int) -> tuple[int, str]:
    """
    Map (price direction, OI direction) → buildup code + label.

    The caller passes the option's EFFECTIVE price direction: for CE pass the
    underlying % change as-is; for PE pass it NEGATED (put premiums move opposite
    to the underlying).
    """
    return _BUILDUP[(price_chg >= 0, oi_chg >= 0)]


# ── Max pain ──────────────────────────────────────────────────
def max_pain(rows: list[ChainRow], strikes: list[float]) -> float:
    """
    Expiry price minimising total option-writer payout:
        pain(P) = Σ CE_OI·max(0, P−K) + Σ PE_OI·max(0, K−P)
    Returns the argmin strike (0.0 if no strikes).
    """
    if not strikes:
        return 0.0
    ce = [(r.strike, r.oi) for r in rows if r.opt_type == "CE"]
    pe = [(r.strike, r.oi) for r in rows if r.opt_type == "PE"]

    best_strike, best_pain = strikes[0], None
    for p in strikes:
        pain = sum(oi * max(0.0, p - k) for k, oi in ce) \
             + sum(oi * max(0.0, k - p) for k, oi in pe)
        if best_pain is None or pain < best_pain:
            best_pain, best_strike = pain, p
    return best_strike


# ── OI walls ──────────────────────────────────────────────────
def oi_walls(rows: list[ChainRow], spot: float, nearby_strikes: int = 10) -> dict:
    """
    Support / resistance / ATM from OI concentration.

    Support = highest PE-OI strike BELOW spot; resistance = highest CE-OI strike
    ABOVE spot. Restricted to the ±nearby_strikes window around ATM so distant
    illiquid strikes don't dominate.
    """
    strikes = sorted({r.strike for r in rows})
    atm = atm_strike(spot, strikes)
    if not strikes:
        return {"support": None, "resistance": None, "atm": atm}

    atm_idx = min(range(len(strikes)), key=lambda i: abs(strikes[i] - atm))
    lo = max(0, atm_idx - nearby_strikes)
    hi = min(len(strikes), atm_idx + nearby_strikes + 1)
    window = set(strikes[lo:hi])

    support, support_oi = None, -1
    resistance, resistance_oi = None, -1
    for r in rows:
        if r.strike not in window:
            continue
        if r.opt_type == "PE" and r.strike < spot and r.oi > support_oi:
            support, support_oi = r.strike, r.oi
        elif r.opt_type == "CE" and r.strike > spot and r.oi > resistance_oi:
            resistance, resistance_oi = r.strike, r.oi
    return {"support": support, "resistance": resistance, "atm": atm}


def atm_strike(spot: float, strikes: list[float], step: float = 50.0) -> float:
    """Nearest strike to spot; fall back to round(spot/step)*step if no strikes."""
    if not strikes:
        return round(spot / step) * step
    return min(strikes, key=lambda k: abs(k - spot))


# ── Black-76 IV recovery + greeks ─────────────────────────────
def _norm_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def _norm_pdf(x: float) -> float:
    return math.exp(-0.5 * x * x) / math.sqrt(2.0 * math.pi)


def black76_price(opt_type: str, forward: float, strike: float, t_years: float,
                  sigma: float, r: float = _RISK_FREE) -> float:
    """Black-76 price of a European option on a forward. 0 on degenerate inputs."""
    if t_years <= 0 or sigma <= 0 or forward <= 0 or strike <= 0:
        return 0.0
    disc = math.exp(-r * t_years)
    sqrt_t = math.sqrt(t_years)
    d1 = (math.log(forward / strike) + 0.5 * sigma * sigma * t_years) / (sigma * sqrt_t)
    d2 = d1 - sigma * sqrt_t
    if opt_type == "CE":
        return disc * (forward * _norm_cdf(d1) - strike * _norm_cdf(d2))
    return disc * (strike * _norm_cdf(-d2) - forward * _norm_cdf(-d1))


def greeks(opt_type: str, forward: float, strike: float, t_years: float,
           sigma: float, r: float = _RISK_FREE) -> dict:
    """
    delta (per 1pt), gamma (per 1pt), vega (per 1% IV), theta (per calendar day).
    Zeros on degenerate inputs.
    """
    if t_years <= 0 or sigma <= 0 or forward <= 0 or strike <= 0:
        return {"delta": 0.0, "gamma": 0.0, "vega": 0.0, "theta": 0.0}
    disc = math.exp(-r * t_years)
    sqrt_t = math.sqrt(t_years)
    d1 = (math.log(forward / strike) + 0.5 * sigma * sigma * t_years) / (sigma * sqrt_t)
    d2 = d1 - sigma * sqrt_t
    pdf = _norm_pdf(d1)

    gamma = disc * pdf / (forward * sigma * sqrt_t)
    vega = forward * disc * pdf * sqrt_t / 100.0     # per 1% IV
    if opt_type == "CE":
        delta = disc * _norm_cdf(d1)
        theta_year = (-forward * disc * pdf * sigma / (2 * sqrt_t)
                      + r * disc * (forward * _norm_cdf(d1) - strike * _norm_cdf(d2)))
    else:
        delta = -disc * _norm_cdf(-d1)
        theta_year = (-forward * disc * pdf * sigma / (2 * sqrt_t)
                      + r * disc * (strike * _norm_cdf(-d2) - forward * _norm_cdf(-d1)))
    return {"delta": delta, "gamma": gamma, "vega": vega, "theta": theta_year / 365.0}


def implied_vol(opt_type: str, premium: float, forward: float, strike: float,
                t_years: float, r: float = _RISK_FREE) -> Optional[float]:
    """
    Recover IV by bisection on sigma in [1e-4, 5.0], 100 iters, tol 0.01.
    Returns IV IN PERCENT rounded 2dp. None when premium <= 0 or below intrinsic
    (never fabricate an IV the price can't support).
    """
    if premium <= 0 or forward <= 0 or strike <= 0 or t_years <= 0:
        return None
    disc = math.exp(-r * t_years)
    intrinsic = disc * (max(0.0, forward - strike) if opt_type == "CE"
                        else max(0.0, strike - forward))
    if premium < intrinsic - 0.01:
        return None

    lo, hi = 1e-4, 5.0
    for _ in range(100):
        mid = (lo + hi) / 2.0
        price = black76_price(opt_type, forward, strike, t_years, mid, r)
        if abs(price - premium) < 0.01:
            return round(mid * 100.0, 2)
        if price < premium:
            lo = mid
        else:
            hi = mid
    return round(((lo + hi) / 2.0) * 100.0, 2)


# ── ATM IV / percentile ───────────────────────────────────────
def atm_iv(rows: list[ChainRow], atm: float) -> Optional[float]:
    """
    Mean of CE & PE IV at the ATM strike, ignoring falsy / ≤0 IV (a 0 means the
    feed has no IV, not a real zero-vol option). None if neither side has IV.
    """
    ivs = [r.iv for r in rows if r.strike == atm and r.iv and r.iv > 0]
    return round(sum(ivs) / len(ivs), 2) if ivs else None


def iv_percentile(atm_iv_val: Optional[float], lo: float = 10.0, hi: float = 25.0) -> Optional[float]:
    """Linear position of ATM IV within a typical [lo,hi] band, clamped 0–100."""
    if atm_iv_val is None:
        return None
    pct = (atm_iv_val - lo) / (hi - lo) * 100.0
    return round(max(0.0, min(100.0, pct)), 2)


def iv_percentile_label(pct: Optional[float]) -> Optional[str]:
    if pct is None:
        return None
    if pct < 20:
        return "Very Low"
    if pct < 40:
        return "Low"
    if pct < 60:
        return "Moderate"
    if pct < 80:
        return "High"
    return "Very High"


# ── Gamma Exposure (GEX) ──────────────────────────────────────
def net_gex(rows: list[dict], spot: float, lot_size: int) -> Optional[float]:
    """
    Dealer gamma in ₹ Crore per 1% move. Dealers are long calls / short puts, so
    call gamma ADDS and put gamma SUBTRACTS.

        total = Σ sign · gamma · oi · lot_size   (sign +1 CE, −1 PE)
        gex   = total · spot² · 0.01             (the 0.01 = per-1%-move; required)
        → ₹ Crore = gex / 1e7

    rows are raw dicts carrying per-strike gamma / oi / option_type.
    """
    if spot <= 0 or lot_size <= 0:
        return None
    total = 0.0
    for r in rows:
        gamma = r.get("gamma") or 0.0
        oi = r.get("oi") or 0
        if gamma <= 0 or oi <= 0:
            continue
        sign = 1 if r.get("option_type") == "CE" else -1
        total += sign * gamma * oi * lot_size
    gex = total * spot * spot * 0.01
    return round(gex / 1e7, 2)


def gamma_flip_strike(rows: list[dict], spot: float) -> Optional[float]:
    """
    Strike where cumulative signed gamma·oi (summed low→high) flips sign.
    Returns the strike just BEFORE the crossing.
    """
    by_strike: dict[float, float] = {}
    for r in rows:
        gamma = r.get("gamma") or 0.0
        oi = r.get("oi") or 0
        if gamma <= 0 or oi <= 0:
            continue
        sign = 1 if r.get("option_type") == "CE" else -1
        by_strike[r["strike"]] = by_strike.get(r["strike"], 0.0) + sign * gamma * oi

    cumulative = 0.0
    prev_strike = None
    prev_sign = None
    for k in sorted(by_strike):
        cumulative += by_strike[k]
        cur_sign = cumulative >= 0
        if prev_sign is not None and cur_sign != prev_sign:
            return prev_strike
        prev_sign, prev_strike = cur_sign, k
    return None


def gex_label(gex: Optional[float]) -> str:
    if gex is None or gex == 0:
        return "Neutral"
    if gex > 0:
        return "Positive — vol suppressed / pinned"
    return "Negative — moves amplified"


# ── Writing posture ───────────────────────────────────────────
def writing_posture(rows: list[ChainRow]) -> str:
    """
    Who's writing more? Sum only POSITIVE oi_change per side.
        ratio = ce_writing / (pe_writing + 1)
        >1.3 → CALL_WRITERS_DOMINANT, <0.77 → PUT_WRITERS_DOMINANT, else BALANCED.
    """
    ce = sum(r.oi_change for r in rows if r.opt_type == "CE" and r.oi_change > 0)
    pe = sum(r.oi_change for r in rows if r.opt_type == "PE" and r.oi_change > 0)
    if ce == 0 and pe == 0:
        return "BALANCED"
    ratio = ce / (pe + 1)
    if ratio > 1.3:
        return "CALL_WRITERS_DOMINANT"
    if ratio < 0.77:
        return "PUT_WRITERS_DOMINANT"
    return "BALANCED"
