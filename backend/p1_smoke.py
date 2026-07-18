"""Phase 1 smoke test — exercises the real objects, no DB."""
from datetime import date

from app.core.constants import LegInstrumentType, LegStatus, OrderAction, StrategyStatus
from app.core.instruments import get_spec, is_supported, UnknownInstrumentError
from app.strategy.domain import Leg, OptionContract, Strategy

# ── instrument registry ──
n = get_spec("nifty")  # case-insensitive lookup
assert n.symbol == "NIFTY" and n.exchange == "NSE"
assert n.contract_quantity(2) == 2 * n.lot_size
assert n.nearest_strike(24072.75) == 24050, n.nearest_strike(24072.75)
assert n.is_valid_strike(24050) and not n.is_valid_strike(24075)
assert get_spec("SENSEX").exchange == "BSE"
assert not is_supported("RELIANCE")
try:
    get_spec("RELIANCE")
    raise SystemExit("FAIL: expected UnknownInstrumentError")
except UnknownInstrumentError:
    pass
# frozen + override
try:
    n.lot_size = 999
    raise SystemExit("FAIL: spec should be immutable")
except Exception:
    pass
assert n.override(lot_size=25).lot_size == 25 and n.lot_size != 25
print(f"instruments OK  NIFTY lot={n.lot_size} step={n.strike_interval}")

# ── contracts ──
exp = date(2026, 7, 21)
ce = OptionContract("nifty", exp, "ce", 24050, ltp=145.50, bid=145.0, ask=146.0, iv=0.1288)
assert ce.underlying == "NIFTY" and ce.instrument_type == "CE"  # normalised
assert ce.is_option and not ce.is_future
assert ce.has_tradeable_price and ce.mid_price == 145.5 and ce.spread == 1.0
assert ce.days_to_expiry(as_of=date(2026, 7, 16)) == 5
assert not ce.is_expired(as_of=date(2026, 7, 16))
assert ce.is_expired(as_of=date(2026, 7, 22))
assert ce.label() == "NIFTY 24050 CE 21Jul", ce.label()

fut = OptionContract("NIFTY", date(2026, 7, 28), LegInstrumentType.FUT, ltp=24096.40)
assert fut.is_future and fut.strike is None
assert fut.label() == "NIFTY FUT 28Jul", fut.label()

# illiquid strike: absent price must read as absent, not as zero
dead = OptionContract("NIFTY", exp, "CE", 26000, ltp=0.0)
assert not dead.has_tradeable_price
assert OptionContract("NIFTY", exp, "CE", 26000).mid_price is None
print("contracts OK")

# ── legs ──
short = Leg(ce, OrderAction.SELL, lots=2, lot_size=n.lot_size, entry_price=145.50)
assert short.sign == -1
assert short.quantity == 2 * n.lot_size
assert short.signed_quantity == -short.quantity
assert short.premium > 0, "short leg must credit cash"
assert short.premium == 145.50 * 2 * n.lot_size
assert short.status == LegStatus.PENDING and not short.is_open

long = Leg(ce, "buy", lots=1, lot_size=n.lot_size, entry_price=145.50)
assert long.sign == 1 and long.premium < 0, "long leg must debit cash"
assert Leg(ce, OrderAction.BUY, 1, n.lot_size).premium is None, "unfilled -> None"
print("legs OK")

# ── strategy: short straddle ──
pe = OptionContract("NIFTY", exp, "PE", 24050, ltp=112.50)
s = Strategy(underlying="NIFTY", name="Short Straddle", template_id="short_straddle")
s.legs = [
    Leg(ce, OrderAction.SELL, 1, n.lot_size, entry_price=145.50),
    Leg(pe, OrderAction.SELL, 1, n.lot_size, entry_price=112.50),
]
assert s.is_draft and s.status == StrategyStatus.DRAFT
assert s.lot_size == n.lot_size
assert s.expiries == [exp] and not s.is_calendar
assert s.has_short_legs and not s.has_future_legs
expected = (145.50 + 112.50) * n.lot_size
assert abs(s.net_premium - expected) < 1e-9, (s.net_premium, expected)
print(f"short straddle OK  net credit = {s.net_premium:,.2f}")

# net_premium must refuse to guess when a leg is unfilled
s.legs.append(Leg(pe, OrderAction.BUY, 1, n.lot_size))
assert s.net_premium is None, "unfilled leg must poison net_premium, not be treated as 0"
print("partial-fill guard OK")

# ── calendar detection ──
c = Strategy(underlying="NIFTY", allow_calendar=True)
c.legs = [
    Leg(OptionContract("NIFTY", date(2026, 7, 21), "CE", 24050, ltp=145.5), OrderAction.SELL, 1, n.lot_size, entry_price=145.5),
    Leg(OptionContract("NIFTY", date(2026, 7, 28), "CE", 24050, ltp=210.0), OrderAction.BUY, 1, n.lot_size, entry_price=210.0),
]
assert c.is_calendar and len(c.expiries) == 2
assert c.net_premium < 0, "long calendar is a net debit"
print(f"calendar OK  net debit = {c.net_premium:,.2f}")

print("\nPhase 1 smoke: ALL PASSED")
