"""
app/options/
────────────
Live Option Chain intelligence — PCR, max pain, OI walls, OI buildup,
Black-76 IV recovery, ATM IV / percentile, and Gamma Exposure (GEX).

`math.py` is pure (stdlib only, no DB/network/framework) and unit-tested.
The service layer (app/services/options_service.py) feeds it the broker chain
and returns metrics; the router exposes them. Read requests never write to the DB.
"""
