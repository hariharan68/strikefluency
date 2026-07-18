from datetime import date
from app.core.constants import OrderAction
from app.core.instruments import get_spec
from app.strategy.domain import Leg, OptionContract, Strategy
from app.strategy.payoff import payoff_curve

n = get_spec("NIFTY")
exp = date(2026, 7, 21)
ce = OptionContract("NIFTY", exp, "CE", 24050, ltp=145.50)
pe = OptionContract("NIFTY", exp, "PE", 24050, ltp=112.50)

s = Strategy(underlying="NIFTY", name="Short Straddle")
s.legs = [
    Leg(ce, OrderAction.SELL, 1, n.lot_size, entry_price=145.50),
    Leg(pe, OrderAction.SELL, 1, n.lot_size, entry_price=112.50),
]

r = payoff_curve(s, spot=24072.75)
print("max profit:", r.max_profit)     # 19350.0
print("max loss:  ", r.max_loss)       # None  → unlimited
print("breakevens:", r.breakevens)     # [23792.0, 24308.0]

print("net premium:", r.net_premium)   # 19350.0



# ── Short Iron Condor ──
condor = Strategy(underlying="NIFTY", name="Short Iron Condor")
condor.legs = [
    Leg(OptionContract("NIFTY", exp, "CE", 24300, ltp=46.10), OrderAction.SELL, 1, n.lot_size, entry_price=46.10),
    Leg(OptionContract("NIFTY", exp, "CE", 24500, ltp=14.80), OrderAction.BUY,  1, n.lot_size, entry_price=14.80),
    Leg(OptionContract("NIFTY", exp, "PE", 23800, ltp=36.90), OrderAction.SELL, 1, n.lot_size, entry_price=36.90),
    Leg(OptionContract("NIFTY", exp, "PE", 23600, ltp=13.90), OrderAction.BUY,  1, n.lot_size, entry_price=13.90),
]

rc = payoff_curve(condor, spot=24072.75)
print("condor max profit:", rc.max_profit)   # 4072.5
print("condor max loss:  ", rc.max_loss)     # -10927.5  (a number, NOT None)
print("condor breakevens:", rc.breakevens)   # [23745.7, 24354.3]
