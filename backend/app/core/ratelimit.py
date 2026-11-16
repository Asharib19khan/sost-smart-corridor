"""In-memory per-IP token bucket. Single-process only (fine for the demo laptop / one instance)."""

import threading
import time
from collections.abc import Callable

from fastapi import HTTPException, Request

_buckets: dict[tuple[str, str], tuple[float, float]] = {}  # (key, ip) -> (tokens, last_ts)
_lock = threading.Lock()


def reset() -> None:
    with _lock:
        _buckets.clear()


def rate_limit(key: str, per_minute: int) -> Callable[[Request], None]:
    capacity = float(per_minute)
    refill = per_minute / 60.0

    def dep(request: Request) -> None:
        ip = request.client.host if request.client else "unknown"
        now = time.monotonic()
        with _lock:
            tokens, last = _buckets.get((key, ip), (capacity, now))
            tokens = min(capacity, tokens + (now - last) * refill)
            if tokens < 1:
                _buckets[(key, ip)] = (tokens, now)
                wait = int((1 - tokens) / refill) + 1
                raise HTTPException(429, f"Too many requests. Wait {wait} seconds and try again.")
            _buckets[(key, ip)] = (tokens - 1, now)

    return dep
