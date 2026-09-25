"""events — validate analytics events against the frozen v1 contract."""

from events.validate import InvalidEvent, validate_event

__all__ = ["InvalidEvent", "validate_event"]
