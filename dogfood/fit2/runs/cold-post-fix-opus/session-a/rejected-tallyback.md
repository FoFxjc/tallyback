# Failed or rejected Tallyback invocations

## call 3
```
cat cfgmigrate/*.py tests/*.py README.md pytest.ini; tallyback handshake; tallyback view
```
```
Exit code 1
"""cfgmigrate — upgrade application config documents to the current schema version."""

from cfgmigrate.migrate import CURRENT_VERSION, UnsupportedVersionError, migrate

__all__ = ["CURRENT_VERSION", "UnsupportedVersionError", "migrate"]
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

from typing import Any, Callable

Config = dict[str, Any]

CURRENT_VERSION = 2


class UnsupportedVersionError(ValueError):
    """The document's ``version`` is missing, unknown, or newer than this library."""


def _v1_to_v2(old: Config) -> Config:
    return {
        "version": 2,
        "request_timeout": old["timeout"],
        "plugins": old.get("plugins", []),
    }


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
import pytest

from cfgmigrate import CURRENT_VERSION, UnsupportedVersionError, migrate


def v1(**extra):
    doc = {"version": 1, "timeout": 30
```
