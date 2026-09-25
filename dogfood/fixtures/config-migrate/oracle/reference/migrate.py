"""Config schema migrations.

A config document is the parsed form of the application's YAML config file: a
``dict`` whose values are plain YAML data (dicts, lists, strings, numbers, booleans,
``None``). Every document carries an integer ``version``.

``migrate(config)`` upgrades a document to ``CURRENT_VERSION`` by applying each
single-step migration in order, and returns the upgraded document.

Schema history:

* v1 -> v2: ``timeout`` (seconds) was renamed to ``request_timeout``.
"""

from __future__ import annotations

import copy
from typing import Any, Callable

Config = dict[str, Any]

CURRENT_VERSION = 2


class UnsupportedVersionError(ValueError):
    """The document's ``version`` is missing, unknown, or newer than this library."""


def _v1_to_v2(old: Config) -> Config:
    new = copy.deepcopy(old)
    new["request_timeout"] = new.pop("timeout")
    new.setdefault("plugins", [])
    new["version"] = 2
    return new


_MIGRATIONS: dict[int, Callable[[Config], Config]] = {
    1: _v1_to_v2,
}


def migrate(config: Config) -> Config:
    """Upgrade ``config`` to ``CURRENT_VERSION`` and return the result."""
    version = config.get("version")
    if not isinstance(version, int) or isinstance(version, bool):
        raise UnsupportedVersionError(f"config has no integer version: {version!r}")
    if version > CURRENT_VERSION or (version < CURRENT_VERSION and version not in _MIGRATIONS):
        raise UnsupportedVersionError(f"cannot migrate config version {version}")

    result = config
    while result["version"] < CURRENT_VERSION:
        result = _MIGRATIONS[result["version"]](result)
    return result
