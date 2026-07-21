"""
app/core/constants.py
──────────────────────
All magic strings and numbers in one place.
Import from here — never hardcode these in service files.
"""


# ── Instruments ───────────────────────────────────────────────
class Instrument:
    NIFTY = "NIFTY"
    BANKNIFTY = "BANKNIFTY"
    SENSEX = "SENSEX"
    ALL = [NIFTY, BANKNIFTY, SENSEX]


# ── Option types ──────────────────────────────────────────────
class OptionType:
    CE = "CE"
    PE = "PE"


# ── Leg instrument types (Strategy Builder) ───────────────────
# Superset of OptionType: a strategy leg may also be a futures leg
# (synthetic futures, range forward, risk reversal).
class LegInstrumentType:
    CE = "CE"
    PE = "PE"
    FUT = "FUT"
    ALL = [CE, PE, FUT]
    OPTIONS = [CE, PE]


# ── Order actions ─────────────────────────────────────────────
class OrderAction:
    BUY = "BUY"
    SELL = "SELL"


# ── Order status ──────────────────────────────────────────────
class OrderStatus:
    OPEN = "OPEN"
    CLOSED = "CLOSED"
    CANCELLED = "CANCELLED"
    SL_HIT = "SL_HIT"
    TARGET_HIT = "TARGET_HIT"


# ── Exit reasons ──────────────────────────────────────────────
class ExitReason:
    MANUAL = "MANUAL"
    SL_HIT = "SL_HIT"
    TARGET_HIT = "TARGET_HIT"
    EOD_SQUAREOFF = "EOD_SQUAREOFF"


# ── Product type ─────────────────────────────────────────────
# INTRADAY positions are auto-squared-off at EOD (15:29 IST). NRML positions
# carry forward across trading days until manually closed or expiry-settled.
class ProductType:
    INTRADAY = "INTRADAY"
    NRML = "NRML"
    ALL = [INTRADAY, NRML]


# ── Setup tags (required on every order) ─────────────────────
class SetupTag:
    OI_BASED = "OI_BASED"
    PRICE_ACTION = "PRICE_ACTION"
    LEVEL_TRADE = "LEVEL_TRADE"
    EXPIRY_PLAY = "EXPIRY_PLAY"
    OTHER = "OTHER"
    ALL = [OI_BASED, PRICE_ACTION, LEVEL_TRADE, EXPIRY_PLAY, OTHER]


# ── Emotion tags (journal, user-added) ────────────────────────
class EmotionTag:
    CONFIDENT = "CONFIDENT"
    FEARFUL = "FEARFUL"
    GREEDY = "GREEDY"
    CALM = "CALM"
    IMPATIENT = "IMPATIENT"
    FOMO = "FOMO"


# ── Mistake categories (journal, user-added) ──────────────────
class MistakeCategory:
    EARLY_EXIT = "EARLY_EXIT"
    SL_TOO_TIGHT = "SL_TOO_TIGHT"
    IGNORED_LEVEL = "IGNORED_LEVEL"
    FOMO_ENTRY = "FOMO_ENTRY"
    OVERSIZE = "OVERSIZE"
    NONE = "NONE"


# ── Capital tiers ─────────────────────────────────────────────
class Tier:
    TIER_1 = "TIER_1"   # ₹1,00,000
    TIER_2 = "TIER_2"   # ₹5,00,000
    TIER_3 = "TIER_3"   # ₹10,00,000

TIER_CAPITALS = {
    Tier.TIER_1: 100_000,
    Tier.TIER_2: 500_000,
    Tier.TIER_3: 1_000_000,
}

# Consecutive disciplined trades needed to unlock next tier
TIER_UNLOCK_STREAK = 15

# Full sandbox capital granted when Discipline Mode is switched OFF (free-play).
FULL_SANDBOX_CAPITAL = TIER_CAPITALS[Tier.TIER_3]   # ₹10,00,000


# ── Discipline rule codes ─────────────────────────────────────
class DisciplineRuleCode:
    MAX_TRADES_PER_DAY  = "MAX_TRADES_PER_DAY"
    MANDATORY_SL        = "MANDATORY_SL"
    NO_AVERAGING_DOWN   = "NO_AVERAGING_DOWN"
    NO_DIRECTION_FLIP   = "NO_DIRECTION_FLIP"
    REVENGE_COOLDOWN    = "REVENGE_COOLDOWN"
    MAX_DAILY_LOSS      = "MAX_DAILY_LOSS"
    MANDATORY_SETUP_TAG = "MANDATORY_SETUP_TAG"
    ALL = [
        MAX_TRADES_PER_DAY, MANDATORY_SL, NO_AVERAGING_DOWN,
        NO_DIRECTION_FLIP, REVENGE_COOLDOWN, MAX_DAILY_LOSS,
        MANDATORY_SETUP_TAG,
    ]


# ── Default discipline rule values ────────────────────────────
# Seeded for every new user on registration
DEFAULT_DISCIPLINE_RULES = {
    DisciplineRuleCode.MAX_TRADES_PER_DAY:  {"max_trades": 3},
    DisciplineRuleCode.MANDATORY_SL:        {"enabled": True},
    DisciplineRuleCode.NO_AVERAGING_DOWN:   {"enabled": True},
    DisciplineRuleCode.NO_DIRECTION_FLIP:   {"enabled": True},
    DisciplineRuleCode.REVENGE_COOLDOWN:    {"cooldown_minutes": 15},
    DisciplineRuleCode.MAX_DAILY_LOSS:      {"loss_pct": 2.0},
    DisciplineRuleCode.MANDATORY_SETUP_TAG: {"enabled": True},
}


# ── Lot sizes ─────────────────────────────────────────────────
# DEPRECATED — derived from app/core/instruments.py, the single source of truth.
# Kept only so existing imports keep working; new code should call
# instruments.get_spec(symbol).lot_size instead.
#
# Never reintroduce a literal here. This dict previously declared its own values
# while config.py, fyers_provider.py and mock_provider.py each declared theirs,
# and they drifted apart (NIFTY was 50 in some paths and 65 in others).
#
# Note the behaviour difference: LOT_SIZES.get(x, 50) silently invents a lot
# size for an unknown instrument; get_spec(x) raises. Prefer get_spec.
from app.core.instruments import INSTRUMENTS as _INSTRUMENTS

LOT_SIZES = {symbol: spec.lot_size for symbol, spec in _INSTRUMENTS.items()}


# ── Market hours (IST) ────────────────────────────────────────
MARKET_OPEN_HOUR   = 9
MARKET_OPEN_MINUTE = 15
MARKET_CLOSE_HOUR   = 15
MARKET_CLOSE_MINUTE = 30

# EOD square-off happens 1 minute before market close
EOD_SQUAREOFF_HOUR   = 15
EOD_SQUAREOFF_MINUTE = 29

# Pre-market reset / new-trading-day boundary. Orders placed on/after this time
# belong to the new trading day; before it they belong to the previous day. The
# orderbook/tradebook views scope to the current trading day, so they appear
# fresh each morning. A safety-net square-off job also runs at this time.
PRE_MARKET_RESET_HOUR   = 8
PRE_MARKET_RESET_MINUTE = 30


# ── Order margin ──────────────────────────────────────────────
# Leverage applied to single-leg order margin when the user's leverage_enabled
# setting is ON: margin = contract value / LEVERAGE_MULTIPLIER. When OFF the
# divisor is 1 (full contract value is blocked from the sandbox funds).
LEVERAGE_MULTIPLIER = 5


# ── Discipline scoring ────────────────────────────────────────
DISCIPLINE_SCORE_WINDOW = 20   # rolling window of last N trades


# ── Strategy Builder ──────────────────────────────────────────
class StrategyStatus:
    DRAFT    = "DRAFT"      # editable, no capital committed
    EXECUTED = "EXECUTED"   # legs filled, margin blocked, position live
    CLOSED   = "CLOSED"     # all legs squared off, margin released
    ALL = [DRAFT, EXECUTED, CLOSED]


class LegStatus:
    PENDING = "PENDING"     # part of a draft, never filled
    OPEN    = "OPEN"        # filled and live
    CLOSED  = "CLOSED"      # squared off (supports partial exits)
    ALL = [PENDING, OPEN, CLOSED]


# Drives the Bullish / Bearish / Neutral / Other filter tabs in the UI.
class StrategyCategory:
    BULLISH = "BULLISH"
    BEARISH = "BEARISH"
    NEUTRAL = "NEUTRAL"
    OTHER   = "OTHER"
    ALL = [BULLISH, BEARISH, NEUTRAL, OTHER]


# A strategy counts as ONE trade against the discipline rules, no matter how
# many legs it has. Leg-level rules (NO_DIRECTION_FLIP, NO_AVERAGING_DOWN) are
# meaningless for multi-leg structures — an iron condor is deliberately both
# directions at once — so they are skipped for strategy execution.
STRATEGY_DISCIPLINE_RULES = [
    DisciplineRuleCode.MAX_TRADES_PER_DAY,
    DisciplineRuleCode.MAX_DAILY_LOSS,
    DisciplineRuleCode.MANDATORY_SETUP_TAG,
]

# Hard ceiling on legs per strategy. Configurable, but keep it sane — margin
# benefit maths and the payoff grid both get expensive past this.
MAX_STRATEGY_LEGS = 10


# ── User roles ────────────────────────────────────────────────
class UserRole:
    TRADER       = "trader"
    TENANT_ADMIN = "tenant_admin"
    SUPER_ADMIN  = "super_admin"