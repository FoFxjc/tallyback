"""Hidden acceptance oracle for tiny-cache (never shown to the model under test).

Run with the workspace on PYTHONPATH:  PYTHONPATH=<workspace> pytest -q oracle/
"""

import inspect

from tinycache import CacheInfo, ttl_cache


class Clock:
    def __init__(self):
        self.now = 0.0

    def __call__(self):
        return self.now


def loader(clock, ttl=30):
    calls = []

    @ttl_cache(ttl_seconds=ttl, clock=clock)
    def load_user(user_id):
        calls.append(user_id)
        return (user_id, len(calls))

    return load_user, calls


def test_c1_expired_value_is_recomputed():
    clock = Clock()
    f, calls = loader(clock)
    f(1)
    clock.now = 30
    assert f(1) == (1, 2)


def test_c2_refreshed_value_stays_cached_for_new_ttl():
    clock = Clock()
    f, calls = loader(clock)
    f(1)
    clock.now = 30
    f(1)                      # refresh at t=30
    clock.now = 59.9
    assert f(1) == (1, 2)     # still cached
    assert calls == [1, 1]
    clock.now = 60
    assert f(1) == (1, 3)     # new TTL expired


def test_c2_repeated_refresh_cycles():
    clock = Clock()
    f, calls = loader(clock, ttl=10)
    for cycle in range(5):
        clock.now = cycle * 10
        f("u")
        clock.now = cycle * 10 + 5
        f("u")
    assert len(calls) == 5


def test_c3_hits_unchanged():
    clock = Clock()
    f, calls = loader(clock)
    f(1)
    clock.now = 29.999
    f(1)
    f(2)
    assert calls == [1, 2]
    assert f.cache_info() == CacheInfo(hits=1, misses=2, size=2)


def test_c3_cache_info_after_refresh_counts_miss_then_hit():
    clock = Clock()
    f, _ = loader(clock)
    f(1)
    clock.now = 30
    f(1)
    f(1)
    assert f.cache_info() == CacheInfo(hits=1, misses=2, size=1)


def test_c5_public_api_unchanged():
    sig = inspect.signature(ttl_cache)
    assert list(sig.parameters) == ["ttl_seconds", "clock"]
    assert sig.parameters["clock"].kind is inspect.Parameter.KEYWORD_ONLY
    clock = Clock()
    f, _ = loader(clock)
    assert callable(f.cache_info) and callable(f.cache_clear)
    import tinycache

    assert set(tinycache.__all__) == {"CacheInfo", "ttl_cache"}
