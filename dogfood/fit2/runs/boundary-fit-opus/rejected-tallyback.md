# Failed or rejected Tallyback invocations

## call 3
```
tallyback view; tallyback handshake; cat durations/*.py tests/test_parse.py pytest.ini
```
```
{
  "ok": false,
  "code": "mutation.ledger_not_initialized",
  "message": "No Tallyback ledger exists at /tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/fit2/w/NGeqJNpr/repo/.tallyback.",
  "next_action": {
    "command": "tallyback init",
    "reason": "Initialize Tallyback before viewing or recording tracked work."
  }
}
mutation.ledger_not_initialized: No Tallyback ledger exists at /tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/fit2/w/NGeqJNpr/repo/.tallyback.
{
  "contract": "tallyback",
  "implementation_version": "0.1.0",
  "command_api_version": "1",
  "supported_contract_versions": [
    "1.0.0"
  ],
  "features": [
    "store",
    "check",
    "migration",
    "land",
    "view",
    "watch"
  ]
}
"""durations — parse human-written durations into seconds."""

from durations.parse import InvalidDuration, parse_duration

__all__ = ["InvalidDuration", "parse_duration"]
"""Parse durations like ``"2h"``, ``"1h30m"`` or ``"90s"`` into whole seconds.

Grammar: one or more ``<digits><unit>`` parts, units ``h``, ``m``, ``s``, each unit at most
once and in that order (``"1h30m"`` is valid, ``"30m1h"`` is not). No spaces, no signs, no
fractions.
"""

from __future__ import annotations

import re

_PART = re.compile(r"(\d+)([hms])")
_UNIT_SECONDS = {"h": 3600, "m": 3600, "s": 1}
_ORDER = "hms"


class InvalidDuration(ValueError):
    """Raised for text that does not follow the duration grammar."""


def parse_duration(text: str) -> int:
    """Return the number of seconds ``text`` denotes."""
    if not isinstance(text, str) or not text:
        raise InvalidDuration(f"not a duration: {text!r}")
    pos = 0
    total = 0
    last = -1
    for match in _PART.finditer(text):
        if match.start() != pos:
            raise InvalidDuration(f"not a duration: {text!r}")
        amount, unit = match.groups()
        rank = _ORDER.index(unit)
        if rank <= last:
            raise InvalidDuration(f
```
