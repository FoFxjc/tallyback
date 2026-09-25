# batcher

Splits a stream of `bytes` payloads into batches for a bulk-upload endpoint that
accepts at most `max_items` payloads and `max_bytes` bytes per request.

```python
from batcher import chunk

chunk([b"aa", b"bbb", b"c"], max_items=2, max_bytes=4)
# [[b"aa"], [b"bbb", b"c"]]
```

Run the tests with `python3 -m pytest`.
