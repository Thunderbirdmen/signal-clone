"""Small demo security controls; one process, so counters are process-local."""
import time
from collections import defaultdict, deque

from fastapi import HTTPException

_counters: dict[str, deque[float]] = defaultdict(deque)


def rate_limit(key: str, max_count: int, window_seconds: int = 60) -> None:
    """Bound a user/IP operation; call before database work. Add Redis at scale."""
    current = time.monotonic()
    events = _counters[key]
    while events and events[0] <= current - window_seconds:
        events.popleft()
    if len(events) >= max_count:
        raise HTTPException(429, 'Too many requests. Please try again shortly.')
    events.append(current)


def reset_limits() -> None:
    _counters.clear()
