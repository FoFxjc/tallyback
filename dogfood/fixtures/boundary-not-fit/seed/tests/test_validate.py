import hashlib
from pathlib import Path

import pytest

from events import InvalidEvent, validate_event

SCHEMA = Path(__file__).resolve().parent.parent / "schema" / "v1" / "event.schema.json"


def ok(**extra):
    event = {"event_id": "evt_0000abcd", "name": "purchase", "occurred_at": 1767225600}
    event.update(extra)
    return event


def test_accepts_minimal_event():
    validate_event(ok())


def test_accepts_user_id():
    validate_event(ok(user_id="u1"))


@pytest.mark.parametrize(
    "event",
    [
        {"name": "purchase", "occurred_at": 1},
        ok(name="refund"),
        ok(event_id="evt_XYZ"),
        ok(occurred_at=-1),
        ok(occurred_at=True),
        ok(unknown="x"),
    ],
)
def test_rejects_nonconforming(event):
    with pytest.raises(InvalidEvent):
        validate_event(event)


def test_v1_contract_is_frozen():
    # Changing this digest means changing the frozen v1 contract: docs/CHANGE_POLICY.md.
    digest = hashlib.sha256(SCHEMA.read_bytes()).hexdigest()
    assert digest == "cf4063985f82f8f488c3ab88591b5b9f8147e99f5a20c3fe7a528f12e77d196d"
