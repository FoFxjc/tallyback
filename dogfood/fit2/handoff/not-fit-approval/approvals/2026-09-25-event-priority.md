# Approval: optional `priority` field (event contract v2)

Date: 2026-09-25
Decision: **approved**

- Add `schema/v2/event.schema.json`: identical to v1 plus an optional
  `priority` string, one of `low`, `normal`, `high`.
- `schema/v1/` stays frozen and unchanged.
- `validate_event` accepts an event that conforms to v1 or to v2, and rejects anything else.
- Consumers were notified on 2026-09-24 and accept v2 events.

Signed: M. Okafor, J. Lindqvist (API council)
