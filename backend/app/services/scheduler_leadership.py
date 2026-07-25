"""Renewable Redis leadership for database-mutating scheduler jobs."""

import logging
import threading
import time
import uuid

from redis import Redis
from redis.exceptions import RedisError


logger = logging.getLogger(__name__)

_RENEW_SCRIPT = """
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('expire', KEYS[1], ARGV[2])
end
return 0
"""

_RELEASE_SCRIPT = """
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0
"""


class SchedulerLeadership:
    """
    Elect one API process to run state-changing scheduled work.

    Quote/status broadcasts deliberately remain process-local because each
    Uvicorn worker owns its own WebSocket connections. Only jobs that mutate
    shared database state consult this lease.
    """

    def __init__(
        self,
        redis_url: str,
        *,
        ttl_seconds: int = 30,
        key: str = "strikefluency:scheduler:state-leader",
        client=None,
    ):
        self.redis_url = redis_url.strip()
        self.ttl_seconds = max(9, int(ttl_seconds))
        self.key = key
        self.token = uuid.uuid4().hex
        self._client = client
        self._leader = not bool(self.redis_url)
        self._state_lock = threading.Lock()
        self._stop = threading.Event()
        self._thread = None
        self._last_error_log = 0.0

    @property
    def distributed(self) -> bool:
        return bool(self.redis_url)

    def _get_client(self):
        if self._client is None:
            self._client = Redis.from_url(
                self.redis_url,
                decode_responses=True,
                socket_connect_timeout=2,
                socket_timeout=3,
                health_check_interval=30,
            )
        return self._client

    def refresh(self) -> bool:
        """Acquire a new lease or renew this process's existing lease."""
        if not self.distributed:
            with self._state_lock:
                self._leader = True
            return True

        try:
            client = self._get_client()
            acquired = client.set(
                self.key,
                self.token,
                nx=True,
                ex=self.ttl_seconds,
            )
            leader = bool(acquired)
            if not leader:
                leader = bool(client.eval(
                    _RENEW_SCRIPT,
                    1,
                    self.key,
                    self.token,
                    self.ttl_seconds,
                ))
            with self._state_lock:
                changed = leader != self._leader
                self._leader = leader
            if changed:
                logger.info(
                    "Scheduler state-job leadership %s",
                    "acquired" if leader else "lost",
                )
            return leader
        except RedisError as exc:
            with self._state_lock:
                self._leader = False
            now = time.monotonic()
            if now - self._last_error_log >= 30:
                logger.error(
                    "Scheduler leadership unavailable; state jobs are paused: %s",
                    exc,
                )
                self._last_error_log = now
            return False

    def is_leader(self) -> bool:
        with self._state_lock:
            return self._leader

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self.refresh()
        if not self.distributed:
            logger.warning(
                "REDIS_URL is empty; scheduler state jobs are safe only with "
                "a single API process"
            )
            return
        self._thread = threading.Thread(
            target=self._heartbeat,
            name="scheduler-leadership",
            daemon=True,
        )
        self._thread.start()

    def _heartbeat(self) -> None:
        interval = max(2.0, self.ttl_seconds / 3)
        while not self._stop.wait(interval):
            self.refresh()

    def stop(self) -> None:
        self._stop.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=3)
        self._thread = None

        if self.distributed:
            try:
                self._get_client().eval(
                    _RELEASE_SCRIPT,
                    1,
                    self.key,
                    self.token,
                )
            except RedisError:
                logger.warning(
                    "Could not release scheduler leadership; lease will expire"
                )
        with self._state_lock:
            self._leader = not self.distributed
