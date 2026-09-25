# Failed or rejected Tallyback invocations

## call 3
```
tallyback view; tallyback handshake; cat cfgmigrate/*.py tests/*.py README.md pytest.ini
```
```
{
  "ok": false,
  "code": "mutation.ledger_not_initialized",
  "message": "No Tallyback ledger exists at /tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/bench/w/oYheFqwb/repo/.tallyback.",
  "next_action": {
    "command": "tallyback init",
    "reason": "Initialize Tallyback before viewing or recording tracked work."
  }
}
mutation.ledger_not_initialized: No Tallyback ledger exists at /tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/bench/w/oYheFqwb/repo/.tallyback.
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
    1: _v
```

## call 6
```
tallyback task --topic-id top_01a0d754-5a7d-7388-80ef-e98c93a84495 --title "v1->v2 migration preserves user keys" >/dev/null && tallyback view 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print(json.dumps([t['next_action'] for t in d['tasks']],indent=1))"; tallyback declare --help
```
```
Exit code 1
[
 "declare"
]
error: missing required --task-id
```

## call 16
```
tallyback dispatch --task-id tsk_01a0d754-66f8-75c0-a752-fd30aebcb774 --declaration-id dcl_01a0d754-a7b9-7747-95ea-dfe814552f9d --workspace-id wsp_01a0d754-bb56-7554-92dd-ecadb2f2b8ad --branch fix/preserve-user-keys --base-sha $(git rev-parse HEAD) 2>&1
```
```
Exit code 1
error: missing required --repository-id
```

## call 27
```
S=/tmp/claude-0/-tmp-claude-0--home-user-tallyback-01b763c0-69a7-5ad2-94c6-b173155321d2-scratchpad-bench-w-oYheFqwb-repo/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad; for f in $S/pytest-fixed.txt $S/pytest-prefix.txt; do tail -n 3 $f; done
A="--task-id tsk_01a0d754-66f8-75c0-a752-fd30aebcb774 --attempt-id att_01a0d754-d98e-736b-b01c-65f804f30e35"
tallyback evidence $A --claim-id clm_01a0d755-4c18-76c3-aefb-25104a71b812 --kind test_run --payload "{\"command\":\"python3 -m pytest\",\"sha\":\"$(git rev-parse HEAD)\",\"result\":\"14 passed\",\"exit\":0,\"pre_fix_with_new_tests\":\"4 failed, 10 passed (new tests fail on seed code cfb8d40)\"}" 2>&1 | head -30
```
```
============================== 14 passed in 0.02s ==============================
exit=0
FAILED tests/test_migrate.py::test_current_version_result_does_not_alias_input
4 failed, 10 passed in 0.03s
exit=1
{
  "ok": false,
  "code": "schema.unknown_property",
  "message": "/records/0/payload must have required property 'exit_code'"
}
schema.unknown_property: /records/0/payload must have required property 'exit_code'
```

## call 28
```
A="--task-id tsk_01a0d754-66f8-75c0-a752-fd30aebcb774 --attempt-id att_01a0d754-d98e-736b-b01c-65f804f30e35"; H=$(git rev-parse HEAD)
tallyback evidence $A --claim-id clm_01a0d755-4c18-76c3-aefb-25104a71b812 --kind test_run --payload "{\"command\":\"python3 -m pytest\",\"exit_code\":0,\"sha\":\"$H\",\"summary\":\"14 passed\"}" 2>&1 | head -30
```
```
{
  "ok": false,
  "code": "schema.unknown_property",
  "message": "/records/0/payload must NOT have additional properties"
}
schema.unknown_property: /records/0/payload must NOT have additional properties
```

## call 38
```
tallyback record-check --invocation-id chk_01a0d755-de70-732d-8384-2f69f26d7e48 --outcome verdict_emitted 2>&1 | head -60
```
```
{
  "ok": false,
  "code": "invariant.check_result_outcome_mismatch",
  "message": "recording the check result failed after 5 retries"
}
invariant.check_result_outcome_mismatch: recording the check result failed after 5 retries
```

## call 40
```
I=chk_01a0d755-de70-732d-8384-2f69f26d7e48; tallyback record-check --invocation-id $I --outcome verdict_emitted --verdict '{}' 2>&1 | head -8
```
```
{
  "ok": false,
  "code": "schema.undefined_value",
  "message": "recording the check result failed after 5 retries"
}
schema.undefined_value: recording the check result failed after 5 retries
```
