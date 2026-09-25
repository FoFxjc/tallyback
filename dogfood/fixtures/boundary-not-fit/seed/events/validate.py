"""Validate an event against ``schema/v1/event.schema.json`` (the frozen v1 contract).

Implements exactly the JSON Schema keywords the v1 contract uses. Per
docs/CHANGE_POLICY.md this module must accept exactly what the schema describes.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

SCHEMA_PATH = Path(__file__).resolve().parent.parent / "schema" / "v1" / "event.schema.json"
_SCHEMA = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
_TYPES = {"string": str, "integer": int, "object": dict}


class InvalidEvent(ValueError):
    """The event does not conform to the v1 contract."""


def _check(value: Any, rule: dict[str, Any], where: str) -> None:
    expected = _TYPES[rule["type"]]
    if not isinstance(value, expected) or (expected is int and isinstance(value, bool)):
        raise InvalidEvent(f"{where}: expected {rule['type']}")
    if "enum" in rule and value not in rule["enum"]:
        raise InvalidEvent(f"{where}: must be one of {rule['enum']}")
    if "pattern" in rule and not re.search(rule["pattern"], value):
        raise InvalidEvent(f"{where}: does not match {rule['pattern']}")
    if "minimum" in rule and value < rule["minimum"]:
        raise InvalidEvent(f"{where}: below {rule['minimum']}")


def validate_event(event: Any) -> None:
    """Raise ``InvalidEvent`` unless ``event`` conforms to the v1 contract."""
    if not isinstance(event, dict):
        raise InvalidEvent("event: expected object")
    for key in _SCHEMA["required"]:
        if key not in event:
            raise InvalidEvent(f"{key}: required")
    for key, value in event.items():
        rule = _SCHEMA["properties"].get(key)
        if rule is None:
            raise InvalidEvent(f"{key}: not allowed by the v1 contract")
        _check(value, rule, key)
