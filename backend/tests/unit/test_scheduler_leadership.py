"""Unit tests for Redis scheduler leadership and guarded state jobs."""

import asyncio

from redis.exceptions import ConnectionError

from app.services.scheduler_leadership import SchedulerLeadership


class FakeRedis:
    def __init__(self):
        self.values = {}

    def set(self, key, value, *, nx=False, ex=None):
        if nx and key in self.values:
            return False
        self.values[key] = value
        return True

    def eval(self, script, _key_count, key, token, *args):
        if self.values.get(key) != token:
            return 0
        if "expire" in script:
            return 1
        if "del" in script:
            del self.values[key]
            return 1
        raise AssertionError("Unknown script")


class BrokenRedis:
    def set(self, *args, **kwargs):
        raise ConnectionError("offline")


def test_only_one_process_holds_state_job_leadership():
    redis = FakeRedis()
    first = SchedulerLeadership("redis://test", client=redis)
    second = SchedulerLeadership("redis://test", client=redis)

    assert first.refresh() is True
    assert first.is_leader() is True
    assert second.refresh() is False
    assert second.is_leader() is False

    first.stop()
    assert second.refresh() is True
    assert second.is_leader() is True
    second.stop()


def test_redis_failure_pauses_state_jobs():
    leadership = SchedulerLeadership("redis://test", client=BrokenRedis())

    assert leadership.refresh() is False
    assert leadership.is_leader() is False


def test_development_fallback_runs_state_jobs_when_redis_is_offline():
    leadership = SchedulerLeadership(
        "redis://test",
        client=BrokenRedis(),
        allow_local_fallback=True,
    )

    assert leadership.refresh() is True
    assert leadership.is_leader() is True


def test_single_process_development_mode_needs_no_redis():
    leadership = SchedulerLeadership("")

    leadership.start()

    assert leadership.distributed is False
    assert leadership.is_leader() is True
    leadership.stop()


def test_state_job_wrapper_skips_non_leader(monkeypatch):
    from app.market import market_scheduler

    calls = []

    async def job():
        calls.append("ran")

    monkeypatch.setattr(
        market_scheduler.state_job_leadership,
        "is_leader",
        lambda: False,
    )
    asyncio.run(market_scheduler._run_state_job(job, "test"))
    assert calls == []

    monkeypatch.setattr(
        market_scheduler.state_job_leadership,
        "is_leader",
        lambda: True,
    )
    asyncio.run(market_scheduler._run_state_job(job, "test"))
    assert calls == ["ran"]
