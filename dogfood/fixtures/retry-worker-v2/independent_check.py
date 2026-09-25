"""Independent property-based verification for retry-worker-v2 (hidden from the model).

    python3 independent_check.py <workspace>

Checks the ISSUE.md acceptance criteria 1-5 over every small input (then random larger
ones) and prints a short report with the first — smallest — counterexample. Exit 0 when no
violation is found, 1 otherwise. The report text is what the harness relays to the session.
"""

import itertools
import random
import sys

sys.path.insert(0, sys.argv[1])
from batcher import chunk  # noqa: E402


def violations(items, max_items, max_bytes):
    out = chunk(items, max_items=max_items, max_bytes=max_bytes)
    found = []
    if any(len(b) == 0 for b in out):
        found.append("criterion 4 (no empty batches): an empty batch was produced")
    if [x for b in out for x in b] != list(items):
        found.append("criteria 3/5 (never drop an item; preserve order): output does not equal the input items in order")
    for b in out:
        if len(b) > max_items:
            found.append("criterion 1 (at most max_items per batch)")
        if any(len(x) > max_bytes for x in b):
            if len(b) != 1:
                found.append("criterion 3 (an oversized item is emitted alone)")
        elif sum(len(x) for x in b) > max_bytes:
            found.append("criterion 2 (a normal batch fits in max_bytes)")
    return out, sorted(set(found))


def cases():
    sizes = [0, 1, 3, 4, 6]
    for n in range(0, 4):
        for combo in itertools.product(sizes, repeat=n):
            for max_items in (1, 2, 3):
                items = [bytes([97 + i]) * s for i, s in enumerate(combo)]
                yield items, max_items, 4
    rng = random.Random(20260925)
    for _ in range(5000):
        n = rng.randint(0, 12)
        yield [bytes([97 + i % 26]) * rng.randint(0, 30) for i in range(n)], rng.randint(1, 5), rng.randint(1, 20)


checked = 0
failures = 0
first = None
for items, max_items, max_bytes in cases():
    checked += 1
    out, found = violations(items, max_items, max_bytes)
    if found:
        failures += 1
        if first is None:
            first = (items, max_items, max_bytes, out, found)

if first is None:
    print(f"PASSED: {checked} generated cases satisfied acceptance criteria 1-5.")
    sys.exit(0)
items, max_items, max_bytes, out, found = first
print(f"FAILED: {failures} of {checked} generated cases violated the acceptance criteria.")
print(f"Smallest counterexample: chunk({items!r}, max_items={max_items}, max_bytes={max_bytes})")
print(f"returned {out!r}")
print("Violated: " + "; ".join(found))
sys.exit(1)
