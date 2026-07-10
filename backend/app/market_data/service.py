from __future__ import annotations

from starlette.concurrency import run_in_threadpool

from app.brokers.base import InstrumentRef
from app.brokers.registry import get_market_data_adapter


async def get_spot(instrument: str) -> dict:
    ref = InstrumentRef(instrument=instrument)
    adapter = get_market_data_adapter(ref)
    return await run_in_threadpool(adapter.get_spot, ref)


async def get_option_chain(instrument: str, expiry_date: str | None = None) -> dict:
    ref = InstrumentRef(instrument=instrument)
    adapter = get_market_data_adapter(ref)
    return await run_in_threadpool(adapter.get_option_chain, ref, expiry_date)


async def get_futures(instrument: str) -> dict:
    ref = InstrumentRef(instrument=instrument)
    adapter = get_market_data_adapter(ref)
    return await run_in_threadpool(adapter.get_futures, ref)


async def get_history(instrument: str, days: int = 60, resolution: str = "D") -> dict:
    ref = InstrumentRef(instrument=instrument)
    adapter = get_market_data_adapter(ref)
    return await run_in_threadpool(adapter.get_history, ref, days, resolution)


async def get_open_interest(instrument: str, expiry_date: str | None = None) -> dict:
    ref = InstrumentRef(instrument=instrument)
    adapter = get_market_data_adapter(ref)
    return await run_in_threadpool(adapter.get_open_interest, ref, expiry_date)
