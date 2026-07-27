"""Regression tests for StrikeFluency's permanent paper-only boundary."""

from __future__ import annotations

import ast
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.brokers.base import MarketDataAdapter
from app.brokers.fyers.adapter import FyersMarketDataAdapter
from app.brokers.kite_adapter import KiteMarketDataAdapter
from app.brokers.mock_adapter import MockMarketDataAdapter
from app.core.paper_trading_policy import (
    BROKER_ACCESS_MODE,
    EXECUTION_MODE,
    FORBIDDEN_BROKER_OPERATIONS,
    LiveBrokerExecutionProhibited,
    assert_paper_trading_configuration,
    read_only_broker_client,
)


class FakeBrokerSdk:
    def __init__(self) -> None:
        self.calls: list[tuple[str, object]] = []

    def quote(self, payload):
        self.calls.append(("quote", payload))
        return {"ok": True}

    def place_order(self, payload):
        self.calls.append(("place_order", payload))
        return {"order_id": "REAL-ORDER-MUST-NEVER-EXIST"}

    def some_future_method(self):
        self.calls.append(("some_future_method", None))


def test_market_data_interface_exposes_no_broker_account_or_execution_methods():
    adapter_types = (
        MarketDataAdapter,
        FyersMarketDataAdapter,
        KiteMarketDataAdapter,
        MockMarketDataAdapter,
    )
    for adapter_type in adapter_types:
        exposed = {
            name
            for name in FORBIDDEN_BROKER_OPERATIONS
            if callable(getattr(adapter_type, name, None))
        }
        assert exposed == set(), f"{adapter_type.__name__} exposes {sorted(exposed)}"


def test_sdk_proxy_allows_only_explicit_market_data_operations():
    sdk = FakeBrokerSdk()
    client = read_only_broker_client(sdk, allowed_operations={"quote"})

    assert client.quote({"symbols": "NSE:NIFTY50-INDEX"}) == {"ok": True}

    with pytest.raises(LiveBrokerExecutionProhibited, match="prohibited"):
        client.place_order({"symbol": "NIFTY", "quantity": 65})
    with pytest.raises(LiveBrokerExecutionProhibited, match="prohibited"):
        client.some_future_method()

    assert sdk.calls == [("quote", {"symbols": "NSE:NIFTY50-INDEX"})]


def test_sdk_proxy_rejects_private_paper_data_before_network_call():
    sdk = FakeBrokerSdk()
    client = read_only_broker_client(sdk, allowed_operations={"quote"})

    with pytest.raises(
        LiveBrokerExecutionProhibited,
        match="client_order_id, journal_entry_id",
    ):
        client.quote({
            "symbols": "NSE:NIFTY50-INDEX",
            "client_order_id": "private-paper-id",
            "journal_entry_id": "private-journal-id",
        })

    assert sdk.calls == []


def test_product_configuration_is_fail_closed():
    assert_paper_trading_configuration(SimpleNamespace(
        EXECUTION_MODE=EXECUTION_MODE,
        BROKER_ACCESS_MODE=BROKER_ACCESS_MODE,
    ))

    with pytest.raises(RuntimeError, match="EXECUTION_MODE"):
        assert_paper_trading_configuration(SimpleNamespace(
            EXECUTION_MODE="live",
            BROKER_ACCESS_MODE=BROKER_ACCESS_MODE,
        ))
    with pytest.raises(RuntimeError, match="BROKER_ACCESS_MODE"):
        assert_paper_trading_configuration(SimpleNamespace(
            EXECUTION_MODE=EXECUTION_MODE,
            BROKER_ACCESS_MODE="trading",
        ))


def test_broker_and_provider_source_contains_no_execution_sdk_calls():
    """Catch future direct SDK calls that bypass the read-only proxy."""
    backend = Path(__file__).resolve().parents[2]
    targets = [
        *sorted((backend / "app" / "brokers").rglob("*.py")),
        backend / "app" / "market" / "fyers_provider.py",
        backend / "app" / "market" / "kite_provider.py",
        backend / "app" / "services" / "kite_instrument_service.py",
    ]
    violations: list[str] = []

    for path in targets:
        tree = ast.parse(path.read_text(encoding="utf-8-sig"), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
                continue
            if node.func.attr.lower() in FORBIDDEN_BROKER_OPERATIONS:
                violations.append(f"{path.relative_to(backend)}:{node.lineno}:{node.func.attr}")

    assert violations == [], "Prohibited broker SDK calls found:\n" + "\n".join(violations)
