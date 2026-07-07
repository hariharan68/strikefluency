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
LOT_SIZES = {
    Instrument.NIFTY:     65,
    Instrument.BANKNIFTY: 30,
    Instrument.SENSEX:    20,
}


# ── Market hours (IST) ────────────────────────────────────────
MARKET_OPEN_HOUR   = 9
MARKET_OPEN_MINUTE = 15
MARKET_CLOSE_HOUR   = 15
MARKET_CLOSE_MINUTE = 30

# EOD square-off happens 1 minute before market close
EOD_SQUAREOFF_HOUR   = 15
EOD_SQUAREOFF_MINUTE = 29


# ── Discipline scoring ────────────────────────────────────────
DISCIPLINE_SCORE_WINDOW = 20   # rolling window of last N trades


# ── User roles ────────────────────────────────────────────────
class UserRole:
    TRADER       = "trader"
    TENANT_ADMIN = "tenant_admin"
    SUPER_ADMIN  = "super_admin"