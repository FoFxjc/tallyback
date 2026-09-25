# Failed or rejected Tallyback invocations

## call 3
```
cat batcher/*.py tests/test_chunk.py README.md pytest.ini; tallyback view; tallyback handshake
```
```
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
            batches.append(current)
            current, current_size = [], 0

        current.append(item)
        current_size += size

    if current:
        batches.append(current)
    return batches
import pytest

from batcher import chunk


def b(n: int, tag: str = "x") -> bytes:
    return (tag * n).encode()


def test_empty_input():
    assert chunk([], max_items=3, max_bytes=10) == []


def test_respects_max_items():
    items = [b(1, t) for t in "abcde"]
    assert chunk(items, max_items=2, max_bytes=100) == [items[0:2], items[2:4], items[4:5]]


def test_respects_max_bytes():
    items = [b(4, "a"), b(4, "b"), b(4, "c")]
    assert chunk(items, max_items=10, max_bytes=10) == [items[0:2], items[2:3]]


def test_exact_byte_boundary_fits_in_one_batch():
    items = [b(5, "a"), b(5, "b")]
    a
```

## call 15
```
export TALLYBACK_ACTOR=executor:claude-code && R=repo_01a0d843-284b-72b1-88af-6190eb4be51c W=wsp_01a0d843-61c9-7429-9b1b-9b7699ad8965 && D=$(git diff | sha256sum | cut -d' ' -f1) && \
E1=$(tallyback evidence --kind test_run --payload "{\"command\":\"python3 -m pytest -q\",\"exit_code\":1,\"repository_id\":\"$R\",\"workspace_id\":\"$W\",\"working_tree\":\"dirty\"}" --note "Pre-fix baseline: HEAD chunk.py + new tests: 6 failed, 7 passed (existing test_oversized_item_is_emitted_alone + all 5 new regression tests fail)" | python3 -c 'import json,sys;print(json.load(sys.stdin)["evidence"]["evidence_id"])') && \
E2=$(tallyback evidence --kind test_run --payload "{\"command\":\"python3 -m pytest -q\",\"exit_code\":0,\"repository_id\":\"$R\",\"workspace_id\":\"$W\",\"working_tree\":\"dirty\"}" --note "Post-fix: 13 passed, 0 failed. Includes randomized invariant test (2000 cases, seed 1234) asserting order, 1<=len<=max_items, byte bound for normal batches, oversized alone" | python3 -c 'import json,sys;print(json.load(sys.stdin)["evidence"]["evidence_id"])') && \
E3=$(tallyback evidence --kind git_diff --payload "{\"repository_id\":\"$R\",\"base_object_id\":\"$(git rev-parse HEAD)\",\"digest\":\"sha256:$D\"}" --note "Uncommitted working-tree diff: batcher/chunk.py (flush only non-empty current; emit oversized item alone instead of dropping), tests/test_chunk.py (+5 regression tests)" | python3 -c 'import json,sys;print(json.load(sys.stdin)["evidence"]["evidence_id"])') && echo $E1 $E2 $E3
```
```
Exit code 1
schema.unknown_property: /records/0/payload/digest must be object
hint: --payload for kind git_diff: {repository_id (required), base_object_id, head_object_id, path, digest}. Put the human-readable result (counts, failing tests) in --note. See `tallyback evidence --help` for every kind.
Traceback (most recent call last):
  File "<string>", line 1, in <module>
KeyError: 'evidence'
```
