# Failed or rejected Tallyback invocations

## call 3
```
tallyback view; echo ---; tallyback handshake; echo ---; cat tinycache/*.py tests/*.py README.md pytest.ini
```
```
{
  "ok": false,
  "code": "mutation.ledger_not_initialized",
  "message": "No Tallyback ledger exists at /tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/bench/w/YrWTyo91/repo/.tallyback.",
  "next_action": {
    "command": "tallyback init",
    "reason": "Initialize Tallyback before viewing or recording tracked work."
  }
}
mutation.ledger_not_initialized: No Tallyback ledger exists at /tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/bench/w/YrWTyo91/repo/.tallyback.
---
{
  "contract": "tallyback",
  "implementation_version": "0.1.0",
  "command_api_version": "1",
  "supported_contract_versions": [
    "1.0.0"
  ],
  "features": [
    "store",
    "check",
    "migration",
    "land",
    "view",
    "watch"
  ]
}
---
"""tinycache — a small in-process TTL cache decorator."""

from tinycache.cache import CacheInfo, ttl_cache

__all__ = ["CacheInfo", "ttl_cache"]
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


def ttl_cache(ttl_seconds: float, *, clock: Callable[[], float
```

## call 6
```
tallyback task --topic-id top_01a0d74d-1bac-71b7-aaf4-a9fe249b3374 --title "Refreshed expired cache entries must stay cached for a new TTL" >/dev/null; tallyback view 2>/dev/null | python3 -c 'import json,sys;d=json.load(sys.stdin);print(json.dumps(d["tasks"][0]["next_action"],indent=1))'; tallyback declare --help
```
```
Exit code 1
"declare"
error: missing required --task-id
```

## call 12
```
head -c 600 $(which tallyback); echo; T=tsk_01a0d74d-279e-715e-a826-9c8c9110c513; for f in criterion criteria acceptance; do echo "== $f"; tallyback declare --task-id $T --objective x --supersedes dcl_01a0d74d-43c6-719a-a63a-27fd8edb8b0f --$f "probe" --dry-run 2>&1 | head -3; done
```
```
#!/bin/sh
exec node /tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/bench/tallyback-pinned/dist/cli.js "$@"

== criterion
error: --criterion must be "code:statement"
== criteria
{
  "ok": true,
  "revision": 4,
== acceptance
{
  "ok": false,
  "code": "invariant.supersession_conflict",
```

## call 31
```
tallyback evidence --kind observation --note "regression test fails without fix" --payload '{"command":"python3 -m pytest -q (tinycache/cache.py fix stashed)","result":"1 failed, 10 passed","failing":"tests/test_cache.py::test_refreshed_entry_stays_cached_for_a_new_ttl"}' --actor executor:claude-opus-5-5 2>&1 | head -12
```
```
{
  "ok": false,
  "code": "schema.unknown_property",
  "message": "/records/0/payload must have required property 'text'"
}
schema.unknown_property: /records/0/payload must have required property 'text'
```
