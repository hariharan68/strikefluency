"""
app/strategy/chain.py
─────────────────────
Bridges the market-data provider's option chain to the Strategy Builder's
OptionContract / Leg objects, and prices strategies from live quotes.

WHY THIS EXISTS — the far-OTM trap
──────────────────────────────────
The existing single-order path (virtual_order_service._get_ltp_from_chain)
silently returns the SPOT price when a strike isn't in the chain. Providers
fetch only ~21 strikes around ATM, so any far-OTM leg — exactly what condors,
strangles and iron flies use — would fill at ~24000 instead of ~5. For a
multi-leg builder that is catastrophic, so here a missing strike is a hard
StrikeNotInChainError, never a silent spot fill.

Other edge cases handled (module spec item 9): stale/degraded quotes are flagged
(not hidden), a zero LTP counts as "no quote", expired legs are rejected, and
greeks are computed from IV via Black-Scholes rather than trusting the
provider's delta (which is noise in the mock).

IV UNITS: the canonical chain carries IV in percent (e.g. 22.45). OptionContract
and the greeks maths want a decimal (0.2245), so we divide by 100 on the way in.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from typing import Optional

from app.core.instruments import get_spec
from app.strategy.domain import Leg, OptionContract, Strategy
from app.strategy.greeks import populate_greeks

# Quotes older than this are flagged stale (advisory, not fatal).
STALE_QUOTE_SECONDS = 300
# Sources that mean the data is degraded rather than live.
DEGRADED_SOURCES = {"mock", "mock_fallback", "fyers_cached"}


class StrikeNotInChainError(ValueError):
    """A requested strike/type is not present in the chain — never silently fill."""


@dataclass
class LegQuote:
    """Result of quoting one leg against the chain."""
    leg_id: object
    found: bool
    ltp: Optional[float] = None
    iv: Optional[float] = None
    stale: bool = False
    degraded: bool = False
    reason: Optional[str] = None

    @property
    def usable(self) -> bool:
        return self.found and self.ltp is not None and self.ltp > 0


@dataclass
class PricingReport:
    quotes: list[LegQuote] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        """True only when every leg got a usable, non-stale, non-degraded quote."""
        return all(q.usable and not q.stale and not q.degraded for q in self.quotes)

    @property
    def all_priced(self) -> bool:
        """True when every leg has a usable price (may still be stale/degraded)."""
        return all(q.usable for q in self.quotes)

    @property
    def problems(self) -> list[str]:
        out = []
        for q in self.quotes:
            if not q.usable:
                out.append(q.reason or "no usable quote")
            elif q.stale:
                out.append("stale quote")
            elif q.degraded:
                out.append("degraded/mock quote")
        return out


class ChainPricer:
    """
    Prices Strategy legs from provider option chains.

    Fetches one chain per expiry (so calendar spreads work) and caches it for the
    life of the instance — an instance is meant to be short-lived, created per
    request or per execution.
    """

    def __init__(self, provider, instrument: str):
        self.provider = provider
        self.instrument = instrument.strip().upper()
        self.spec = get_spec(self.instrument)
        self._chains: dict[str, dict] = {}   # expiry ISO -> chain dict

    # ── chain access ──────────────────────────────────────────
    def chain_for(self, expiry: date) -> dict:
        key = expiry.isoformat()
        if key not in self._chains:
            self._chains[key] = self.provider.get_option_chain(self.instrument, key)
        return self._chains[key]

    def _row(self, chain: dict, strike: float) -> Optional[dict]:
        for row in chain.get("strikes", []):
            if float(row["strike"]) == float(strike):
                return row
        return None

    # ── contract construction ─────────────────────────────────
    def build_contract(self, strike: Optional[float], opt_type: str,
                       expiry: date, spot: Optional[float] = None) -> OptionContract:
        """
        Build a market-populated OptionContract, computing greeks from IV.

        Raises StrikeNotInChainError if the option strike isn't in the chain —
        this is the deliberate replacement for the silent-spot-price bug.
        """
        chain = self.chain_for(expiry)
        spot = spot if spot is not None else float(chain.get("spot_price"))

        contract = OptionContract(
            underlying=self.instrument, expiry=expiry,
            instrument_type=opt_type, strike=strike,
            quote_time=self._chain_time(chain), source=chain.get("source", "live"),
        )

        if contract.is_future:
            contract.ltp = spot
            contract.delta = 1.0
            return contract

        row = self._row(chain, strike)
        if row is None:
            raise StrikeNotInChainError(
                f"{self.instrument} {strike:g}{opt_type} {expiry} is not in the "
                f"chain (only ~{len(chain.get('strikes', []))} strikes around ATM "
                f"were fetched). Refusing to fill at spot."
            )

        side = row.get("ce" if opt_type == "CE" else "pe", {})
        ltp = side.get("ltp")
        contract.ltp = float(ltp) if ltp not in (None, 0, 0.0) else None
        contract.bid = _pos_or_none(side.get("bid"))
        contract.ask = _pos_or_none(side.get("ask"))
        contract.oi = side.get("oi")
        contract.volume = side.get("volume")
        iv_pct = side.get("iv")
        contract.iv = (iv_pct / 100.0) if iv_pct not in (None, 0, 0.0) else None

        # Compute greeks from IV via Black-Scholes; ignore the provider's delta.
        if contract.iv and contract.ltp:
            try:
                populate_greeks(contract, spot)
            except Exception:
                pass   # greeks are best-effort; a missing IV shouldn't break pricing
        return contract

    # ── leg quoting ───────────────────────────────────────────
    def quote_leg(self, leg: Leg, as_of: Optional[date] = None) -> LegQuote:
        """Refresh a leg's contract snapshot from the chain and report its state."""
        c = leg.contract
        as_of = as_of or date.today()

        if c.is_option and c.is_expired(as_of):
            return LegQuote(leg.id, found=False,
                            reason=f"{c.label()} expired on {c.expiry}")
        try:
            fresh = self.build_contract(c.strike, c.instrument_type, c.expiry)
        except StrikeNotInChainError as e:
            return LegQuote(leg.id, found=False, reason=str(e))

        # copy the fresh market snapshot onto the leg's contract
        for attr in ("ltp", "bid", "ask", "iv", "oi", "volume",
                     "delta", "gamma", "theta", "vega", "quote_time", "source"):
            setattr(c, attr, getattr(fresh, attr))

        degraded = (fresh.source in DEGRADED_SOURCES)
        stale = self._is_stale(fresh.quote_time, as_of)
        if not c.has_tradeable_price:
            return LegQuote(leg.id, found=True, ltp=c.ltp, iv=c.iv, degraded=degraded,
                            stale=stale, reason=f"{c.label()} has no LTP (illiquid)")
        return LegQuote(leg.id, found=True, ltp=c.ltp, iv=c.iv,
                        stale=stale, degraded=degraded)

    def price_strategy(self, strategy: Strategy, set_entry: bool = False,
                       as_of: Optional[date] = None) -> PricingReport:
        """
        Quote every leg. When set_entry, also stamp entry_price on usable legs
        (execution uses this; a preview/what-if leaves entries untouched).
        """
        report = PricingReport()
        for leg in strategy.legs:
            q = self.quote_leg(leg, as_of)
            if q.usable and set_entry:
                leg.entry_price = leg.contract.ltp
            report.quotes.append(q)
        return report

    def template_price_fn(self, expiry: date):
        """A price_fn for templates.build_template — returns LTP or None."""
        def price(contract: OptionContract) -> Optional[float]:
            try:
                built = self.build_contract(
                    contract.strike, contract.instrument_type,
                    contract.expiry if contract.expiry else expiry,
                )
            except StrikeNotInChainError:
                return None
            return built.ltp
        return price

    # ── helpers ───────────────────────────────────────────────
    @staticmethod
    def _chain_time(chain: dict) -> Optional[datetime]:
        ts = chain.get("timestamp")
        if not ts:
            return None
        try:
            return datetime.fromisoformat(ts)
        except (ValueError, TypeError):
            return None

    def _is_stale(self, quote_time: Optional[datetime], as_of: date) -> bool:
        if quote_time is None:
            return False
        now = datetime.now(quote_time.tzinfo) if quote_time.tzinfo else datetime.now()
        return (now - quote_time).total_seconds() > STALE_QUOTE_SECONDS


def _pos_or_none(v) -> Optional[float]:
    return float(v) if v not in (None, 0, 0.0) else None
