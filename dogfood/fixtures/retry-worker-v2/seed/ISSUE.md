# Upload worker loses payloads

The upload worker occasionally reports fewer uploaded payloads than it received. The
batching step (`batcher.chunk`) is the suspect. One test in `tests/test_chunk.py`
currently fails.

`chunk(items, max_items, max_bytes)` must satisfy:

## Acceptance criteria

1. A batch contains at most `max_items` items.
2. A batch of normal items contains at most `max_bytes` bytes in total.
3. An item larger than `max_bytes` is never dropped; it is emitted alone, in its own batch.
4. No empty batches are produced.
5. Order is preserved: concatenating the batches yields the input items in order.
6. Add regression tests for the defects you fix. The full test suite must pass.
