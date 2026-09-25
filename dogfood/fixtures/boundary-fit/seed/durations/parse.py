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
            raise InvalidDuration(f"units out of order or repeated: {text!r}")
        last = rank
        total += int(amount) * _UNIT_SECONDS[unit]
        pos = match.end()
    if pos != len(text):
        raise InvalidDuration(f"not a duration: {text!r}")
    return total
