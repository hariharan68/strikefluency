"""
app/services/discipline_engine.py
───────────────────────────────────
The core differentiator of StrikeFluency.

Runs synchronously before EVERY order is accepted.
If any active rule is violated → order is BLOCKED.
All violations are logged to discipline_violations table.

7 Rules (from SRS):
  1. MAX_TRADES_PER_DAY    → max 3 trades per day
  2. MANDATORY_SL          → SL price is required on every order
  3. NO_AVERAGING_DOWN     → cannot add to a losing position
  4. NO_DIRECTION_FLIP     → cannot trade CE and PE simultaneously
  5. REVENGE_COOLDOWN      → 15-min block after SL hit
  6. MAX_DAILY_LOSS        → stop trading after 2% daily loss
  7. MANDATORY_SETUP_TAG   → must tag every trade with a setup type

Usage:
    engine = DisciplineEngine(db, user)
    engine.check_order(order_request, session, positions)
    # Raises DisciplineViolationError if any rule fails
    # Returns silently if all rules pass
"""

import logging
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.constants import DisciplineRuleCode, OrderStatus
from app.core.exceptions import DisciplineViolationError
from app.models.discipline_rule import DisciplineRule
from app.models.discipline_violation import DisciplineViolation
from app.models.trading_session import TradingSession
from app.models.user import User
from app.models.virtual_account import VirtualAccount
from app.models.virtual_position import VirtualPosition
from app.services.trading_session_service import (
    check_and_reset_cooldown,
    get_cooldown_remaining,
)

logger = logging.getLogger(__name__)


class DisciplineEngine:

    def __init__(self, db: Session, user: User):
        self.db = db
        self.user = user
        self._rules = self._load_rules()

    def _load_rules(self) -> dict:
        """Load all active discipline rules for this user."""
        rules = self.db.query(DisciplineRule).filter(
            DisciplineRule.user_id == self.user.id,
            DisciplineRule.is_active == True,
        ).all()
        return {rule.rule_code: rule.rule_value for rule in rules}

    def check_order(
        self,
        order_data: dict,
        session: TradingSession,
        account: VirtualAccount,
        open_positions: list[VirtualPosition],
    ) -> None:
        """
        Run all 7 discipline rules against the incoming order.
        Raises DisciplineViolationError on the FIRST rule that fails.
        Logs every violation attempt to the DB.

        Args:
            order_data     : dict with keys: strike_price, option_type,
                             action, sl_price, setup_tag, quantity
            session        : today's TradingSession
            account        : user's VirtualAccount
            open_positions : list of currently open VirtualPosition records

        Raises:
            DisciplineViolationError with rule_code and message
        """
        checks = [
            self._check_mandatory_sl,
            self._check_mandatory_setup_tag,
            self._check_max_trades_per_day,
            self._check_max_daily_loss,
            self._check_revenge_cooldown,
            self._check_no_averaging_down,
            self._check_no_direction_flip,
        ]

        for check in checks:
            try:
                check(order_data, session, account, open_positions)
            except DisciplineViolationError as e:
                # Log the violation before re-raising
                self._log_violation(e.rule_code, order_data, was_blocked=True)
                raise

    # ── Rule implementations ──────────────────────────────────

    def _check_mandatory_sl(self, order_data, session, account, positions):
        """Rule 2 — Every order must have a valid SL price."""
        rule = self._rules.get(DisciplineRuleCode.MANDATORY_SL, {})
        if not rule.get("enabled", True):
            return

        sl_price = order_data.get("sl_price")

        if sl_price is None:
            raise DisciplineViolationError(
                rule_code=DisciplineRuleCode.MANDATORY_SL,
                message="Stop Loss (SL) is mandatory. Set an SL before placing this order.",
            )

        sl_price  = Decimal(str(sl_price))
        ltp       = Decimal(str(order_data.get("ltp", 0)))
        action    = order_data.get("action", "BUY")

        # SL must be on the correct side
        if action == "BUY" and sl_price >= ltp:
            raise DisciplineViolationError(
                rule_code=DisciplineRuleCode.MANDATORY_SL,
                message=f"For a BUY order, SL ({sl_price}) must be below LTP ({ltp}).",
            )
        if action == "SELL" and sl_price <= ltp:
            raise DisciplineViolationError(
                rule_code=DisciplineRuleCode.MANDATORY_SL,
                message=f"For a SELL order, SL ({sl_price}) must be above LTP ({ltp}).",
            )

    def _check_mandatory_setup_tag(self, order_data, session, account, positions):
        """Rule 7 — Every order must have a setup tag."""
        rule = self._rules.get(DisciplineRuleCode.MANDATORY_SETUP_TAG, {})
        if not rule.get("enabled", True):
            return

        setup_tag = order_data.get("setup_tag")
        if not setup_tag or not setup_tag.strip():
            raise DisciplineViolationError(
                rule_code=DisciplineRuleCode.MANDATORY_SETUP_TAG,
                message="Setup tag is required. What is your trade thesis? (OI_BASED, PRICE_ACTION, LEVEL_TRADE, EXPIRY_PLAY, OTHER)",
            )

    def _check_max_trades_per_day(self, order_data, session, account, positions):
        """Rule 1 — Max N trades per day."""
        rule = self._rules.get(DisciplineRuleCode.MAX_TRADES_PER_DAY, {})
        max_trades = rule.get("max_trades", 3)

        if session.trades_count >= max_trades:
            raise DisciplineViolationError(
                rule_code=DisciplineRuleCode.MAX_TRADES_PER_DAY,
                message=f"Daily trade limit reached. You have placed {session.trades_count}/{max_trades} trades today. Come back tomorrow.",
            )

    def _check_max_daily_loss(self, order_data, session, account, positions):
        """Rule 6 — Stop trading after max daily loss cap."""
        rule = self._rules.get(DisciplineRuleCode.MAX_DAILY_LOSS, {})
        loss_pct = Decimal(str(rule.get("loss_pct", 2.0)))

        max_loss = (account.initial_balance * loss_pct / 100).quantize(Decimal("0.01"))
        current_loss = session.realized_pnl  # negative if net loss

        if current_loss <= -max_loss:
            raise DisciplineViolationError(
                rule_code=DisciplineRuleCode.MAX_DAILY_LOSS,
                message=f"Daily loss limit reached (₹{max_loss}). Today's P&L: ₹{current_loss}. Stop trading and review your journal.",
            )

    def _check_revenge_cooldown(self, order_data, session, account, positions):
        """Rule 5 — 15-minute cooldown after SL hit."""
        rule = self._rules.get(DisciplineRuleCode.REVENGE_COOLDOWN, {})
        if not rule.get("cooldown_minutes", 15):
            return

        still_in_cooldown = check_and_reset_cooldown(session)
        if still_in_cooldown:
            remaining = get_cooldown_remaining(session)
            minutes = remaining // 60
            seconds = remaining % 60
            raise DisciplineViolationError(
                rule_code=DisciplineRuleCode.REVENGE_COOLDOWN,
                message=f"Revenge trading cooldown active. Wait {minutes}m {seconds}s before placing a new order. Use this time to review your last trade.",
            )

    def _check_no_averaging_down(self, order_data, session, account, positions):
        """Rule 3 — Cannot add to an existing open position (same strike + type)."""
        rule = self._rules.get(DisciplineRuleCode.NO_AVERAGING_DOWN, {})
        if not rule.get("enabled", True):
            return

        if order_data.get("action") != "BUY":
            return  # Only applies to BUY orders

        strike      = order_data.get("strike_price")
        option_type = order_data.get("option_type")
        instrument  = order_data.get("instrument", "NIFTY")

        for pos in positions:
            if (
                pos.is_open
                and pos.strike_price == Decimal(str(strike))
                and pos.option_type == option_type
                and pos.instrument == instrument
            ):
                raise DisciplineViolationError(
                    rule_code=DisciplineRuleCode.NO_AVERAGING_DOWN,
                    message=f"Averaging down is not allowed. You already have an open position in {instrument} {strike} {option_type}. Close it first.",
                )

    def _check_no_direction_flip(self, order_data, session, account, positions):
        """Rule 4 — Cannot hold CE and PE positions simultaneously."""
        rule = self._rules.get(DisciplineRuleCode.NO_DIRECTION_FLIP, {})
        if not rule.get("enabled", True):
            return

        if order_data.get("action") != "BUY":
            return

        new_option_type = order_data.get("option_type")

        for pos in positions:
            if pos.is_open and pos.option_type != new_option_type:
                existing_type = pos.option_type
                raise DisciplineViolationError(
                    rule_code=DisciplineRuleCode.NO_DIRECTION_FLIP,
                    message=f"Direction flip not allowed. You have an open {existing_type} position. Close it before opening a {new_option_type}.",
                )

    # ── Violation logging ─────────────────────────────────────

    def _log_violation(
        self, rule_code: str, order_data: dict, was_blocked: bool
    ) -> None:
        """Save violation record to DB. Never raises — logging must not crash the app."""
        try:
            violation = DisciplineViolation(
                user_id=self.user.id,
                tenant_id=self.user.tenant_id,
                rule_code=rule_code,
                attempted_action=order_data,
                was_blocked=was_blocked,
            )
            self.db.add(violation)
        except Exception as e:
            logger.error(f"Failed to log discipline violation: {e}")

    def update_discipline_score(
        self, account: VirtualAccount, was_compliant: bool
    ) -> None:
        from app.core.constants import DISCIPLINE_SCORE_WINDOW
        from app.models.virtual_order import VirtualOrder

        if was_compliant:
            account.consecutive_disciplined_trades += 1
        else:
            account.consecutive_disciplined_trades = 0

        recent_orders = (
            self.db.query(VirtualOrder.is_discipline_compliant)
            .filter(
                VirtualOrder.user_id == self.user.id,
                VirtualOrder.status != "OPEN",
                VirtualOrder.was_free_play == False,
            )
            .order_by(VirtualOrder.created_at.desc())
            .limit(DISCIPLINE_SCORE_WINDOW)
            .all()
        )

        if recent_orders:
            compliant = sum(1 for r in recent_orders if r[0])
            total = len(recent_orders)
            account.discipline_score = Decimal(
                str(round(compliant / total * 100, 2))
            )