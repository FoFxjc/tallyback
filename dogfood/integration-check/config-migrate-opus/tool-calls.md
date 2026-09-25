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
cat ISSUE.md; git status; git log --oneline | head; ls -la
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
5339376 seed: config-migrate
total 40
drwxr-xr-x 6 root root 4096 Sep 25 08:20 .
drwx------ 3 root root 4096 Sep 25 08:20 ..
drwxr-xr-x 3 root root 4096 Sep 25 08:20 .claude
drwxr-xr-x 8 root root 4096 Sep 25 08:21 .git
-rw-r--r-- 1 root root   28 Sep 25 08:20 .gitignore
-rw-r--r-- 1 root root  547 Sep 25 08:20 ISSUE.md
-rw-r--r-- 1 root root  328 Sep 25 08:20 README.md
drwxr-xr-x 2 root root 4096 Sep 25 08:20 cfgmigrate
-rw-r--r-- 1 root root   27 Sep 25 08:20 pytest.ini
drwxr-xr-x 2 root root 4096 Sep 25 08:20 tests
```
</details>

## 3. Bash

```
tallyback view; tallyback handshake; cat cfgmigrate/*.py tests/*.py README.md
```

<details><summary>result</summary>

```
{
  "ok": false,
  "code": "mutation.ledger_not_initialized",
  "message": "No Tallyback ledger exists at /tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/ic/w/nAcwhjDl/repo/.tallyback.",
  "next_action": {
    "command": "tallyback init",
    "reason": "Initialize Tallyback before viewing or recording tracked work."
  }
}
mutation.ledger_not_initialized: No Tallyback ledger exists at /tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/ic/w/nAcwhjDl/repo/.tallyback.
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
```
</details>

## 4. Bash

```
export TALLYBACK_ACTOR=executor:claude-code; tallyback init; tallyback view
```

<details><summary>result</summary>

```
{
  "ok": true,
  "project_id": "prj_01a0d7a7-6283-73bb-b8d5-081da30d8a97",
  "revision": 0,
  "repositories": [
    {
      "repository_id": "repo_01a0d7a7-6283-73bb-b8d5-0f5e3e3a13dc",
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
```
</details>

## 5. Bash

```
export TALLYBACK_ACTOR=executor:claude-code; tallyback topic --name config-migration; tallyback view | tail -15
```

<details><summary>result</summary>

```
{
  "ok": true,
  "revision": 1,
  "topic": {
    "topic_id": "top_01a0d7a7-6c2c-7178-ae90-b1af13b62d19",
    "project_id": "prj_01a0d7a7-6283-73bb-b8d5-081da30d8a97",
    "name": "config-migration",
    "goal": "",
    "created_by": {
      "kind": "executor",
      "id": "claude-code"
    },
    "created_at": "2026-09-25T08:21:08.780Z"
  }
}
view: 0 task(s), 0 blocked, 0 ready_to_land, 0 stale, 0 settled
  "summary": {
    "task_count": 0,
    "blocked": 0,
    "ready_to_land": 0,
    "stale": 0,
    "settled": 0
  },
  "next_action": {
    "command": "tallyback task --topic-id top_01a0d7a7-6c2c-7178-ae90-b1af13b62d19 --title <title>",
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
export TALLYBACK_ACTOR=executor:claude-code; tallyback task --topic-id top_01a0d7a7-6c2c-7178-ae90-b1af13b62d19 --title "v1->v2 migration preserves user-defined keys" >/dev/null; tallyback view | tail -25; tallyback declare --help
```

<details><summary>result</summary>

```
view: 1 task(s), 0 blocked, 0 ready_to_land, 1 stale, 0 settled
        "verified": false,
        "settled": false,
        "dispatched": false,
        "ready_to_land": false,
        "stale": true
      },
      "next_action": "declare",
      "next_command": {
        "command": "tallyback declare --task-id tsk_01a0d7a7-76ef-75ea-9e36-78d877f2a9a3 --objective <objective> --criterion <code:statement>",
        "reason": "Declare what done means; repeat --criterion once per acceptance criterion.",
        "requires": [
          "--objective",
          "--criterion"
        ]
      }
    }
  ],
  "summary": {
    "task_count": 1,
    "blocked": 0,
    "ready_to_land": 0,
    "stale": 1,
    "settled": 0
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
export TALLYBACK_ACTOR=executor:claude-code; T=tsk_01a0d7a7-76ef-75ea-9e36-78d877f2a9a3
tallyback declare --task-id $T --objective "Migrating a v1 config to v2 renames timeout, bumps version, and preserves all other user keys without mutating input" \
 --criterion "rename:timeout is renamed to request_timeout" \
 --criterion "version:version is set to 2" \
 --criterion "preserve:all unrelated user-defined keys are preserved recursively" \
 --criterion "no_mutation:the input object is not mutated" \
 --criterion "regression:regression tests cover preservation of unknown keys" | head -5
tallyback view | grep -A8 next_command
```

<details><summary>result</summary>

```
{
  "ok": true,
  "revision": 3,
  "declaration": {
    "declaration_id": "dcl_01a0d7a7-87d6-74a1-a7cf-228d24b0e545",
view: 1 task(s), 0 blocked, 0 ready_to_land, 0 stale, 0 settled
      "next_command": {
        "command": "tallyback workspace --repository-id repo_01a0d7a7-6283-73bb-b8d5-0f5e3e3a13dc --branch <branch>",
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
export TALLYBACK_ACTOR=executor:claude-code; git checkout -b fix/preserve-user-keys
tallyback workspace --repository-id repo_01a0d7a7-6283-73bb-b8d5-0f5e3e3a13dc --branch fix/preserve-user-keys | head -8
tallyback view | grep -A8 next_command
```

<details><summary>result</summary>

```
Switched to a new branch 'fix/preserve-user-keys'
{
  "ok": true,
  "revision": 4,
  "workspace": {
    "workspace_id": "wsp_01a0d7a7-9367-741f-853a-06e2b2f0f83d",
    "repository_id": "repo_01a0d7a7-6283-73bb-b8d5-0f5e3e3a13dc",
    "branch": "fix/preserve-user-keys"
  }
view: 1 task(s), 0 blocked, 0 ready_to_land, 0 stale, 0 settled
      "next_command": {
        "command": "tallyback dispatch --task-id tsk_01a0d7a7-76ef-75ea-9e36-78d877f2a9a3 --declaration-id dcl_01a0d7a7-87d6-74a1-a7cf-228d24b0e545 --repository-id repo_01a0d7a7-6283-73bb-b8d5-0f5e3e3a13dc --workspace-id wsp_01a0d7a7-9367-741f-853a-06e2b2f0f83d --executor <kind:id>",
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
export TALLYBACK_ACTOR=executor:claude-code; tallyback dispatch --task-id tsk_01a0d7a7-76ef-75ea-9e36-78d877f2a9a3 --declaration-id dcl_01a0d7a7-87d6-74a1-a7cf-228d24b0e545 --repository-id repo_01a0d7a7-6283-73bb-b8d5-0f5e3e3a13dc --workspace-id wsp_01a0d7a7-9367-741f-853a-06e2b2f0f83d --executor executor:claude-code | grep -m2 -E 'attempt_id|ok'
```

<details><summary>result</summary>

```
"ok": true,
    "attempt_id": "att_01a0d7a7-a123-7755-b595-1fc939c3c1f2",
```
</details>

## 10. Bash

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
    new = copy.deepcopy(old)
    new["version"] = 2
    new["request_timeout"] = new.pop("timeout")
    new.setdefault("plugins", [])
    return new
''')
s=s.replace('''    result = config
    while''','''    result = copy.deepcopy(config)
    while''')
s=s.replace('''* v1 -> v2: ``timeout`` (seconds) was renamed to ``request_timeout``.
''','''* v1 -> v2: ``timeout`` (seconds) was renamed to ``request_timeout``.

Migrations only touch the keys their schema step changes; every other key the user
wrote is carried over unchanged. ``migrate`` never mutates its argument: the result
is a deep copy that shares no mutable state with the input.
''')
open(p,'w').write(s)
EOF
cat >> tests/test_migrate.py <<'EOF'


ISSUE_V1 = {"version": 1, "timeout": 30, "plugins": ["foo"], "custom": {"owner": "peter"}}


def test_issue_example_preserves_custom_section():
    assert migrate(ISSUE_V1) == {
        "version": 2,
        "request_timeout": 30,
        "plugins": ["foo"],
        "custom": {"owner": "peter"},
    }


def test_preserves_unknown_keys_recursively():
    nested = {"a": {"b": [1, {"c": None}], "timeout": 5}, "flag": True}
    out = migrate(v1(custom=nested, extra="x", retries=3))
    assert out["custom"] == nested
    assert out["extra"] == "x"
    assert out["retries"] == 3
    # Only the top-level ``timeout`` is renamed; nested user keys are left alone.
    assert out["custom"]["a"]["timeout"] == 5


def test_does_not_mutate_input():
    import copy

    doc = v1(custom={"owner": "peter", "tags": ["a"]})
    snapshot = copy.deepcopy(doc)
    out = migrate(doc)
    assert doc == snapshot
    # The result shares no mutable state with the input.
    out["custom"]["tags"].append("b")
    out["plugins"].append("bar")
    assert doc == snapshot


def test_current_version_result_does_not_alias_input():
    doc = {"version": 2, "request_timeout": 5, "plugins": [], "custom": {"k": [1]}}
    out = migrate(doc)
    out["custom"]["k"].append(2)
    assert doc["custom"]["k"] == [1]
EOF
git diff cfgmigrate; python3 -m pytest -q 2>&1 | tail -3
```

<details><summary>result</summary>

```
diff --git a/cfgmigrate/migrate.py b/cfgmigrate/migrate.py
index c9b01d4..33088bf 100644
--- a/cfgmigrate/migrate.py
+++ b/cfgmigrate/migrate.py
@@ -10,10 +10,15 @@ single-step migration in order, and returns the upgraded document.
 Schema history:
 
 * v1 -> v2: ``timeout`` (seconds) was renamed to ``request_timeout``.
+
+Migrations only touch the keys their schema step changes; every other key the user
+wrote is carried over unchanged. ``migrate`` never mutates its argument: the result
+is a deep copy that shares no mutable state with the input.
 """
 
 from __future__ import annotations
 
+import copy
 from typing import Any, Callable
 
 Config = dict[str, Any]
@@ -26,11 +31,11 @@ class UnsupportedVersionError(ValueError):
 
 
 def _v1_to_v2(old: Config) -> Config:
-    return {
-        "version": 2,
-        "request_timeout": old["timeout"],
-        "plugins": old.get("plugins", []),
-    }
+    new = copy.deepcopy(old)
+    new["version"] = 2
+    new["request_timeout"] = new.pop("timeout")
+    new.setdefault("plugins", [])
+    return new
 
 
 _MIGRATIONS: dict[int, Callable[[Config], Config]] = {
@@ -46,7 +51,7 @@ def migrate(config: Config) -> Config:
     if version > CURRENT_VERSION or (version < CURRENT_VERSION and version not in _MIGRATIONS):
         raise UnsupportedVersionError(f"cannot migrate config version {version}")
 
-    result = config
+    result = copy.deepcopy(config)
     while result["version"] < CURRENT_VERSION:
         result = _MIGRATIONS[result["version"]](result)
     return result
..............                                                           [100%]
14 passed in 0.03s
```
</details>

## 11. Bash

```
git stash push cfgmigrate/migrate.py -q && python3 -m pytest -q 2>&1 | grep -E 'FAILED|passed|failed'; git stash pop -q && python3 -m pytest -q 2>&1 | tail -1; git diff --stat
```

<details><summary>result</summary>

```
FAILED tests/test_migrate.py::test_issue_example_preserves_custom_section - A...
FAILED tests/test_migrate.py::test_preserves_unknown_keys_recursively - KeyEr...
FAILED tests/test_migrate.py::test_does_not_mutate_input - KeyError: 'custom'
FAILED tests/test_migrate.py::test_current_version_result_does_not_alias_input
4 failed, 10 passed in 0.03s
14 passed in 0.02s
 cfgmigrate/migrate.py | 17 +++++++++++------
 tests/test_migrate.py | 42 ++++++++++++++++++++++++++++++++++++++++++
 2 files changed, 53 insertions(+), 6 deletions(-)
```
</details>

## 12. Bash

```
export TALLYBACK_ACTOR=executor:claude-code; git add cfgmigrate tests && git commit -q -m "Preserve user-defined keys when migrating v1 configs

The v1->v2 migration rebuilt the document from a fixed set of keys, dropping
anything else (e.g. a user's custom section). It now deep-copies the input,
renames timeout to request_timeout, and sets version 2, leaving every other
key intact. migrate() also never aliases or mutates its argument.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01H3hSr2VJGiKh11htiis8g5" && git log --oneline -1
tallyback evidence --help | head -30; tallyback claim --help | head -30
```

<details><summary>result</summary>

```
1686844 Preserve user-defined keys when migrating v1 configs
tallyback evidence — Record an inspectable piece of Evidence (link it from a claim with --evidence).

Usage: tallyback evidence --kind <git_commit|git_diff|file_snapshot|command_run|test_run|artifact|observation|extension> --payload <json> [options]

Required:
  --kind <git_commit|git_diff|file_snapshot|command_run|test_run|artifact|observation|extension>
      evidence kind
  --payload <json>
      kind-specific JSON payload

Options:
  --note <text>
      free-text note
  --actor <kind:id>
      who authored the evidence; attribute the record to kind:id (kind: human|subagent|executor|tool|unknown|migrated)

Notes:
  Payloads are closed per kind; no other property is accepted:
  git_commit: {repository_id (required), object_id (required), object_format (required)}
  git_diff: {repository_id (required), base_object_id, head_object_id, path, digest}
  file_snapshot: {repository_id (required), path (required), object_id, digest}
  command_run: {command (required), exit_code (required), started_at, finished_at, repository_id, workspace_id, working_tree, output_digest}
  test_run: {exit_code (required), command, started_at, finished_at, repository_id, workspace_id, working_tree, output_digest}
  artifact: {locator, digest}
  observation: {text (required), observer, observed_at}
  extension: {namespace (required), extension_kind (required), ref (required)}
  Put the human-readable result (e.g. "11 passed; test_x fails on the unfixed code") in --note.
  Evidence is recorded first and then linked from the Claim: `tallyback claim … --evidence <evi_…>` (or from a Verdict: `tallyback verdict … --evidence <evi_…>`).

Global:
tallyback claim — Record what an Attempt claims it did (a claim, not a fact).

Usage: tallyback claim --task-id <tsk_…|alias> --attempt-id <att_…> --declaration-id <dcl_…> --statement <text> [options]

Required:
  --task-id <tsk_…|alias>
      the Task
  --attempt-id <att_…>
      the Attempt
  --declaration-id <dcl_…>
      the declaration the Attempt was dispatched under
  --statement <text>
      the claim

Options:
  --evidence <evi_…>  (repeatable)
      Evidence supporting the claim; repeat per record
  --actor <kind:id>
      who authored the claim; attribute the record to kind:id (kind: human|subagent|executor|tool|unknown|migrated)

Global:
  --project-root <path>
      project directory (default: cwd)
  --as <kind:id>
      submitter of the operation; attribute the record to kind:id (kind: human|subagent|executor|tool|unknown|migrated)
  --help
      show this command’s flags and examples

Examples:
  tallyback claim --task-id <tsk_…> --attempt-id <att_…> --declaration-id <dcl_…> --statement "…" --evidence <evi_…>
```
</details>

## 13. Bash

```
export TALLYBACK_ACTOR=executor:claude-code; R=repo_01a0d7a7-6283-73bb-b8d5-0f5e3e3a13dc; W=wsp_01a0d7a7-9367-741f-853a-06e2b2f0f83d
H=$(git rev-parse HEAD); B=$(git rev-parse main)
python3 -m pytest -q >/dev/null; EC=$?
tallyback evidence --kind git_commit --payload "{\"repository_id\":\"$R\",\"object_id\":\"$H\",\"object_format\":\"sha1\"}" --note "Fix commit on fix/preserve-user-keys" | grep -m1 evidence_id
tallyback evidence --kind test_run --payload "{\"exit_code\":$EC,\"command\":\"python3 -m pytest -q\",\"repository_id\":\"$R\",\"workspace_id\":\"$W\"}" --note "14 passed at $H (10 existing + 4 new regression tests)" | grep -m1 evidence_id
tallyback evidence --kind command_run --payload "{\"command\":\"git stash push cfgmigrate/migrate.py && python3 -m pytest -q\",\"exit_code\":1,\"repository_id\":\"$R\",\"workspace_id\":\"$W\"}" --note "Against the original migrate.py ($B), the new tests fail: 4 failed, 10 passed (test_issue_example_preserves_custom_section, test_preserves_unknown_keys_recursively, test_does_not_mutate_input, test_current_version_result_does_not_alias_input)" | grep -m1 evidence_id
tallyback evidence --kind git_diff --payload "{\"repository_id\":\"$R\",\"base_object_id\":\"$B\",\"head_object_id\":\"$H\"}" --note "Diff: _v1_to_v2 deep-copies input, pops timeout into request_timeout, sets version 2, keeps plugins default; migrate() deep-copies before migrating" | grep -m1 evidence_id
```

<details><summary>result</summary>

```
"evidence_id": "evi_01a0d7a8-01a7-7242-9ba8-3ed24f3dccc1",
    "evidence_id": "evi_01a0d7a8-0328-758a-bef3-16e525ca0435",
    "evidence_id": "evi_01a0d7a8-0497-76f4-9c9e-3e0e0387a23f",
    "evidence_id": "evi_01a0d7a8-0603-72df-8564-63bbb997a0b3",
```
</details>

## 14. Bash

```
export TALLYBACK_ACTOR=executor:claude-code
tallyback claim --task-id tsk_01a0d7a7-76ef-75ea-9e36-78d877f2a9a3 --attempt-id att_01a0d7a7-a123-7755-b595-1fc939c3c1f2 --declaration-id dcl_01a0d7a7-87d6-74a1-a7cf-228d24b0e545 --statement "v1->v2 migration now renames timeout, sets version 2, preserves all other user keys via deep copy, never mutates input; 4 regression tests added" --evidence evi_01a0d7a8-01a7-7242-9ba8-3ed24f3dccc1 --evidence evi_01a0d7a8-0328-758a-bef3-16e525ca0435 --evidence evi_01a0d7a8-0497-76f4-9c9e-3e0e0387a23f --evidence evi_01a0d7a8-0603-72df-8564-63bbb997a0b3 | grep -m1 claim_id
tallyback view | grep -A10 next_command; tallyback verdict --help | sed -n 1,45p
```

<details><summary>result</summary>

```
"claim_id": "clm_01a0d7a8-174c-72ef-9c23-4639ddddbf51",
view: 1 task(s), 0 blocked, 0 ready_to_land, 0 stale, 0 settled
      "next_command": {
        "command": "tallyback verdict --claim clm_01a0d7a8-174c-72ef-9c23-4639ddddbf51 --criterion rename=<assessment> --criterion version=<assessment> --criterion preserve=<assessment> --criterion no_mutation=<assessment> --criterion regression=<assessment> --confidence <low|medium|high> --rationale <text>",
        "reason": "Judge the claim criterion by criterion (assessment: supported|partially_supported|unsupported|contradicted); --finding/--finding-basis say what supports each one.",
        "requires": [
          "--criterion rename",
          "--criterion version",
          "--criterion preserve",
          "--criterion no_mutation",
          "--criterion regression",
          "--confidence",
          "--rationale"
tallyback verdict — Judge a Claim criterion by criterion (records CheckInvocation → CheckResult → Verdict).

Usage: tallyback verdict --claim <clm_…> --criterion <<code|cri_…>=<assessment>> --confidence <low|medium|high> --rationale <text> [options]

Required:
  --claim <clm_…>
      the Claim judged
  --criterion <<code|cri_…>=<assessment>>  (repeatable)
      assessment per criterion: supported|partially_supported|unsupported|contradicted
  --confidence <low|medium|high>
      confidence level
  --rationale <text>
      why, citing the checks

Options:
  --finding <<code|cri_…>=<summary>>  (repeatable)
      what was found for that criterion (recorded as its finding summary)
  --finding-basis <<code|cri_…>=<evi_…|rec_…>>  (repeatable)
      the Evidence/Reconciliation that supports that criterion; repeat per reference
  --attempt <att_…>
      the Attempt (default: the claim’s)
  --allow-partial
      allow leaving criteria unassessed
  --evidence <evi_…>  (repeatable)
      Evidence the Verdict rests on
  --reconciliation <rec_…>  (repeatable)
      Reconciliations the Verdict rests on
  --finality <final|preliminary>
      default: final
  --confidence-rationale <text>
      why this confidence
  --conclusion <supported|partially_supported|unsupported|contradicted>
      overall conclusion (required with --allow-partial or mixed assessments)
  --uncertainty <text>  (repeatable)
      a stated uncertainty
  --limitation <text>  (repeatable)
      a stated limitation
  --checker-id <id>
      checker identity (default: operator-authored)
  --checker-version <version>
      checker version (default: v1)
  --actor <kind:id>
      who authored the Verdict; attribute the record to kind:id (kind: human|subagent|executor|tool|unknown|migrated)

Global:
```
</details>

## 15. Bash

```
python3 -c "
from cfgmigrate import migrate
i={'version':1,'timeout':30,'plugins':['foo'],'custom':{'owner':'peter'}}
import copy; s=copy.deepcopy(i); o=migrate(i); print(o); print('input unchanged:', i==s, 'shared custom:', o['custom'] is i['custom'])"
```

<details><summary>result</summary>

```
{'version': 2, 'plugins': ['foo'], 'custom': {'owner': 'peter'}, 'request_timeout': 30}
input unchanged: True shared custom: False
```
</details>

## 16. Bash

```
export TALLYBACK_ACTOR=executor:claude-code
E1=evi_01a0d7a8-01a7-7242-9ba8-3ed24f3dccc1; E2=evi_01a0d7a8-0328-758a-bef3-16e525ca0435; E3=evi_01a0d7a8-0497-76f4-9c9e-3e0e0387a23f; E4=evi_01a0d7a8-0603-72df-8564-63bbb997a0b3
tallyback verdict --claim clm_01a0d7a8-174c-72ef-9c23-4639ddddbf51 \
 --criterion rename=supported --criterion version=supported --criterion preserve=supported --criterion no_mutation=supported --criterion regression=supported \
 --finding "rename=test_renames_timeout_to_request_timeout passes; diff pops timeout into request_timeout" --finding-basis rename=$E2 --finding-basis rename=$E4 \
 --finding "version=test_sets_current_version passes" --finding-basis version=$E2 \
 --finding "preserve=issue example and nested unknown keys (incl. nested 'timeout') preserved; tests fail on original code" --finding-basis preserve=$E2 --finding-basis preserve=$E3 \
 --finding "no_mutation=input equals deep snapshot after migrate and after mutating the output; result shares no nested objects" --finding-basis no_mutation=$E2 --finding-basis no_mutation=$E3 \
 --finding "regression=4 new tests, all 4 fail on original migrate.py and pass on fix" --finding-basis regression=$E3 --finding-basis regression=$E2 \
 --evidence $E1 --evidence $E2 --evidence $E3 --evidence $E4 \
 --confidence high --rationale "Full suite 14/14 at commit 1686844; the 4 new tests fail against the unfixed code; issue example checked directly outside pytest" \
 --limitation "Verified by the same executor that wrote the fix; no independent reviewer" \
 --uncertainty "Output key order differs from the issue's YAML (request_timeout is appended last); the dict is semantically equal" | head -3
tallyback view | grep -A10 next_command
```

<details><summary>result</summary>

```
{
  "ok": true,
  "revision": 12,
view: 1 task(s), 0 blocked, 0 ready_to_land, 0 stale, 0 settled
      "next_command": {
        "command": "tallyback settle --task-id tsk_01a0d7a7-76ef-75ea-9e36-78d877f2a9a3 --attempt-id att_01a0d7a7-a123-7755-b595-1fc939c3c1f2 --decision <accept|retry|abandon|land> --verdict-id ver_01a0d7a8-42cb-7405-8665-d283c9a04921 --rationale <text>",
        "reason": "Record the decision explicitly. land authorises integration; accept does not.",
        "requires": [
          "--decision",
          "--rationale"
        ]
      }
    }
  ],
  "summary": {
```
</details>

## 17. Bash

```
tallyback end --help | sed -n 1,25p
```

<details><summary>result</summary>

```
tallyback end — Record how an Attempt stopped (never settles the Task).

Usage: tallyback end --attempt-id <att_…> --outcome <returned|failed|cancelled> [options]

Required:
  --attempt-id <att_…>
      the Attempt
  --outcome <returned|failed|cancelled>
      how it stopped

Options:
  --reason <text>
      why
  --supersedes <ate_…>
      the AttemptEnd this one replaces
  --actor <kind:id>
      who authored the AttemptEnd; attribute the record to kind:id (kind: human|subagent|executor|tool|unknown|migrated)

Global:
  --project-root <path>
      project directory (default: cwd)
  --as <kind:id>
      submitter of the operation; attribute the record to kind:id (kind: human|subagent|executor|tool|unknown|migrated)
  --help
      show this command’s flags and examples
```
</details>

## 18. Bash

```
export TALLYBACK_ACTOR=executor:claude-code
tallyback end --attempt-id att_01a0d7a7-a123-7755-b595-1fc939c3c1f2 --outcome returned --reason "Fix committed at 1686844 on fix/preserve-user-keys" | head -3
tallyback settle --task-id tsk_01a0d7a7-76ef-75ea-9e36-78d877f2a9a3 --attempt-id att_01a0d7a7-a123-7755-b595-1fc939c3c1f2 --decision accept --verdict-id ver_01a0d7a8-42cb-7405-8665-d283c9a04921 --rationale "All 5 criteria supported with high confidence (14/14 tests; new tests fail on unfixed code). Accepting the work; landing to main left to the user's explicit decision." | head -3
tallyback view | grep -E '"next_action"|settled|ready_to_land|decision'; tallyback watch | tail -3; git status -s
```

<details><summary>result</summary>

```
{
  "ok": true,
  "revision": 13,
{
  "ok": true,
  "revision": 14,
view: 1 task(s), 0 blocked, 0 ready_to_land, 0 stale, 1 settled
        "decision": "accept",
        "rationale": "All 5 criteria supported with high confidence (14/14 tests; new tests fail on unfixed code). Accepting the work; landing to main left to the user's explicit decision."
        "settled": true,
        "ready_to_land": false,
      "next_action": "settled: accept",
    "ready_to_land": 0,
    "settled": 1
watch: 0 open attempt(s), 0 stale, 0 lost, 0 claim_without_branch_advance, 0 unresolved
    "unresolved": 0
  }
}
?? .tallyback/
```
</details>
