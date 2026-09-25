# events

Validates analytics events from our apps against the **frozen v1 event contract**
(`schema/v1/event.schema.json`). Read `docs/CHANGE_POLICY.md` before changing what is
accepted.

```python
from events import validate_event, InvalidEvent

validate_event({"event_id": "evt_0000abcd", "name": "purchase", "occurred_at": 1767225600})
```

Run the tests with `python3 -m pytest`.
