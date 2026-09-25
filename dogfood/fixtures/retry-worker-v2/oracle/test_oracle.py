"""Hidden acceptance oracle for retry-worker (never shown to the model under test).

`test_info_*` checks compare against one natural (greedy) packing; ISSUE.md does not
require greedy packing, so they are reported separately, not counted against acceptance.
"""

import random

import pytest

from batcher import chunk


def check_invariants(items, batches, max_items, max_bytes):
    assert all(len(batch) > 0 for batch in batches), "C4: empty batch"
    assert [x for batch in batches for x in batch] == list(items), "C3/C5: dropped or reordered"
    for batch in batches:
        assert len(batch) <= max_items, "C1: too many items"
        if any(len(x) > max_bytes for x in batch):
            assert len(batch) == 1, "C3: oversized item not alone"
        else:
            assert sum(len(x) for x in batch) <= max_bytes, "C2: too many bytes"


def reference(items, max_items, max_bytes):
    out, cur, size = [], [], 0
    for item in items:
        n = len(item)
        if n > max_bytes:
            if cur:
                out.append(cur)
            out.append([item])
            cur, size = [], 0
            continue
        if cur and (len(cur) >= max_items or size + n > max_bytes):
            out.append(cur)
            cur, size = [], 0
        cur.append(item)
        size += n
    if cur:
        out.append(cur)
    return out


EDGE_CASES = [
    ([b"B" * 50, b"s"], 10, 10),
    ([b"s", b"B" * 50], 10, 10),
    ([b"B" * 50, b"C" * 60], 10, 10),
    ([b"a", b"B" * 50, b"C" * 60, b"d"], 10, 10),
    ([b"B" * 11], 1, 10),
    ([b"a" * 10, b"b" * 10], 5, 10),
    ([b"a" * 5, b"b" * 5, b"c"], 2, 10),
    ([b"", b"", b""], 2, 10),
    ([b"a" * 9, b"B" * 20, b"c"], 1, 10),
]


@pytest.mark.parametrize("items,max_items,max_bytes", EDGE_CASES)
def test_edge_cases_satisfy_invariants(items, max_items, max_bytes):
    check_invariants(items, chunk(items, max_items, max_bytes), max_items, max_bytes)


@pytest.mark.parametrize("items,max_items,max_bytes", EDGE_CASES)
def test_info_edge_cases_match_greedy_reference(items, max_items, max_bytes):
    assert chunk(items, max_items, max_bytes) == reference(items, max_items, max_bytes)


def test_randomized_invariants():
    rng = random.Random(20260925)
    for _ in range(3000):
        max_items = rng.randint(1, 5)
        max_bytes = rng.randint(1, 20)
        items = [bytes(rng.randint(0, 30)) for _ in range(rng.randint(0, 12))]
        check_invariants(items, chunk(items, max_items, max_bytes), max_items, max_bytes)


def test_accepts_any_iterable():
    items = [b"aa", b"bb", b"cc"]
    assert chunk(iter(items), 2, 10) == [[b"aa", b"bb"], [b"cc"]]
