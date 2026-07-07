"""
app/market/mock_provider.py
────────────────────────────
Realistic mock market data for testing outside market hours.
Simulates NIFTY price movement with small random fluctuations.
Used when MARKET_DATA_PROVIDER=mock in .env.

Swap to FyersProvider by changing one .env line:
  MARKET_DATA_PROVIDER=fyers
"""

import random
from datetime import datetime, date

from app.market.base import MarketDataProvider

# Starting spot prices (realistic as of 2024)
BASE_PRICES = {
    "NIFTY":     22150.0,
    "BANKNIFTY": 47500.0,
    "SENSEX":    73000.0,
}

LOT_SIZES = {
    "NIFTY":     65,
    "BANKNIFTY": 30,
    "SENSEX":    20,
}

# Simulate price drift — changes each call
_current_prices = dict(BASE_PRICES)


class MockMarketDataProvider(MarketDataProvider):

    def is_connected(self) -> bool:
        return True

    def get_spot_price(self, instrument: str) -> float:
        """Simulate spot price with small random movement."""
        global _current_prices
        base = _current_prices.get(instrument, BASE_PRICES.get(instrument, 20000))
        # Random walk: ±0.05% per tick
        change_pct = random.uniform(-0.0005, 0.0005)
        new_price = round(base * (1 + change_pct), 2)
        _current_prices[instrument] = new_price
        return new_price

    def get_ltp(self, instrument: str, strike: int, option_type: str, expiry: str) -> float:
        """Generate a realistic option LTP based on moneyness."""
        spot = self.get_spot_price(instrument)
        moneyness = spot - strike if option_type == "CE" else strike - spot

        if moneyness > 500:
            base_ltp = random.uniform(400, 600)
        elif moneyness > 200:
            base_ltp = random.uniform(150, 350)
        elif moneyness > 0:
            base_ltp = random.uniform(50, 150)
        elif moneyness > -200:
            base_ltp = random.uniform(10, 50)
        else:
            base_ltp = random.uniform(0.5, 10)

        # Small tick noise
        noise = random.uniform(-2, 2)
        return round(max(0.05, base_ltp + noise), 2)

    def get_option_chain(self, instrument: str, expiry: str = None) -> dict:
        """Generate a full 20-strike mock option chain."""
        spot = self.get_spot_price(instrument)
        lot_size = LOT_SIZES.get(instrument, 50)

        # Round spot to nearest strike interval
        interval = self._get_strike_interval(instrument)
        atm_strike = round(spot / interval) * interval

        # Generate 10 strikes above and below ATM
        strike_range = range(
            atm_strike - (10 * interval),
            atm_strike + (11 * interval),
            interval,
        )

        strikes = []
        total_ce_oi = 0
        total_pe_oi = 0

        for strike in strike_range:
            ce_ltp = self._option_price(spot, strike, "CE")
            pe_ltp = self._option_price(spot, strike, "PE")
            ce_oi  = random.randint(50000, 5000000)
            pe_oi  = random.randint(50000, 5000000)
            total_ce_oi += ce_oi
            total_pe_oi += pe_oi

            strikes.append({
                "strike": strike,
                "ce": {
                    "ltp":    ce_ltp,
                    "oi":     ce_oi,
                    "volume": random.randint(1000, 100000),
                    "iv":     round(random.uniform(10, 25), 2),
                    "bid":    round(ce_ltp - 0.5, 2),
                    "ask":    round(ce_ltp + 0.5, 2),
                    "delta":  round(random.uniform(0.1, 0.9), 2),
                },
                "pe": {
                    "ltp":    pe_ltp,
                    "oi":     pe_oi,
                    "volume": random.randint(1000, 100000),
                    "iv":     round(random.uniform(10, 25), 2),
                    "bid":    round(pe_ltp - 0.5, 2),
                    "ask":    round(pe_ltp + 0.5, 2),
                    "delta":  round(random.uniform(-0.9, -0.1), 2),
                },
            })

        pcr = round(total_pe_oi / total_ce_oi, 2) if total_ce_oi > 0 else 1.0

        return {
            "instrument":  instrument,
            "spot_price":  spot,
            "atm_strike":  atm_strike,
            "expiry":      expiry or self._nearest_expiry(),
            "timestamp":   datetime.now().isoformat(),
            "pcr":         pcr,
            "lot_size":    lot_size,
            "strikes":     strikes,
        }

    # ── Private helpers ───────────────────────────────────────

    def _option_price(self, spot: float, strike: int, option_type: str) -> float:
        """Simplified option price based on intrinsic + time value."""
        if option_type == "CE":
            intrinsic = max(0, spot - strike)
        else:
            intrinsic = max(0, strike - spot)

        # Time value decreases as we go further OTM
        distance = abs(spot - strike)
        time_value = max(0.5, 50 - (distance / spot * 1000))
        time_value += random.uniform(-5, 5)

        ltp = round(intrinsic + max(0.5, time_value), 2)
        return ltp

    def _get_strike_interval(self, instrument: str) -> int:
        """Strike price intervals per instrument."""
        return {"NIFTY": 50, "BANKNIFTY": 100, "SENSEX": 100}.get(instrument, 50)

    def _nearest_expiry(self) -> str:
        """Return the nearest Thursday (weekly expiry for NIFTY)."""
        today = date.today()
        days_until_thursday = (3 - today.weekday()) % 7
        if days_until_thursday == 0:
            days_until_thursday = 7
        expiry = today.replace(
            day=today.day + days_until_thursday
        )
        return expiry.strftime("%Y-%m-%d")