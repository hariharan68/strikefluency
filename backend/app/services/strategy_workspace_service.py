"""Rich, non-persisting Strategy Builder analysis and workspace persistence."""

from __future__ import annotations

import json
import math
import uuid
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from app.core.constants import LegInstrumentType
from app.core.instruments import get_spec
from app.market.provider_factory import get_market_provider
from app.models.strategy import StrategyPosition as StrategyPositionORM
from app.models.strategy_builder_configuration import StrategyBuilderConfiguration
from app.models.virtual_account import VirtualAccount
from app.models.virtual_position import VirtualPosition
from app.schemas.strategy import (
    BuilderConfigurationCreate,
    BuilderConfigurationUpdate,
    SimulateStrategyRequest,
)
from app.services.brokerage_calculator import calculate_brokerage
from app.strategy import builder
from app.strategy.domain import OptionContract, Strategy
from app.strategy.greeks import (
    RISK_FREE_RATE,
    black_scholes,
    contract_greeks,
    years_to_expiry,
)
from app.strategy.margin import estimate_margin
from app.strategy.payoff import find_breakevens

MAX_CONFIG_BYTES = 128_000


def _validate_state_size(state: dict) -> None:
    if len(json.dumps(state, separators=(",", ":")).encode("utf-8")) > MAX_CONFIG_BYTES:
        raise ValueError("Strategy Builder state is too large")


def create_configuration(
    db: Session, user, body: BuilderConfigurationCreate
) -> StrategyBuilderConfiguration:
    _validate_state_size(body.state)
    row = StrategyBuilderConfiguration(
        id=uuid.uuid4(),
        user_id=user.id,
        tenant_id=user.tenant_id,
        kind=body.kind,
        name=(body.name or "").strip() or None,
        underlying=body.underlying,
        schema_version=body.schema_version,
        state=body.state,
    )
    db.add(row)
    db.flush()
    return row


def list_configurations(
    db: Session, user, kind: Optional[str] = None
) -> list[StrategyBuilderConfiguration]:
    query = db.query(StrategyBuilderConfiguration).filter(
        StrategyBuilderConfiguration.user_id == user.id,
        StrategyBuilderConfiguration.tenant_id == user.tenant_id,
    )
    if kind:
        query = query.filter(StrategyBuilderConfiguration.kind == kind)
    return query.order_by(StrategyBuilderConfiguration.updated_at.desc()).all()


def get_configuration(
    db: Session, user, configuration_id: uuid.UUID
) -> StrategyBuilderConfiguration:
    row = db.query(StrategyBuilderConfiguration).filter(
        StrategyBuilderConfiguration.id == configuration_id,
        StrategyBuilderConfiguration.user_id == user.id,
        StrategyBuilderConfiguration.tenant_id == user.tenant_id,
    ).first()
    if row is None:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Strategy configuration not found")
    return row


def update_configuration(
    db: Session,
    user,
    configuration_id: uuid.UUID,
    body: BuilderConfigurationUpdate,
) -> StrategyBuilderConfiguration:
    row = get_configuration(db, user, configuration_id)
    values = body.model_dump(exclude_unset=True)
    if "state" in values:
        _validate_state_size(values["state"])
    if "name" in values:
        values["name"] = (values["name"] or "").strip() or None
        if row.kind == "SAVED" and not values["name"]:
            raise ValueError("Saved strategies require a name")
    for key, value in values.items():
        setattr(row, key, value)
    db.flush()
    return row


def delete_configuration(db: Session, user, configuration_id: uuid.UUID) -> None:
    db.delete(get_configuration(db, user, configuration_id))
    db.flush()


def _entry_price(item, provider, underlying: str) -> tuple[float, list[str]]:
    warnings: list[str] = []
    if item.entry_price is not None:
        return float(item.entry_price), warnings
    if item.live_ltp is not None:
        return float(item.live_ltp), warnings
    if item.instrument_type == LegInstrumentType.FUT:
        return float(provider.get_spot_price(underlying)), warnings
    try:
        return float(
            provider.get_ltp(
                underlying,
                int(item.strike),
                item.instrument_type,
                item.expiry.isoformat(),
            )
        ), warnings
    except Exception:
        warnings.append(
            f"{item.expiry} {item.strike:g} {item.instrument_type} has no usable quote."
        )
        return 0.0, warnings


def _make_domain(body: SimulateStrategyRequest) -> tuple[Strategy, list, list[str]]:
    provider = get_market_provider()
    domain = Strategy(underlying=body.underlying, allow_calendar=True)
    included = [item for item in body.legs if item.included]
    warnings: list[str] = []
    for item in included:
        entry, leg_warnings = _entry_price(item, provider, body.underlying)
        warnings.extend(leg_warnings)
        iv_pct = item.iv_override if item.iv_override is not None else item.iv
        if item.instrument_type != LegInstrumentType.FUT and not iv_pct:
            iv_pct = 18.0
            warnings.append(
                f"{item.strike:g} {item.instrument_type} uses an 18% modelled IV."
            )
        contract = OptionContract(
            underlying=body.underlying,
            expiry=item.expiry,
            instrument_type=item.instrument_type,
            strike=item.strike,
            ltp=entry,
            iv=(float(iv_pct) / 100.0) if iv_pct else None,
        )
        leg = builder.make_leg(
            body.underlying,
            item.instrument_type,
            item.action,
            item.lots * body.multiplier,
            item.expiry,
            strike=item.strike,
            entry_price=entry,
            contract=contract,
        )
        builder.add_leg(domain, leg)
    return domain, included, warnings


def _contract_value(contract: OptionContract, underlying_price: float, as_of: date) -> float:
    if contract.instrument_type == LegInstrumentType.FUT:
        return underlying_price
    if as_of >= contract.expiry:
        if contract.instrument_type == LegInstrumentType.CE:
            return max(underlying_price - float(contract.strike), 0.0)
        return max(float(contract.strike) - underlying_price, 0.0)
    iv = contract.iv or 0.18
    return black_scholes(
        underlying_price,
        float(contract.strike),
        years_to_expiry(contract.expiry, as_of),
        iv,
        contract.instrument_type,
    ).price


def _strategy_pnl(domain: Strategy, underlying_price: float, as_of: date) -> float:
    total = 0.0
    for leg in domain.legs:
        value = _contract_value(leg.contract, underlying_price, as_of)
        total += leg.sign * (value - float(leg.entry_price or 0.0)) * leg.quantity
    return round(total, 2)


def _curve_prices(domain: Strategy, spot: float, points: int = 101) -> list[float]:
    strikes = [
        float(leg.contract.strike)
        for leg in domain.legs
        if leg.contract.strike is not None
    ]
    low = max(1.0, spot * 0.88)
    high = spot * 1.12
    step = (high - low) / (points - 1)
    values = {round(low + index * step, 2) for index in range(points)}
    values.update(strikes)
    values.add(round(spot, 2))
    return sorted(values)


def _charges(domain: Strategy) -> dict:
    fields = ("flat_brokerage", "stt", "exchange_charges", "sebi_charges", "gst", "total")
    totals = {field: Decimal("0") for field in fields}
    for leg in domain.legs:
        item = calculate_brokerage(
            Decimal(str(leg.entry_price or 0)),
            leg.lots,
            leg.lot_size,
            leg.action,
        )
        for field in fields:
            totals[field] += getattr(item, field)
    return {key: float(value.quantize(Decimal("0.01"))) for key, value in totals.items()}


def _booked_pnl(db: Session, user) -> float:
    single = db.query(VirtualPosition).filter(
        VirtualPosition.user_id == user.id,
        VirtualPosition.is_open.is_(True),
    ).all()
    strategies = db.query(StrategyPositionORM).filter(
        StrategyPositionORM.user_id == user.id,
        StrategyPositionORM.is_open.is_(True),
    ).all()
    return round(
        sum(float(row.unrealized_pnl or 0) for row in single)
        + sum(
            float(row.unrealized_pnl or 0) + float(row.realized_pnl or 0)
            for row in strategies
        ),
        2,
    )


def _probability_of_profit(
    prices: list[float],
    pnls: list[float],
    spot: float,
    iv: float,
    t_years: float,
) -> Optional[float]:
    sd = spot * iv * math.sqrt(max(t_years, 0.0))
    if sd <= 0 or len(prices) < 2:
        return None

    def pdf(value: float) -> float:
        z = (value - spot) / sd
        return math.exp(-0.5 * z * z) / (sd * math.sqrt(2 * math.pi))

    total = profitable = 0.0
    for index in range(len(prices) - 1):
        width = prices[index + 1] - prices[index]
        mass = (pdf(prices[index]) + pdf(prices[index + 1])) * 0.5 * width
        total += mass
        if pnls[index] > 0 or pnls[index + 1] > 0:
            profitable += mass
    return round(profitable / total * 100, 1) if total else None


def _risk_extrema(prices: list[float], pnls: list[float]) -> tuple[Optional[float], Optional[float]]:
    if not pnls:
        return None, None
    left_slope = pnls[1] - pnls[0] if len(pnls) > 1 else 0
    right_slope = pnls[-1] - pnls[-2] if len(pnls) > 1 else 0
    max_profit = None if right_slope > 0.01 or left_slope < -0.01 else max(pnls)
    max_loss = None if right_slope < -0.01 or left_slope > 0.01 else min(pnls)
    return max_profit, max_loss


def simulate(db: Session, user, body: SimulateStrategyRequest) -> dict:
    if not any(leg.included for leg in body.legs):
        return {
            "revision": body.revision,
            "empty": True,
            "warnings": [],
        }

    domain, source_legs, warnings = _make_domain(body)
    provider = get_market_provider()
    spot = float(body.spot or provider.get_spot_price(body.underlying))
    today = date.today()
    expiry_date = min(leg.contract.expiry for leg in domain.legs)
    target_date = body.target_at.date() if body.target_at else today
    target_date = max(today, min(target_date, expiry_date))
    target_price = float(body.target_price or spot)

    prices = _curve_prices(domain, spot)
    expiry_pnls = [_strategy_pnl(domain, value, expiry_date) for value in prices]
    target_pnls = [_strategy_pnl(domain, value, target_date) for value in prices]
    max_profit, max_loss = _risk_extrema(prices, expiry_pnls)
    expiry_breakevens = find_breakevens(prices, expiry_pnls)
    target_breakevens = find_breakevens(prices, target_pnls)

    ivs = [
        leg.contract.iv
        for leg in domain.legs
        if leg.contract.iv and not leg.contract.is_future
    ]
    average_iv = sum(ivs) / len(ivs) if ivs else 0.18
    pop = _probability_of_profit(
        prices,
        expiry_pnls,
        spot,
        average_iv,
        years_to_expiry(expiry_date, today),
    )

    charge_values = _charges(domain)
    margin = estimate_margin(domain, spot)
    account = db.query(VirtualAccount).filter(VirtualAccount.user_id == user.id).first()
    available = float(account.balance) if account else 0.0
    net_cashflow = float(domain.net_premium or 0.0)
    debit = max(0.0, -net_cashflow)
    funds_needed = max(margin.total, debit) + charge_values["total"]

    pnl_rows = []
    greek_rows = []
    intrinsic_value = 0.0
    current_value = 0.0
    for source, leg in zip(source_legs, domain.legs):
        target_value = _contract_value(leg.contract, target_price, target_date)
        current_model = _contract_value(leg.contract, spot, today)
        intrinsic = _contract_value(leg.contract, spot, leg.contract.expiry)
        target_pnl = leg.sign * (target_value - float(leg.entry_price or 0)) * leg.quantity
        decay = leg.sign * (
            _contract_value(leg.contract, spot, target_date) - current_model
        ) * leg.quantity
        try:
            greeks = contract_greeks(leg.contract, spot, today).scaled(
                leg.signed_quantity
            )
        except Exception:
            greeks = None
        pnl_rows.append(
            {
                "client_id": source.client_id,
                "instrument": leg.label(),
                "target_pnl": round(target_pnl, 2),
                "target_price": round(target_value, 2),
                "entry_price": round(float(leg.entry_price or 0), 2),
                "ltp": round(float(source.live_ltp or leg.entry_price or 0), 2),
            }
        )
        greek_rows.append(
            {
                "client_id": source.client_id,
                "instrument": leg.label(),
                "delta": round(greeks.delta, 4) if greeks else 0,
                "theta": round(greeks.theta, 4) if greeks else 0,
                "decay": round(decay, 2),
                "gamma": round(greeks.gamma, 6) if greeks else 0,
                "vega": round(greeks.vega, 4) if greeks else 0,
            }
        )
        current_value += leg.sign * current_model * leg.quantity
        intrinsic_value += leg.sign * intrinsic * leg.quantity

    greek_total = {
        key: round(sum(row[key] for row in greek_rows), 4)
        for key in ("delta", "theta", "decay", "gamma", "vega")
    }

    booked = _booked_pnl(db, user) if body.include_booked_pnl else 0.0
    manual = body.manual_pnl if body.include_manual_pnl else 0.0
    overlay = booked + manual
    projected = _strategy_pnl(domain, target_price, target_date) + overlay
    projected_pct = projected / funds_needed * 100 if funds_needed else 0.0

    if max_loss is None:
        warnings.append("Unlimited downside: at least one loss tail is not capped.")
    if greek_total["theta"] < 0:
        warnings.append("Theta decay is working against this strategy.")
    if target_date.weekday() >= 5 and greek_total["theta"] < 0:
        warnings.append("Weekend theta bleed may reduce the strategy value.")
    if pop is not None and pop < 35:
        warnings.append("Probability of profit is below 35% at the current IV.")

    interval = get_spec(body.underlying).strike_interval
    table_prices = [
        float(value)
        for value in range(
            int(spot * 0.9 // interval * interval),
            int(spot * 1.1 // interval * interval) + interval,
            interval,
        )
    ]
    if not any(abs(value - spot) < 0.01 for value in table_prices):
        table_prices.append(round(spot, 2))
        table_prices.sort()
    payoff_table = [
        {
            "target": value,
            "target_pnl": _strategy_pnl(domain, value, target_date) + overlay,
            "expiry_pnl": _strategy_pnl(domain, value, expiry_date) + overlay,
            "is_spot": abs(value - spot) < 0.01,
        }
        for value in table_prices
    ]

    sd_points = spot * average_iv * math.sqrt(max(years_to_expiry(expiry_date, today), 0))
    reward_risk = (
        round(max_profit / abs(max_loss), 2)
        if max_profit is not None and max_loss not in (None, 0)
        else None
    )
    net_price = sum(
        (1 if leg.action == "BUY" else -1)
        * float(leg.entry_price or 0)
        * leg.lots
        for leg in domain.legs
    )

    return {
        "revision": body.revision,
        "empty": False,
        "snapshot": {
            "as_of": datetime.now(timezone.utc).isoformat(),
            "underlying": body.underlying,
            "spot": round(spot, 2),
            "target_price": round(target_price, 2),
            "target_date": target_date.isoformat(),
            "expiry_date": expiry_date.isoformat(),
            "lot_size": get_spec(body.underlying).lot_size,
            "multiplier": body.multiplier,
        },
        "pricing": {
            "net_price": round(net_price, 2),
            "net_cashflow": round(net_cashflow, 2),
            "direction": "RECEIVE" if net_cashflow >= 0 else "PAY",
            "charges": charge_values,
        },
        "metrics": {
            "max_profit": max_profit,
            "max_loss": max_loss,
            "reward_risk": reward_risk,
            "pop": pop,
            "breakevens": {
                "target": target_breakevens,
                "expiry": expiry_breakevens,
            },
            "intrinsic_value": round(intrinsic_value, 2),
            "time_value": round(current_value - intrinsic_value, 2),
        },
        "funds": {
            "funds_needed": round(funds_needed, 2),
            "margin_needed": round(margin.total, 2),
            "margin_available": round(available, 2),
            "is_defined_risk": margin.is_defined_risk,
        },
        "curves": [
            {
                "price": price,
                "expiry_pnl": round(expiry_pnl + overlay, 2),
                "target_pnl": round(target_pnl + overlay, 2),
            }
            for price, expiry_pnl, target_pnl in zip(prices, expiry_pnls, target_pnls)
        ],
        "payoff_table": payoff_table,
        "pnl_rows": pnl_rows,
        "greeks": {"rows": greek_rows, "total": greek_total},
        "iv_rows": [
            {
                "client_id": source.client_id,
                "strike": source.strike,
                "expiry": source.expiry.isoformat(),
                "type": source.instrument_type,
                "iv": round((leg.contract.iv or 0) * 100, 2),
                "change": round(
                    ((source.iv_override or source.iv or 18.0) - (source.iv or 18.0)),
                    2,
                ),
            }
            for source, leg in zip(source_legs, domain.legs)
            if source.instrument_type != LegInstrumentType.FUT
        ],
        "projected": {
            "pnl": round(projected, 2),
            "percent": round(projected_pct, 2),
            "booked_pnl": booked,
            "manual_pnl": manual,
        },
        "standard_deviation": {
            "iv": round(average_iv * 100, 2),
            "one": {
                "points": round(sd_points, 2),
                "lower": round(spot - sd_points, 2),
                "upper": round(spot + sd_points, 2),
            },
            "two": {
                "points": round(sd_points * 2, 2),
                "lower": round(spot - sd_points * 2, 2),
                "upper": round(spot + sd_points * 2, 2),
            },
        },
        "target_future": {
            "label": f"{expiry_date.strftime('%d %b')} FUT",
            "price": round(
                target_price
                * math.exp(
                    RISK_FREE_RATE
                    * max((expiry_date - target_date).days, 0)
                    / 365
                ),
                2,
            ),
        },
        "warnings": list(dict.fromkeys(warnings)),
    }


def _modelled_history(spot: float, points: int = 80) -> list[dict]:
    now = datetime.now(timezone.utc)
    rows = []
    for index in range(points):
        age = points - index - 1
        timestamp = now - timedelta(minutes=15 * age)
        drift = math.sin(index / 7) * spot * 0.0025 + (index - points) * spot * 0.00002
        close = spot + drift
        rows.append(
            {
                "timestamp": timestamp.isoformat(),
                "open": round(close - spot * 0.0003, 2),
                "high": round(close + spot * 0.0006, 2),
                "low": round(close - spot * 0.0006, 2),
                "close": round(close, 2),
            }
        )
    return rows


def market_context(underlying: str) -> dict:
    provider = get_market_provider()
    spot = float(provider.get_spot_price(underlying))
    history = None
    source = "modelled"
    try:
        if hasattr(provider, "get_history"):
            payload = provider.get_history(underlying, days=15, resolution="15")
            if payload and payload.get("candles"):
                history = payload["candles"]
                source = payload.get("source", "provider")
    except Exception:
        history = None
    if not history:
        history = _modelled_history(spot)

    futures = None
    futures_source = "modelled"
    try:
        if hasattr(provider, "get_futures"):
            payload = provider.get_futures(underlying)
            if payload and payload.get("futures"):
                futures = payload["futures"]
                futures_source = payload.get("source", "provider")
    except Exception:
        futures = None
    if not futures:
        expiries = provider.get_expiries(underlying)[:3]
        futures = [
            {
                "expiry": expiry,
                "price": round(
                    spot
                    * math.exp(
                        RISK_FREE_RATE
                        * max((date.fromisoformat(str(expiry)) - date.today()).days, 0)
                        / 365
                    ),
                    2,
                ),
                "days": max((date.fromisoformat(str(expiry)) - date.today()).days, 0),
                "modelled": True,
            }
            for expiry in expiries
        ]

    return {
        "underlying": underlying,
        "spot": round(spot, 2),
        "history": history,
        "history_source": source,
        "futures": futures,
        "futures_source": futures_source,
        "as_of": datetime.now(timezone.utc).isoformat(),
    }
