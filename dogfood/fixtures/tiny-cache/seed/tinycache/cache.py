"""A per-function TTL cache.

Usage::

    @ttl_cache(ttl_seconds=30)
    def load_user(user_id):
        ...

Each decorated function gets its own cache, keyed by its call arguments. An entry is
served from the cache until ``ttl_seconds`` have elapsed since it was stored; after that
the next call recomputes it.

The clock is injectable (``clock=``) so callers and tests can control time.
"""

from __future__ import annotations

import functools
import time
from dataclasses import dataclass
from typing import Any, Callable, Hashable

_KWARGS_MARK = object()


@dataclass(frozen=True)
class CacheInfo:
    hits: int
    misses: int
    size: int


class _Entry:
    __slots__ = ("value", "stored_at")

    def __init__(self, value: Any, stored_at: float) -> None:
        self.value = value
        self.stored_at = stored_at


def _make_key(args: tuple, kwargs: dict) -> Hashable:
    if not kwargs:
        return args
    return args + (_KWARGS_MARK,) + tuple(sorted(kwargs.items()))


def ttl_cache(ttl_seconds: float, *, clock: Callable[[], float] = time.monotonic):
    """Cache a function's results for ``ttl_seconds`` per distinct argument tuple."""
    if ttl_seconds <= 0:
        raise ValueError("ttl_seconds must be positive")

    def decorator(func: Callable) -> Callable:
        entries: dict[Hashable, _Entry] = {}
        hits = 0
        misses = 0

        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            nonlocal hits, misses
            key = _make_key(args, kwargs)
            now = clock()
            entry = entries.get(key)

            if entry is None:
                misses += 1
                value = func(*args, **kwargs)
                entries[key] = _Entry(value, now)
                return value

            if now - entry.stored_at >= ttl_seconds:
                # Expired: recompute and refresh the entry in place.
                misses += 1
                entry.value = func(*args, **kwargs)
                return entry.value

            hits += 1
            return entry.value

        def cache_info() -> CacheInfo:
            return CacheInfo(hits=hits, misses=misses, size=len(entries))

        def cache_clear() -> None:
            nonlocal hits, misses
            entries.clear()
            hits = 0
            misses = 0

        wrapper.cache_info = cache_info  # type: ignore[attr-defined]
        wrapper.cache_clear = cache_clear  # type: ignore[attr-defined]
        return wrapper

    return decorator
