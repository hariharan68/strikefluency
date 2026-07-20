"""
app/services/options_service.py
───────────────────────────────
Read path for the Option Chain module: pull the broker chain (via the existing
provider, Fyers with mock fallback), recover IV where the feed doesn't give it,
compute per-strike greeks for GEX, and return the aggregate intelligence.

Follows app conventions: plain module functions, no async. Read requests never
write to the DB (the spec's snapshot persistence is a separate scheduler concern;
the live terminal works entirely off this read path).

Forward for the IV solver: the spec inverts put-call parity per chain; here we
use the carry-adjusted spot forward `F = spot·e^(rT)`, which for liquid index
weeklies is within a rupee of the parity forward and needs no extra feed fields.
"""

from __future__ import annotations

import logging
import math
from datetime import date, datetime
from typing import Optional

from app.core.instruments import get_spec
from app.market.provider_factory import get_market_provider
from app.options import math as om
from app.options.math import ChainRow, _RISK_FREE

logger = logging.getLogger(__name__)


def _parse_expiry(value) -> Optional[date]:
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value))
    except (ValueError, TypeError):
        return None


def _t_years(expiry: Optional[date]) -> float:
    """Time to expiry in years, floored so expiry-day math doesn't divide by zero."""
    if expiry is None:
        return 7 / 365          # sensible default when the feed omits expiry
    days = max((expiry - date.today()).days, 0)
    return max(days, 0.5) / 365.0


def _iv_for(opt_type: str, feed_iv, ltp: float, forward: float,
            strike: float, t_years: float) -> Optional[float]:
    """
    Prefer the feed's IV when it's real (>0); otherwise recover it from the price
    by inverting Black-76. Returns IV in percent, or None if unrecoverable.
    """
    if feed_iv and feed_iv > 0:
        return round(float(feed_iv), 2)
    return om.implied_vol(opt_type, ltp, forward, strike, t_years)


def _build(instrument: str, expiry_sel: Optional[str] = None) -> dict:
    """Fetch + enrich the chain once; shared by metrics and chain endpoints."""
    spec = get_spec(instrument)
    provider = get_market_provider()
    chain = provider.get_option_chain(instrument, expiry_sel) if expiry_sel \
        else provider.get_option_chain(instrument)

    spot = float(chain.get("spot_price") or 0.0)
    change_pct = float(chain.get("change_pct") or 0.0)
    expiry = _parse_expiry(chain.get("expiry"))
    t_years = _t_years(expiry)
    forward = spot * math.exp(_RISK_FREE * t_years) if spot > 0 else 0.0
    lot = int(chain.get("lot_size") or spec.lot_size)

    rows: list[ChainRow] = []          # for the aggregate engine
    gamma_rows: list[dict] = []        # raw dicts for GEX
    enriched: list[dict] = []          # per-leg display rows for the table

    for s in chain.get("strikes", []):
        strike = float(s["strike"])
        for opt_type, side_key in (("CE", "ce"), ("PE", "pe")):
            side = s.get(side_key) or {}
            ltp = float(side.get("ltp") or 0.0)
            oi = int(side.get("oi") or 0)
            oi_change = int(side.get("oi_change") or 0)
            volume = int(side.get("volume") or 0)
            iv = _iv_for(opt_type, side.get("iv"), ltp, forward, strike, t_years)

            rows.append(ChainRow(strike, opt_type, oi, oi_change, ltp, volume,
                                 change_pct, iv))

            g = om.greeks(opt_type, forward, strike, t_years, iv / 100.0) \
                if iv and iv > 0 else {"delta": 0.0, "gamma": 0.0, "vega": 0.0, "theta": 0.0}
            gamma_rows.append({"strike": strike, "option_type": opt_type,
                               "gamma": g["gamma"], "oi": oi})

            # per-leg buildup: CE uses underlying change as-is, PE negated
            eff_chg = change_pct if opt_type == "CE" else -change_pct
            code, label = om.classify_buildup(eff_chg, oi_change)
            enriched.append({
                "strike": strike, "option_type": opt_type, "ltp": ltp,
                "oi": oi, "oi_change": oi_change, "volume": volume, "iv": iv,
                "delta": round(g["delta"], 4), "gamma": round(g["gamma"], 6),
                "theta": round(g["theta"], 4), "vega": round(g["vega"], 4),
                "buildup_type": code, "buildup_label": label,
            })

    return {
        "spec": spec, "chain": chain, "spot": spot, "change_pct": change_pct,
        "future": float(chain.get("future_price") or 0.0),
        "expiries": list(chain.get("expiries") or []),
        "expiry": expiry, "lot": lot, "rows": rows, "gamma_rows": gamma_rows,
        "enriched": enriched,
    }


def get_metrics(instrument: str, expiry: Optional[str] = None) -> dict:
    """Aggregate option-chain intelligence for one underlying (read-only)."""
    try:
        ctx = _build(instrument, expiry)
        rows, spot, lot = ctx["rows"], ctx["spot"], ctx["lot"]
        strikes = sorted({r.strike for r in rows})
        atm = om.atm_strike(spot, strikes, ctx["spec"].strike_interval)
        walls = om.oi_walls(rows, spot)
        atm_iv_val = om.atm_iv(rows, atm)
        iv_pct = om.iv_percentile(atm_iv_val)
        gex = om.net_gex(ctx["gamma_rows"], spot, lot)

        return {
            "instrument": ctx["spec"].symbol,
            "snap_ts": datetime.utcnow().isoformat(),
            "spot": spot,
            "future": ctx["future"],
            "change_pct": ctx["change_pct"],
            "expiry_date": ctx["expiry"].isoformat() if ctx["expiry"] else None,
            "expiries": ctx["expiries"],
            "vix": None,   # India VIX not in the pipeline yet — see get_chain note
            "lot_size": lot,
            "atm_strike": atm,
            "pcr_oi": om.pcr_oi(rows),
            "pcr_volume": om.pcr_volume(rows),
            "max_pain_strike": om.max_pain(rows, strikes),
            "support_strike": walls["support"],
            "resistance_strike": walls["resistance"],
            "total_call_oi": sum(r.oi for r in rows if r.opt_type == "CE"),
            "total_put_oi": sum(r.oi for r in rows if r.opt_type == "PE"),
            "writing_posture": om.writing_posture(rows),
            "atm_iv": atm_iv_val,
            "iv_percentile": iv_pct,
            "iv_percentile_label": om.iv_percentile_label(iv_pct),
            "net_gex": gex,
            "gamma_flip": om.gamma_flip_strike(ctx["gamma_rows"], spot),
            "gex_label": om.gex_label(gex),
            "source": ctx["chain"].get("source", "fyers"),
        }
    except Exception:
        logger.exception("get_metrics failed for %s", instrument)
        raise


def get_chain(instrument: str, expiry: Optional[str] = None) -> dict:
    """Per-leg chain rows (with buildup + greeks) for the table (read-only)."""
    try:
        ctx = _build(instrument, expiry)
        strikes = sorted({r.strike for r in ctx["rows"]})
        atm = om.atm_strike(ctx["spot"], strikes, ctx["spec"].strike_interval)
        return {
            "instrument": ctx["spec"].symbol,
            "spot": ctx["spot"],
            "change_pct": ctx["change_pct"],
            "atm_strike": atm,
            "snap_ts": datetime.utcnow().isoformat(),
            "expiry_date": ctx["expiry"].isoformat() if ctx["expiry"] else None,
            "max_pain_strike": om.max_pain(ctx["rows"], strikes),
            "lot_size": ctx["lot"],
            "chain_rows": ctx["enriched"],
            "source": ctx["chain"].get("source", "fyers"),
        }
    except Exception:
        logger.exception("get_chain failed for %s", instrument)
        raise
