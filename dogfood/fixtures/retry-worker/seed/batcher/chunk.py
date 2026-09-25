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
