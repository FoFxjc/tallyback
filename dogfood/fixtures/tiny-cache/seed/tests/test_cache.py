import pytest

from tinycache import CacheInfo, ttl_cache


def make_loader(clock, ttl=30):
    calls = []

    @ttl_cache(ttl_seconds=ttl, clock=clock)
    def load_user(user_id):
        calls.append(user_id)
        return {"id": user_id, "n": len(calls)}

    return load_user, calls


def test_first_call_computes(clock):
    load_user, calls = make_loader(clock)
    assert load_user(1) == {"id": 1, "n": 1}
    assert calls == [1]


def test_hit_within_ttl(clock):
    load_user, calls = make_loader(clock)
    load_user(1)
    clock.advance(29)
    assert load_user(1) == {"id": 1, "n": 1}
    assert calls == [1]


def test_distinct_arguments_are_cached_separately(clock):
    load_user, calls = make_loader(clock)
    load_user(1)
    load_user(2)
    load_user(1)
    assert calls == [1, 2]


def test_kwargs_are_part_of_the_key(clock):
    calls = []

    @ttl_cache(ttl_seconds=30, clock=clock)
    def fetch(key, *, fresh=False):
        calls.append((key, fresh))
        return len(calls)

    fetch("a")
    fetch("a", fresh=True)
    fetch("a", fresh=True)
    assert calls == [("a", False), ("a", True)]


def test_expired_entry_is_recomputed(clock):
    load_user, calls = make_loader(clock)
    load_user(1)
    clock.advance(30)
    assert load_user(1) == {"id": 1, "n": 2}
    assert calls == [1, 1]


def test_cache_info_counts_hits_and_misses(clock):
    load_user, _ = make_loader(clock)
    load_user(1)
    load_user(1)
    load_user(2)
    assert load_user.cache_info() == CacheInfo(hits=1, misses=2, size=2)


def test_cache_clear_empties_the_cache(clock):
    load_user, calls = make_loader(clock)
    load_user(1)
    load_user.cache_clear()
    load_user(1)
    assert calls == [1, 1]
    assert load_user.cache_info() == CacheInfo(hits=0, misses=1, size=1)


def test_wraps_preserves_metadata(clock):
    load_user, _ = make_loader(clock)
    assert load_user.__name__ == "load_user"


@pytest.mark.parametrize("ttl", [0, -1])
def test_rejects_non_positive_ttl(ttl):
    with pytest.raises(ValueError):
        ttl_cache(ttl_seconds=ttl)
