"""Permanent paper-trading and inbound market-data safety boundary.

StrikeFluency may authenticate with a broker and request market data, but it
must never expose or invoke broker execution capabilities.  This module keeps
that rule executable rather than relying on comments or developer convention.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from functools import wraps
from typing import Any


EXECUTION_MODE = "paper_only"
BROKER_ACCESS_MODE = "market_data_read_only"

# Include common naming variants used by Indian broker SDKs.  A provider that
# needs a new market-data operation must explicitly add it to its own allowlist;
# execution operations must never be added.
FORBIDDEN_BROKER_OPERATIONS = frozenset({
    "place_order",
    "placeorder",
    "modify_order",
    "modifyorder",
    "cancel_order",
    "cancelorder",
    "cancel_all_orders",
    "exit_order",
    "exit_position",
    "exit_all_positions",
    "square_off",
    "squareoff",
    "convert_position",
    "basket_order",
    "place_basket_order",
    "order_place",
    "order_modify",
    "order_cancel",
    "get_orders",
    "get_order_book",
    "get_trade_book",
    "get_positions",
    "get_holdings",
})

# These keys belong to StrikeFluency's private paper ledger and journal.  They
# are never valid inputs to a broker market-data request.
PRIVATE_PAPER_DATA_KEYS = frozenset({
    "user_id",
    "tenant_id",
    "virtual_account_id",
    "virtual_order_id",
    "order_id",
    "client_order_id",
    "position_id",
    "journal_entry_id",
    "discipline_score",
    "violations_attempted",
    "account_balance",
    "available_balance",
    "realized_pnl",
    "unrealized_pnl",
    "pre_trade_thesis",
    "post_trade_review",
    "emotion_tag",
    "mistake_category",
})


class LiveBrokerExecutionProhibited(RuntimeError):
    """Raised before any broker execution or private-data egress can occur."""


def assert_paper_trading_configuration(settings: Any) -> None:
    """Fail startup if configuration weakens the permanent product boundary."""
    if getattr(settings, "EXECUTION_MODE", None) != EXECUTION_MODE:
        raise RuntimeError(
            "Refusing to start: EXECUTION_MODE must remain 'paper_only'"
        )
    if getattr(settings, "BROKER_ACCESS_MODE", None) != BROKER_ACCESS_MODE:
        raise RuntimeError(
            "Refusing to start: BROKER_ACCESS_MODE must remain "
            "'market_data_read_only'"
        )


def _walk_payload(value: Any) -> Iterable[tuple[str, Any]]:
    if isinstance(value, Mapping):
        for key, nested in value.items():
            yield str(key).lower(), nested
            yield from _walk_payload(nested)
    elif isinstance(value, (list, tuple, set, frozenset)):
        for nested in value:
            yield from _walk_payload(nested)


def assert_market_data_payload(*args: Any, **kwargs: Any) -> None:
    """Reject accidental paper-account or journal data in broker requests."""
    leaked = {
        key
        for key, _ in _walk_payload((args, kwargs))
        if key in PRIVATE_PAPER_DATA_KEYS
    }
    if leaked:
        names = ", ".join(sorted(leaked))
        raise LiveBrokerExecutionProhibited(
            f"Broker market-data request contains private paper data: {names}"
        )


class ReadOnlyBrokerClient:
    """Allowlist proxy around a broker SDK client.

    Authentication happens before this proxy is created.  Once a client enters
    the market-data layer, only explicitly approved read operations are
    callable.  Unknown SDK methods fail closed so adding live execution later
    requires a deliberate architectural redesign.
    """

    def __init__(self, client: Any, *, allowed_operations: Iterable[str]):
        object.__setattr__(self, "_client", client)
        object.__setattr__(
            self,
            "_allowed_operations",
            frozenset(str(name) for name in allowed_operations),
        )

    @property
    def wrapped_client_type(self) -> type:
        return type(object.__getattribute__(self, "_client"))

    def __getattr__(self, name: str) -> Any:
        client = object.__getattribute__(self, "_client")
        attribute = getattr(client, name)
        if not callable(attribute):
            return attribute

        allowed = object.__getattribute__(self, "_allowed_operations")
        if name not in allowed or name.lower() in FORBIDDEN_BROKER_OPERATIONS:
            def blocked(*_args: Any, **_kwargs: Any) -> Any:
                raise LiveBrokerExecutionProhibited(
                    f"Broker operation '{name}' is prohibited. StrikeFluency "
                    "accepts inbound market data only."
                )

            return blocked

        @wraps(attribute)
        def guarded(*args: Any, **kwargs: Any) -> Any:
            assert_market_data_payload(*args, **kwargs)
            return attribute(*args, **kwargs)

        return guarded


def read_only_broker_client(
    client: Any, *, allowed_operations: Iterable[str],
) -> ReadOnlyBrokerClient:
    if isinstance(client, ReadOnlyBrokerClient):
        return client
    return ReadOnlyBrokerClient(client, allowed_operations=allowed_operations)


def assert_read_only_market_data_adapter(adapter: Any) -> None:
    """Reject adapters that expose any broker account/execution capability."""
    exposed = sorted(
        operation
        for operation in FORBIDDEN_BROKER_OPERATIONS
        if callable(getattr(adapter, operation, None))
    )
    if exposed:
        raise RuntimeError(
            "Market-data adapter exposes prohibited broker operations: "
            + ", ".join(exposed)
        )


def public_capabilities() -> dict[str, Any]:
    """Safe capability statement for health/UI diagnostics."""
    return {
        "execution_mode": EXECUTION_MODE,
        "broker_access_mode": BROKER_ACCESS_MODE,
        "live_broker_execution": False,
        "paper_orders_only": True,
        "broker_data_direction": "inbound_only",
    }
