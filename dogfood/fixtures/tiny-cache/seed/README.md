# tinycache

A small in-process TTL cache decorator.

```python
from tinycache import ttl_cache

@ttl_cache(ttl_seconds=30)
def load_user(user_id):
    ...

load_user(42)            # computed
load_user(42)            # served from cache for 30 seconds
load_user.cache_info()   # CacheInfo(hits=1, misses=1, size=1)
load_user.cache_clear()
```

Run the tests with `python3 -m pytest`.
