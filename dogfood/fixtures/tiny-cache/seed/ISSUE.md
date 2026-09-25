# Expired cache entries keep getting recomputed

Reported from production: after a user's cache entry expires once, `load_user` is
called again on almost every request for that user, instead of once per TTL window.
The first recomputation after expiry looks correct, but the refreshed value does not
seem to stay cached.

```python
@ttl_cache(ttl_seconds=30)
def load_user(user_id):
    ...
```

## Acceptance criteria

1. An expired value is recomputed.
2. The refreshed value remains cached until its new TTL expires.
3. Existing cache-hit behavior remains unchanged.
4. Add a regression test demonstrating the bug.
5. Do not change the public API.
