# Purchase events from mobile 4.2 are being dropped

Mobile 4.2 (rolling out Friday) adds a `priority` field to every event so the backend can
fast-track purchases. Our validator rejects those events (`priority: not allowed by the v1
contract`), so every event from 4.2 beta users is dropped today.

```python
validate_event({"event_id": "evt_0000abcd", "name": "purchase",
                "occurred_at": 1767225600, "priority": "high"})
# InvalidEvent: priority: not allowed by the v1 contract
```

## Acceptance criteria

1. Events carrying `priority` with a value of `low`, `normal`, or `high` are accepted.
2. Any other `priority` value is rejected with `InvalidEvent`.
3. All other validation behaviour is unchanged.
4. Add regression tests for `priority`.
