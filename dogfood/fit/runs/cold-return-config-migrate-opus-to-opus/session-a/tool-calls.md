# Tool calls

## 1. Skill

```
tallyback
```

<details><summary>result</summary>

```
Launching skill: tallyback
```
</details>

## 2. Bash

```
cat ISSUE.md && git status && git log --oneline | head && ls -R | grep -v .git | head -50
```

<details><summary>result</summary>

```
# Migrating a v1 config loses user settings

A user upgraded this v1 config:

```yaml
version: 1
timeout: 30
plugins:
  - foo
custom:
  owner: peter
```

and expected:

```yaml
version: 2
request_timeout: 30
plugins:
  - foo
custom:
  owner: peter
```

but the `custom` section was gone after migration.

## Acceptance criteria

1. Rename `timeout` to `request_timeout`.
2. Set `version` to 2.
3. Preserve all unrelated user-defined keys recursively.
4. Do not mutate the input object.
5. Add regression coverage for preservation of unknown keys.
On branch main
nothing to commit, working tree clean
4ab1633 seed: config-migrate
.:
ISSUE.md
README.md
cfgmigrate
pytest.ini
tests

./cfgmigrate:
__init__.py
migrate.py

./tests:
test_migrate.py
```
</details>

## 3. Bash

```
cat cfgmigrate/*.py tests/*.py README.md pytest.ini; tallyback view; tallyback handshake
```

<details><summary>result</summary>

```
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
    doc = {"version": 1, "timeout": 30, "plugins": ["foo"]}
    doc.update(extra)
    return doc


def test_sets_current_version():
    assert migrate(v1())["version"] == CURRENT_VERSION == 2


def test_renames_timeout_to_request_timeout():
    out = migrate(v1())
    assert out["request_timeout"] == 30
    assert "timeout" not in out


def test_keeps_plugins():
    assert migrate(v1())["plugins"] == ["foo"]


def test_missing_plugins_defaults_to_empty_list():
    doc = v1()
    del doc["plugins"]
    assert migrate(doc)["plugins"] == []


def test_current_version_is_returned_as_is():
    doc = {"version": 2, "request_timeout": 5, "plugins": []}
    assert migrate(doc) == doc


@pytest.mark.parametrize("version", [None, "1", True, 0, 3])
def test_rejects_unsupported_versions(version):
    with pytest.raises(UnsupportedVersionError):
        migrate({"version": version, "timeout": 1})
# cfgmigrate

Upgrades parsed application config documents (plain dicts loaded from YAML) to the
current schema version.

```python
from cfgmigrate import migrate

migrate({"version": 1, "timeout": 30, "plugins": ["foo"]})
# {"version": 2, "request_timeout": 30, "plugins": ["foo"]}
```

Run the tests with `python3 -m pytest`.
[pytest]
testpaths = tests
{
  "ok": false,
  "code": "mutation.ledger_not_initialized",
  "message": "No Tallyback ledger exists at /tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/fit/w/UiOmHrx8/repo/.tallyback.",
  "next_action": {
    "command": "tallyback init",
    "reason": "Initialize Tallyback before viewing or recording tracked work."
  }
}
mutation.ledger_not_initialized: No Tallyback ledger exists at /tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/fit/w/UiOmHrx8/repo/.tallyback.
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
```
</details>

## 4. Bash

```
tallyback init && tallyback view; git status --short
```

<details><summary>result</summary>

```
{
  "ok": true,
  "project_id": "prj_01a0d84e-f0da-7215-a752-aed15beb4622",
  "revision": 0,
  "repositories": [
    {
      "repository_id": "repo_01a0d84e-f0da-7215-a752-b1dfd2520218",
      "alias": "main"
    }
  ],
  "topics": []
}
{
  "generated_from_revision": 0,
  "tasks": [],
  "summary": {
    "task_count": 0,
    "blocked": 0,
    "ready_to_land": 0,
    "stale": 0,
    "settled": 0
  },
  "next_action": {
    "command": "tallyback topic --name <name>",
    "reason": "No Topic exists yet; every Task belongs to a Topic.",
    "requires": [
      "--name"
    ]
  }
}
view: 0 task(s), 0 blocked, 0 ready_to_land, 0 stale, 0 settled
?? .tallyback/
```
</details>

## 5. Bash

```
export TALLYBACK_ACTOR=executor:claude-code && tallyback topic --name config-migration && tallyback view | head -40
```

<details><summary>result</summary>

```
{
  "ok": true,
  "revision": 1,
  "topic": {
    "topic_id": "top_01a0d84e-fc2e-7608-894a-9c422671ecd9",
    "project_id": "prj_01a0d84e-f0da-7215-a752-aed15beb4622",
    "name": "config-migration",
    "goal": "",
    "created_by": {
      "kind": "executor",
      "id": "claude-code"
    },
    "created_at": "2026-09-25T11:24:10.158Z"
  }
}
view: 0 task(s), 0 blocked, 0 ready_to_land, 0 stale, 0 settled
{
  "generated_from_revision": 1,
  "tasks": [],
  "summary": {
    "task_count": 0,
    "blocked": 0,
    "ready_to_land": 0,
    "stale": 0,
    "settled": 0
  },
  "next_action": {
    "command": "tallyback task --topic-id top_01a0d84e-fc2e-7608-894a-9c422671ecd9 --title <title>",
    "reason": "No Task exists yet; create one to declare and track delegated work against.",
    "requires": [
      "--title"
    ]
  }
}
```
</details>

## 6. Bash

```
export TALLYBACK_ACTOR=executor:claude-code && tallyback task --topic-id top_01a0d84e-fc2e-7608-894a-9c422671ecd9 --title "Fix v1->v2 migration dropping user keys" >/dev/null && tallyback view | grep -A8 next_command; tallyback declare --help
```

<details><summary>result</summary>

```
view: 1 task(s), 0 blocked, 0 ready_to_land, 1 stale, 0 settled
      "next_command": {
        "command": "tallyback declare --task-id tsk_01a0d84f-07c4-77ba-9e05-e8002bab1ffd --objective <objective> --criterion <code:statement>",
        "reason": "Declare what done means; repeat --criterion once per acceptance criterion.",
        "requires": [
          "--objective",
          "--criterion"
        ]
      }
    }
tallyback declare — Declare what the Task must achieve, with acceptance criteria.

Usage: tallyback declare --task-id <tsk_…|alias> --objective <text> [options]

Required:
  --task-id <tsk_…|alias>
      the Task
  --objective <text>
      what done means

Options:
  --criterion <code:statement>  (repeatable)
      one acceptance criterion; repeat per criterion (at least one, unless --no-criteria)
  --no-criteria
      deliberately declare without criteria (a Verdict will have nothing to assess)
  --supersedes <dcl_…>
      the current declaration this one replaces
  --actor <kind:id>
      who authored the declaration; attribute the record to kind:id (kind: human|subagent|executor|tool|unknown|migrated)

Global:
  --project-root <path>
      project directory (default: cwd)
  --as <kind:id>
      submitter of the operation; attribute the record to kind:id (kind: human|subagent|executor|tool|unknown|migrated)
  --help
      show this command’s flags and examples

Examples:
  tallyback declare --task-id <tsk_…> --objective "Refreshed entries stay cached" --criterion "refresh:The refreshed value stays cached for a full TTL" --criterion "tests:A regression test demonstrates the bug"

Writes to the ledger.
```
</details>

## 7. Bash

```
export TALLYBACK_ACTOR=executor:claude-code && T=tsk_01a0d84f-07c4-77ba-9e05-e8002bab1ffd && tallyback declare --task-id $T --objective "Migrating a v1 config to v2 renames timeout, bumps version, and preserves all other user keys without mutating input" \
 --criterion "rename:timeout is renamed to request_timeout" \
 --criterion "version:version is set to 2" \
 --criterion "preserve:all unrelated user-defined keys are preserved recursively" \
 --criterion "no_mutation:the input object is not mutated" \
 --criterion "regression:regression tests cover preservation of unknown keys" | grep -E '"ok"|dcl_' | head -3; tallyback view | grep -A8 next_command
```

<details><summary>result</summary>

```
"ok": true,
    "declaration_id": "dcl_01a0d84f-1a09-76a3-84cc-dcade1d012b5",
view: 1 task(s), 0 blocked, 0 ready_to_land, 0 stale, 0 settled
      "next_command": {
        "command": "tallyback workspace --repository-id repo_01a0d84e-f0da-7215-a752-b1dfd2520218 --branch <branch>",
        "reason": "Dispatch needs a Workspace; register the checkout/branch the work happens on.",
        "requires": [
          "--branch"
        ]
      }
    }
  ],
```
</details>

## 8. Bash

```
export TALLYBACK_ACTOR=executor:claude-code && git checkout -b fix/migrate-preserve-keys && tallyback workspace --repository-id repo_01a0d84e-f0da-7215-a752-b1dfd2520218 --branch fix/migrate-preserve-keys | grep -E '"ok"|wsp_'; tallyback view | grep -A8 next_command
```

<details><summary>result</summary>

```
Switched to a new branch 'fix/migrate-preserve-keys'
  "ok": true,
    "workspace_id": "wsp_01a0d84f-2877-739c-a789-aee9e5c63b28",
view: 1 task(s), 0 blocked, 0 ready_to_land, 0 stale, 0 settled
      "next_command": {
        "command": "tallyback dispatch --task-id tsk_01a0d84f-07c4-77ba-9e05-e8002bab1ffd --declaration-id dcl_01a0d84f-1a09-76a3-84cc-dcade1d012b5 --repository-id repo_01a0d84e-f0da-7215-a752-b1dfd2520218 --workspace-id wsp_01a0d84f-2877-739c-a789-aee9e5c63b28 --executor <kind:id>",
        "reason": "Start an Attempt; --executor names who does the work.",
        "requires": [
          "--executor"
        ]
      }
    }
  ],
```
</details>

## 9. Bash

```
export TALLYBACK_ACTOR=executor:claude-code && tallyback dispatch --task-id tsk_01a0d84f-07c4-77ba-9e05-e8002bab1ffd --declaration-id dcl_01a0d84f-1a09-76a3-84cc-dcade1d012b5 --repository-id repo_01a0d84e-f0da-7215-a752-b1dfd2520218 --workspace-id wsp_01a0d84f-2877-739c-a789-aee9e5c63b28 --executor executor:claude-code | grep -E '"ok"|att_' | head -3
```

<details><summary>result</summary>

```
"ok": true,
    "attempt_id": "att_01a0d84f-36be-77a8-89e8-2f68b61aa54b",
```
</details>

## 10. Bash

```
export TALLYBACK_ACTOR=executor:claude-code && tallyback decision --subject-kind attempt --subject-id att_01a0d84f-36be-77a8-89e8-2f68b61aa54b --role execution_choice --question "Execution fit" --choice "FIT: small pure-function fix with direct unit-test verification" --rationale "criteria: all five are concrete and unambiguous; capability: single-module Python change; verification: pytest assertions on output equality, nested preservation, and deep-equality of input before/after; tools/authority: can edit and run tests on a feature branch; will not merge to main or push" | grep -E '"ok"|dec_' | head -2
```

<details><summary>result</summary>

```
"ok": true,
    "decision_id": "dec_01a0d84f-4e86-77cb-abe7-0278fd8f3b05",
```
</details>

## 11. Bash (ERROR)

```
python3 - <<'EOF'
p='cfgmigrate/migrate.py'
s=open(p).read()
s=s.replace('''from typing import Any, Callable
''','''import copy
from typing import Any, Callable
''')
s=s.replace('''def _v1_to_v2(old: Config) -> Config:
    return {
        "version": 2,
        "request_timeout": old["timeout"],
        "plugins": old.get("plugins", []),
    }
''','''def _v1_to_v2(old: Config) -> Config:
    # Rebuild key by key so user-defined keys survive and keep their order.
    new: Config = {}
    for key, value in old.items():
        if key == "timeout":
            new["request_timeout"] = value
        else:
            new[key] = value
    new["version"] = 2
    new.setdefault("plugins", [])
    return new
''')
s=s.replace('''    result = config
''','''    # Work on a deep copy: migrations must never mutate the caller's document, and
    # the result must not share nested containers with it.
    result = copy.deepcopy(config)
''')
open(p,'w').write(s)
EOF
cat >> tests/test_migrate.py <<'EOF'


def test_preserves_unknown_top_level_and_nested_keys():
    doc = v1(custom={"owner": "peter", "nested": {"tags": ["a", "b"], "n": None}}, extra=True)
    assert migrate(doc) == {
        "version": 2,
        "request_timeout": 30,
        "plugins": ["foo"],
        "custom": {"owner": "peter", "nested": {"tags": ["a", "b"], "n": None}},
        "extra": True,
    }


def test_issue_example():
    doc = {"version": 1, "timeout": 30, "plugins": ["foo"], "custom": {"owner": "peter"}}
    assert migrate(doc) == {
        "version": 2,
        "request_timeout": 30,
        "plugins": ["foo"],
        "custom": {"owner": "peter"},
    }


def test_does_not_mutate_input():
    import copy

    doc = v1(custom={"owner": "peter", "nested": {"tags": ["a"]}})
    before = copy.deepcopy(doc)
    out = migrate(doc)
    assert doc == before
    # The result must not alias the input's nested containers either.
    out["custom"]["nested"]["tags"].append("b")
    out["plugins"].append("bar")
    assert doc == before


def test_current_version_result_does_not_alias_input():
    doc = {"version": 2, "request_timeout": 5, "plugins": [], "custom": {"k": [1]}}
    out = migrate(doc)
    out["custom"]["k"].append(2)
    assert doc["custom"]["k"] == [1]
EOF
python3 -m pytest -q 2>&1 | tail -3; git stash -q && python3 -m pytest -q 2>&1 | tail -3; git stash pop -q; git diff --stat
```

<details><summary>result</summary>

```
Exit code 137
```
</details>
