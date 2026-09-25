# Failed or rejected Tallyback invocations

## call 3
```
tallyback view; echo; tallyback handshake; cat batcher/*.py tests/*.py README.md; python -m pytest -q 2>&1 | tail -20
```
```
{
  "ok": false,
  "code": "mutation.ledger_not_initialized",
  "message": "No Tallyback ledger exists at /tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/bench/w/S2GIX6Iq/repo/.tallyback.",
  "next_action": {
    "command": "tallyback init",
    "reason": "Initialize Tallyback before viewing or recording tracked work."
  }
}
mutation.ledger_not_initialized: No Tallyback ledger exists at /tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/bench/w/S2GIX6Iq/repo/.tallyback.

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
"""batcher — split a stream of payloads into size- and count-bounded batches."""

from batcher.chunk import chunk

__all__ = ["chunk"]
"""Batch payloads for a bulk-upload worker.

The upload endpoint accepts at most ``max_items`` payloads and at most ``max_bytes``
bytes per request. ``chunk`` groups an iterable of ``bytes`` payloads into batches that
respect both limits, preserving order.
"""

from __future__ import annotations

from typing import Iterable


def chunk(items: Iterable[bytes], max_items: int, max_bytes: int) -> list[list[bytes]]:
    """Split ``items`` into ordered batches bounded by ``max_items`` and ``max_bytes``."""
    if max_items < 1:
        raise ValueError("max_items must be at least 1")
    if max_bytes < 1:
        raise ValueError("max_bytes must be at least 1")

    batches: list[list[bytes]] = []
    current: list[bytes] = []
    current_size = 0

    for item in items:
        size = len(item)
        next_size = current_size + size

        if next_size > max_bytes:
            batches.append(current)
            current, current_size = [], 0
            if size > max_bytes:
                continue

        if len(current) >= max_items:
            batches.a
```
