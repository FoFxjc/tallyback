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
cat ISSUE.md && git status && git log --oneline | head && ls -R | head -50
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
On branch fix/migrate-preserve-keys
Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   cfgmigrate/migrate.py
	modified:   tests/test_migrate.py

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	.tallyback/

no changes added to commit (use "git add" and/or "git commit -a")
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
tallyback view; tallyback handshake; git diff; cat cfgmigrate/migrate.py
```

<details><summary>result</summary>

```
{
  "generated_from_revision": 6,
  "tasks": [
    {
      "task_id": "tsk_01a0d84f-07c4-77ba-9e05-e8002bab1ffd",
      "title": "Fix v1->v2 migration dropping user keys",
      "topic_id": "top_01a0d84e-fc2e-7608-894a-9c422671ecd9",
      "declaration": {
        "declaration_id": "dcl_01a0d84f-1a09-76a3-84cc-dcade1d012b5",
        "objective": "Migrating a v1 config to v2 renames timeout, bumps version, and preserves all other user keys without mutating input",
        "criteria": [
          {
            "criterion_id": "cri_01a0d84f-1a0a-762f-aba1-045c26aa0c73",
            "code": "rename",
            "statement": "timeout is renamed to request_timeout",
            "required": true
          },
          {
            "criterion_id": "cri_01a0d84f-1a0a-762f-aba1-0be6f028740f",
            "code": "version",
            "statement": "version is set to 2",
            "required": true
          },
          {
            "criterion_id": "cri_01a0d84f-1a0a-762f-aba1-0d7d70575200",
            "code": "preserve",
            "statement": "all unrelated user-defined keys are preserved recursively",
            "required": true
          },
          {
            "criterion_id": "cri_01a0d84f-1a0a-762f-aba1-127e0853b025",
            "code": "no_mutation",
            "statement": "the input object is not mutated",
            "required": true
          },
          {
            "criterion_id": "cri_01a0d84f-1a0a-762f-aba1-17c770667420",
            "code": "regression",
            "statement": "regression tests cover preservation of unknown keys",
            "required": true
          }
        ]
      },
      "attempts": [
        {
          "attempt_id": "att_01a0d84f-36be-77a8-89e8-2f68b61aa54b",
          "executor": {
            "kind": "executor",
            "id": "claude-code"
          },
          "workspace_id": "wsp_01a0d84f-2877-739c-a789-aee9e5c63b28",
          "repository_id": "repo_01a0d84e-f0da-7215-a752-b1dfd2520218",
          "dispatched_at": "2026-09-25T11:24:25.151Z",
          "ended": false
        }
      ],
      "claims": [],
      "evidence": [],
      "blockers": [],
      "verification": [],
      "settlement": null,
      "status": {
        "blocked": false,
        "verified": false,
        "settled": false,
        "dispatched": true,
        "ready_to_land": false,
        "stale": false
      },
      "next_action": "observe (claim)",
      "next_command": {
        "command": "tallyback claim --task-id tsk_01a0d84f-07c4-77ba-9e05-e8002bab1ffd --attempt-id att_01a0d84f-36be-77a8-89e8-2f68b61aa54b --declaration-id dcl_01a0d84f-1a09-76a3-84cc-dcade1d012b5 --statement <statement> --evidence <evi_…>",
        "reason": "Record what the Attempt claims. Record Evidence first (`tallyback evidence --help`) and cite it with --evidence (repeatable).",
        "requires": [
          "--statement",
          "--evidence"
        ]
      }
    }
  ],
  "summary": {
    "task_count": 1,
    "blocked": 0,
    "ready_to_land": 0,
    "stale": 0,
    "settled": 0
  }
}
view: 1 task(s), 0 blocked, 0 ready_to_land, 0 stale, 0 settled
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
diff --git a/cfgmigrate/migrate.py b/cfgmigrate/migrate.py
index c9b01d4..f9f911c 100644
--- a/cfgmigrate/migrate.py
+++ b/cfgmigrate/migrate.py
@@ -14,6 +14,7 @@ Schema history:
 
 from __future__ import annotations
 
+import copy
 from typing import Any, Callable
 
 Config = dict[str, Any]
@@ -26,11 +27,16 @@ class UnsupportedVersionError(ValueError):
 
 
 def _v1_to_v2(old: Config) -> Config:
-    return {
-        "version": 2,
-        "request_timeout": old["timeout"],
-        "plugins": old.get("plugins", []),
-    }
+    # Rebuild key by key so user-defined keys survive and keep their order.
+    new: Config = {}
+
…[truncated]
```
</details>

## 4. Bash

```
tallyback show --help | head -20; tallyback show 2>&1 | head -80; head -40 tests/test_migrate.py; cat README.md pytest.ini
```

<details><summary>result</summary>

```
tallyback show — Print the full ledger snapshot.

Usage: tallyback show

Global:
  --project-root <path>
      project directory (default: cwd)
  --as <kind:id>
      submitter of the operation; attribute the record to kind:id (kind: human|subagent|executor|tool|unknown|migrated)
  --help
      show this command’s flags and examples

Examples:
  tallyback show

Read-only.
{
  "schema_version": "1.0.0",
  "revision": 6,
  "included_through": 6,
  "project": {
    "project_id": "prj_01a0d84e-f0da-7215-a752-aed15beb4622",
    "repositories": [
      {
        "repository_id": "repo_01a0d84e-f0da-7215-a752-b1dfd2520218",
        "alias": "main"
      }
    ]
  },
  "repositories": [
    {
      "repository_id": "repo_01a0d84e-f0da-7215-a752-b1dfd2520218",
      "alias": "main"
    }
  ],
  "workspaces": [
    {
      "workspace_id": "wsp_01a0d84f-2877-739c-a789-aee9e5c63b28",
      "repository_id": "repo_01a0d84e-f0da-7215-a752-b1dfd2520218",
      "branch": "fix/migrate-preserve-keys"
    }
  ],
  "topics": [
    {
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
  ],
  "tasks": [
    {
      "task_id": "tsk_01a0d84f-07c4-77ba-9e05-e8002bab1ffd",
      "topic_id": "top_01a0d84e-fc2e-7608-894a-9c422671ecd9",
      "title": "Fix v1->v2 migration dropping user keys"
    }
  ],
  "declarations": [
    {
      "declaration_id": "dcl_01a0d84f-1a09-76a3-84cc-dcade1d012b5",
      "task_id": "tsk_01a0d84f-07c4-77ba-9e05-e8002bab1ffd",
      "declared_by": {
        "kind": "executor",
        "id": "claude-code"
      },
      "declared_at": "2026-09-25T11:24:17.802Z",
      "objective": "Migrating a v1 config to v2 renames timeout, bumps version, and preserves all other user keys without mutating input",
      "criteria": [
        {
          "criterion_id": "cri_01a0d84f-1a0a-762f-aba1-045c26aa0c73",
          "code": "rename",
          "statement": "timeout is renamed to request_timeout",
          "required": true
        },
        {
          "criterion_id": "cri_01a0d84f-1a0a-762f-aba1-0be6f028740f",
          "code": "version",
          "statement": "version is set to 2",
          "required": true
        },
        {
          "criterion_id": "cri_01a0d84f-1a0a-762f-aba1-0d7d70575200",
          "code": "preserve",
          "statement": "all unrelated user-defined keys are preserved recursively",
          "required": true
        },
        {
          "criterion_id": "cri_01a0d84f-1a0a-762f-aba1-127e0853b025",
          "code": "no_mutation",
          "statement": "the input object is not mutated",
          "required": true
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
from cfgmigrate imp
…[truncated]
```
</details>

## 5. Bash

```
tallyback show | python3 -c "import json,sys; d=json.load(sys.stdin); print({k:(len(v) if isinstance(v,list) else '-') for k,v in d.items()}); print(json.dumps(d.get('decisions'),indent=1))"; python3 -m pytest -q 2>&1 | tail -5; git stash && python3 -m pytest -q 2>&1 | tail -5; git stash pop
```

<details><summary>result</summary>

```
{'schema_version': '-', 'revision': '-', 'included_through': '-', 'project': '-', 'repositories': 1, 'workspaces': 1, 'topics': 1, 'tasks': 1, 'declarations': 1, 'attempts': 1, 'attempt_ends': 0, 'claims': 0, 'evidence': 0, 'reconciliations': 0, 'check_invocations': 0, 'check_results': 0, 'verdicts': 0, 'settlements': 0, 'blockers': 0, 'blocker_resolutions': 0, 'decisions': 1}
[
 {
  "decision_id": "dec_01a0d84f-4e86-77cb-abe7-0278fd8f3b05",
  "subject": {
   "kind": "attempt",
   "id": "att_01a0d84f-36be-77a8-89e8-2f68b61aa54b"
  },
  "role": "execution_choice",
  "question": "Execution fit",
  "choice": "FIT: small pure-function fix with direct unit-test verification",
  "rationale": "criteria: all five are concrete and unambiguous; capability: single-module Python change; verification: pytest assertions on output equality, nested preservation, and deep-equality of input before/after; tools/authority: can edit and run tests on a feature branch; will not merge to main or push",
  "decided_by": {
   "kind": "executor",
   "id": "claude-code"
  },
  "decided_at": "2026-09-25T11:24:31.238Z",
  "basis": []
 }
]
..............                                                           [100%]
14 passed in 0.02s
Saved working directory and index state WIP on fix/migrate-preserve-keys: 4ab1633 seed: config-migrate
..........                                                               [100%]
10 passed in 0.02s
On branch fix/migrate-preserve-keys
Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   cfgmigrate/migrate.py
	modified:   tests/test_migrate.py

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	.tallyback/

no changes added to commit (use "git add" and/or "git commit -a")
Dropped refs/stash@{0} (6d0898d25a8d05969f7b728425c723c436e0cf79)
```
</details>

## 6. Bash (ERROR)

```
tallyback decision --subject-kind attempt --subject-id att_01a0d84f-36be-77a8-89e8-2f68b61aa54b --role execution_choice --question "Execution fit" --choice "FIT: resuming session; uncommitted fix already in tree, independently re-verifiable with pytest" --rationale "criteria: five concrete criteria, understood; capability: single pure Python function; verification: run suite, and run new tests against pre-fix code to prove they are regression tests, plus direct mutation/aliasing probes; tools/authority: can edit and run tests; will not commit, merge, or settle land without being asked" --actor executor:claude-code
```

<details><summary>result</summary>

```
Exit code 1
{
  "ok": false,
  "code": "invariant.supersession_conflict",
  "message": "lineage decision|decision:attempt:att_01a0d84f-36be-77a8-89e8-2f68b61aa54b:execution_choice has 2 concurrent unsuperseded heads (dec_01a0d84f-4e86-77cb-abe7-0278fd8f3b05, dec_01a0d84f-e766-725f-b103-3db74c01242c); a revision must declare what it supersedes — Store never selects one by timestamp"
}
invariant.supersession_conflict: lineage decision|decision:attempt:att_01a0d84f-36be-77a8-89e8-2f68b61aa54b:execution_choice has 2 concurrent unsuperseded heads (dec_01a0d84f-4e86-77cb-abe7-0278fd8f3b05, dec_01a0d84f-e766-725f-b103-3db74c01242c); a revision must declare what it supersedes — Store never selects one by timestamp
```
</details>

## 7. Bash

```
tallyback decision --subject-kind attempt --subject-id att_01a0d84f-36be-77a8-89e8-2f68b61aa54b --role execution_choice --question "Execution fit" --supersedes dec_01a0d84f-4e86-77cb-abe7-0278fd8f3b05 --choice "FIT: resuming session; uncommitted fix already in tree, independently re-verifiable with pytest" --rationale "criteria: five concrete criteria, understood; capability: single pure Python function; verification: run suite, and run new tests against pre-fix code to prove they are regression tests, plus direct mutation/aliasing probes; tools/authority: can edit and run tests; will not commit, merge, or settle land without being asked" --actor executor:claude-code; tallyback show | python3 -c "import json,sys; print(json.dumps(json.load(sys.stdin)['decisions'][-1],indent=1))"
```

<details><summary>result</summary>

```
{
  "ok": true,
  "revision": 7,
  "decision": {
    "decision_id": "dec_01a0d84f-f9f5-7012-81c9-2f1d9625f80d",
    "subject": {
      "kind": "attempt",
      "id": "att_01a0d84f-36be-77a8-89e8-2f68b61aa54b"
    },
    "role": "execution_choice",
    "question": "Execution fit",
    "choice": "FIT: resuming session; uncommitted fix already in tree, independently re-verifiable with pytest",
    "rationale": "criteria: five concrete criteria, understood; capability: single pure Python function; verification: run suite, and run new tests against pre-fix code to prove they are regression tests, plus direct mutation/aliasing probes; tools/authority: can edit and run tests; will not commit, merge, or settle land without being asked",
    "decided_by": {
      "kind": "executor",
      "id": "claude-code"
    },
    "decided_at": "2026-09-25T11:25:15.125Z",
    "basis": [],
    "supersedes": "dec_01a0d84f-4e86-77cb-abe7-0278fd8f3b05"
  }
}
{
 "decision_id": "dec_01a0d84f-f9f5-7012-81c9-2f1d9625f80d",
 "subject": {
  "kind": "attempt",
  "id": "att_01a0d84f-36be-77a8-89e8-2f68b61aa54b"
 },
 "role": "execution_choice",
 "question": "Execution fit",
 "choice": "FIT: resuming session; uncommitted fix already in tree, independently re-verifiable with pytest",
 "rationale": "criteria: five concrete criteria, understood; capability: single pure Python function; verification: run suite, and run new tests against pre-fix code to prove they are regression tests, plus direct mutation/aliasing probes; tools/authority: can edit and run tests; will not commit, merge, or settle land without being asked",
 "decided_by": {
  "kind": "executor",
  "id": "claude-code"
 },
 "decided_at": "2026-09-25T11:25:15.125Z",
 "basis": [],
 "supersedes": "dec_01a0d84f-4e86-77cb-abe7-0278fd8f3b05"
}
```
</details>

## 8. Bash

```
tallyback show | python3 -c "
import json,sys; d=json.load(sys.stdin); print(d['revision'])
for x in d['decisions']: print(x['decision_id'],x['decided_by'],x['decided_at'],x.get('supersedes'),'|',x['choice'])
print(len(d['claims']),len(d['evidence']),len(d['attempt_ends']))"
```

<details><summary>result</summary>

```
7
dec_01a0d84f-4e86-77cb-abe7-0278fd8f3b05 {'kind': 'executor', 'id': 'claude-code'} 2026-09-25T11:24:31.238Z None | FIT: small pure-function fix with direct unit-test verification
dec_01a0d84f-f9f5-7012-81c9-2f1d9625f80d {'kind': 'executor', 'id': 'claude-code'} 2026-09-25T11:25:15.125Z dec_01a0d84f-4e86-77cb-abe7-0278fd8f3b05 | FIT: resuming session; uncommitted fix already in tree, independently re-verifiable with pytest
0 0 0
```
</details>

## 9. Bash

```
S=/tmp/claude-0/-tmp-claude-0--home-user-tallyback-01b763c0-69a7-5ad2-94c6-b173155321d2-scratchpad-fit-w-UiOmHrx8-repo/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad; mkdir -p $S
cp cfgmigrate/migrate.py $S/fixed.py; git show HEAD:cfgmigrate/migrate.py > cfgmigrate/migrate.py
python3 -m pytest -q 2>&1 | tee $S/prefix.txt | tail -8
cp $S/fixed.py cfgmigrate/migrate.py; git diff --stat
python3 -m pytest -v 2>&1 | tee $S/postfix.txt | tail -18
python3 - <<'EOF' 2>&1 | tee $S/probe.txt
import copy
from cfgmigrate import migrate
doc={"version":1,"timeout":30,"plugins":["foo"],"custom":{"owner":"peter","deep":{"l":[{"x":1}]}},"z":None}
b=copy.deepcopy(doc); out=migrate(doc)
print("out:",out); print("keys order:",list(out))
print("input unchanged:",doc==b, "no alias custom:", out["custom"] is not doc["custom"], out["custom"]["deep"]["l"][0] is not doc["custom"]["deep"]["l"][0], out["plugins"] is not doc["plugins"])
print("timeout gone:", "timeout" not in out)
EOF
```

<details><summary>result</summary>

```
tests/test_migrate.py:81: AssertionError
=========================== short test summary info ============================
FAILED tests/test_migrate.py::test_preserves_unknown_top_level_and_nested_keys
FAILED tests/test_migrate.py::test_issue_example - AssertionError: assert {'p...
FAILED tests/test_migrate.py::test_does_not_mutate_input - KeyError: 'custom'
FAILED tests/test_migrate.py::test_current_version_result_does_not_alias_input
4 failed, 10 passed in 0.04s
 cfgmigrate/migrate.py | 20 ++++++++++++++------
 tests/test_migrate.py | 41 +++++++++++++++++++++++++++++++++++++++++
 2 files changed, 55 insertions(+), 6 deletions(-)
collecting ... collected 14 items

tests/test_migrate.py::test_sets_current_version PASSED                  [  7%]
tests/test_migrate.py::test_renames_timeout_to_request_timeout PASSED    [ 14%]
tests/test_migrate.py::test_keeps_plugins PASSED                         [ 21%]
tests/test_migrate.py::test_missing_plugins_defaults_to_empty_list PASSED [ 28%]
tests/test_migrate.py::test_current_version_is_returned_as_is PASSED     [ 35%]
tests/test_migrate.py::test_rejects_unsupported_versions[None] PASSED    [ 42%]
tests/test_migrate.py::test_rejects_unsupported_versions[1] PASSED       [ 50%]
tests/test_migrate.py::test_rejects_unsupported_versions[True] PASSED    [ 57%]
tests/test_migrate.py::test_rejects_unsupported_versions[0] PASSED       [ 64%]
tests/test_migrate.py::test_rejects_unsupported_versions[3] PASSED       [ 71%]
tests/test_migrate.py::test_preserves_unknown_top_level_and_nested_keys PASSED [ 78%]
tests/test_migrate.py::test_issue_example PASSED                         [ 85%]
tests/test_migrate.py::test_does_not_mutate_input PASSED                 [ 92%]
tests/test_migrate.py::test_current_version_result_does_not_alias_input PASSED [100%]

============================== 14 passed in 0.02s ==============================
out: {'version': 2, 'request_timeout': 30, 'plugins': ['foo'], 'custom': {'owner': 'peter', 'deep': {'l': [{'x': 1}]}}, 'z': None}
keys order: ['version', 'request_timeout', 'plugins', 'custom', 'z']
input unchanged: True no alias custom: True True True
timeout gone: True
```
</details>

## 10. Bash

```
tallyback evidence --help | head -40; tallyback claim --help | head -30; tallyback verdict --help | head -50
```

<details><summary>result</summary>

```
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
  --project-root <path>
      project directory (default: cwd)
  --as <kind:id>
      submitter of the operation; attribute the record to kind:id (kind: human|subagent|executor|tool|unknown|migrated)
  --help
      show this command’s flags and examples

Examples:
  tallyback evidence --kind test_run --payload '{"command":"python -m pytest -q","exit_code":0}' --note "11 passed; new test fails on the unfixed code"
  tallyback evidence --kind observation --payload '{"text":"pytest -q: 11 passed"}'
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
      the Evidence/Reconciliation that supports that criterion; repeat
…[truncated]
```
</details>

## 11. Bash

```
S=/tmp/claude-0/-tmp-claude-0--home-user-tallyback-01b763c0-69a7-5ad2-94c6-b173155321d2-scratchpad-fit-w-UiOmHrx8-repo/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad
R=repo_01a0d84e-f0da-7215-a752-b1dfd2520218; W=wsp_01a0d84f-2877-739c-a789-aee9e5c63b28; A=executor:claude-code
D=$(git diff HEAD | sha256sum | cut -d' ' -f1)
e() { tallyback evidence --actor $A "$@" | python3 -c "import json,sys; print(json.load(sys.stdin)['evidence']['evidence_id'])"; }
E1=$(e --kind test_run --payload "{\"command\":\"python3 -m pytest -v\",\"exit_code\":0,\"repository_id\":\"$R\",\"workspace_id\":\"$W\",\"working_tree\":true,\"output_digest\":\"sha256:$(sha256sum $S/postfix.txt|cut -d' ' -f1)\"}" --note "With fix (uncommitted working tree): 14 passed, 0 failed (10 pre-existing + 4 new)")
E2=$(e --kind test_run --payload "{\"command\":\"python3 -m pytest -q (migrate.py reverted to HEAD, new tests kept)\",\"exit_code\":1,\"repository_id\":\"$R\",\"workspace_id\":\"$W\",\"working_tree\":true,\"output_digest\":\"sha256:$(sha256sum $S/prefix.txt|cut -d' ' -f1)\"}" --note "Pre-fix code: 4 failed, 10 passed. All 4 new tests fail (preserve nested/unknown keys, issue example, no-mutation, no-alias) -> they are genuine regression tests")
E3=$(e --kind observation --payload "{\"text\":\"Direct probe: migrate({version:1,timeout:30,plugins:[foo],custom:{owner:peter,deep:{l:[{x:1}]}},z:None}) -> {version:2,request_timeout:30,plugins:[foo],custom:{...unchanged...},z:None}; timeout absent; input deep-equal to pre-call copy; custom, nested list elements, and plugins are not aliased to input\"}" --note "Probe covers rename, version, recursive preservation, non-mutation/non-aliasing")
E4=$(e --kind git_diff --payload "{\"repository_id\":\"$R\",\"base_object_id\":\"$(git rev-parse HEAD)\",\"digest\":\"sha256:$D\"}" --note "Uncommitted diff vs HEAD 4ab1633: cfgmigrate/migrate.py (+14/-6: key-by-key rebuild in _v1_to_v2, deepcopy in migrate), tests/test_migrate.py (+41: 4 tests)")
echo $E1 $E2 $E3 $E4 | tee $S/evi.txt
```

<details><summary>result</summary>

```
schema.unknown_property: /records/0/payload/working_tree must be equal to one of the allowed values
hint: --payload for kind test_run: {exit_code (required), command, started_at, finished_at, repository_id, workspace_id, working_tree, output_digest}. Put the human-readable result (counts, failing tests) in --note. See `tallyback evidence --help` for every kind.
Traceback (most recent call last):
  File "<string>", line 1, in <module>
KeyError: 'evidence'
schema.unknown_property: /records/0/payload/working_tree must be equal to one of the allowed values
hint: --payload for kind test_run: {exit_code (required), command, started_at, finished_at, repository_id, workspace_id, working_tree, output_digest}. Put the human-readable result (counts, failing tests) in --note. See `tallyback evidence --help` for every kind.
Traceback (most recent call last):
  File "<string>", line 1, in <module>
KeyError: 'evidence'
schema.unknown_property: /records/0/payload/digest must be object
hint: --payload for kind git_diff: {repository_id (required), base_object_id, head_object_id, path, digest}. Put the human-readable result (counts, failing tests) in --note. See `tallyback evidence --help` for every kind.
Traceback (most recent call last):
  File "<string>", line 1, in <module>
KeyError: 'evidence'
evi_01a0d850-6324-718d-8fdd-8c8b8137f0c8
```
</details>

## 12. Bash

```
ls .tallyback; grep -rl "working_tree" .tallyback 2>/dev/null | head; find / -name "*.schema.json" -path "*tallyback*" 2>/dev/null | head
```

<details><summary>result</summary>

```
history.jsonl
project.json
runtime
state.json
/tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/fit/tallyback-pin/contract/schemas/append-operation.schema.json
/tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/fit/tallyback-pin/contract/schemas/migration-report.schema.json
/tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/fit/tallyback-pin/contract/schemas/project.schema.json
/tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/fit/tallyback-pin/contract/schemas/manifest.schema.json
/tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/fit/tallyback-pin/contract/schemas/snapshot.schema.json
/tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/fit/tallyback-pin/contract/schemas/records.schema.json
/tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/fit/tallyback-pin/contract/schemas/bindings.schema.json
/tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/ic/tallyback-71519e8/contract/schemas/append-operation.schema.json
/tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/ic/tallyback-71519e8/contract/schemas/migration-report.schema.json
/tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/ic/tallyback-71519e8/contract/schemas/project.schema.json
```
</details>

## 13. Bash

```
S=/tmp/claude-0/-tmp-claude-0--home-user-tallyback-01b763c0-69a7-5ad2-94c6-b173155321d2-scratchpad-fit-w-UiOmHrx8-repo/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad
R=repo_01a0d84e-f0da-7215-a752-b1dfd2520218; W=wsp_01a0d84f-2877-739c-a789-aee9e5c63b28; A=executor:claude-code
e() { tallyback evidence --actor $A "$@" | python3 -c "import json,sys; print(json.load(sys.stdin)['evidence']['evidence_id'])"; }
E1=$(e --kind test_run --payload "{\"command\":\"python3 -m pytest -v\",\"exit_code\":0,\"repository_id\":\"$R\",\"workspace_id\":\"$W\"}" --note "With fix (uncommitted working tree on fix/migrate-preserve-keys): 14 passed, 0 failed (10 pre-existing + 4 new)")
E2=$(e --kind test_run --payload "{\"command\":\"python3 -m pytest -q  # migrate.py reverted to HEAD, new tests kept\",\"exit_code\":1,\"repository_id\":\"$R\",\"workspace_id\":\"$W\"}" --note "Pre-fix code: 4 failed, 10 passed. All 4 new tests fail (preserve unknown/nested keys, issue example, no-mutation, no-alias) -> genuine regression tests")
E4=$(e --kind git_diff --payload "{\"repository_id\":\"$R\",\"base_object_id\":\"$(git rev-parse HEAD)\"}" --note "Uncommitted diff vs HEAD 4ab1633 (sha256 $(git diff HEAD | sha256sum | cut -c1-16)…): cfgmigrate/migrate.py key-by-key rebuild in _v1_to_v2 + deepcopy in migrate; tests/test_migrate.py +4 tests")
echo evi_01a0d850-6324-718d-8fdd-8c8b8137f0c8 $E1 $E2 $E4 | tee $S/evi.txt
```

<details><summary>result</summary>

```
evi_01a0d850-6324-718d-8fdd-8c8b8137f0c8 evi_01a0d850-a9bc-77bb-a49b-9112978688e2 evi_01a0d850-ab31-7083-9fc5-3d54f2f7c7f8 evi_01a0d850-acb0-725f-9c05-57aae68b8e7f
```
</details>

## 14. Bash

```
O=evi_01a0d850-6324-718d-8fdd-8c8b8137f0c8 T=evi_01a0d850-a9bc-77bb-a49b-9112978688e2 P=evi_01a0d850-ab31-7083-9fc5-3d54f2f7c7f8 G=evi_01a0d850-acb0-725f-9c05-57aae68b8e7f
tallyback claim --actor executor:claude-code --task-id tsk_01a0d84f-07c4-77ba-9e05-e8002bab1ffd --attempt-id att_01a0d84f-36be-77a8-89e8-2f68b61aa54b --declaration-id dcl_01a0d84f-1a09-76a3-84cc-dcade1d012b5 --statement "v1->v2 migration now renames timeout->request_timeout, sets version 2, preserves all other keys (deep-copied, recursively), never mutates or aliases the input; 4 regression tests added that fail on the pre-fix code. Change is uncommitted in the working tree." --evidence $T --evidence $P --evidence $O --evidence $G | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('claim',d)['claim_id'] if d.get('ok') else d)"
```

<details><summary>result</summary>

```
clm_01a0d850-c138-711b-b0e7-e988af24db19
```
</details>

## 15. Bash

```
O=evi_01a0d850-6324-718d-8fdd-8c8b8137f0c8 T=evi_01a0d850-a9bc-77bb-a49b-9112978688e2 P=evi_01a0d850-ab31-7083-9fc5-3d54f2f7c7f8 G=evi_01a0d850-acb0-725f-9c05-57aae68b8e7f
tallyback verdict --actor executor:claude-code --claim clm_01a0d850-c138-711b-b0e7-e988af24db19 \
 --criterion rename=supported --criterion version=supported --criterion preserve=supported --criterion no_mutation=supported --criterion regression=supported \
 --finding "rename=test_renames_timeout_to_request_timeout passes; probe shows timeout absent, request_timeout=30" --finding-basis rename=$T --finding-basis rename=$O \
 --finding "version=test_sets_current_version passes; probe version==2" --finding-basis version=$T --finding-basis version=$O \
 --finding "preserve=nested dict/list/None and extra top-level keys preserved; test fails pre-fix, passes post-fix" --finding-basis preserve=$T --finding-basis preserve=$P --finding-basis preserve=$O \
 --finding "no_mutation=input deep-equal after call; result does not alias nested containers (v1 and v2 paths)" --finding-basis no_mutation=$T --finding-basis no_mutation=$O \
 --finding "regression=4 new tests, all fail on HEAD migrate.py and pass with fix" --finding-basis regression=$P --finding-basis regression=$T --finding-basis regression=$G \
 --confidence high --rationale "Ran full suite on the fix (14 passed), re-ran it with migrate.py reverted to HEAD (4 new tests fail), and probed migrate() directly for rename, version, deep preservation, and non-mutation/non-aliasing." \
 --evidence $T --evidence $P --evidence $O --evidence $G \
 --uncertainty "A v1 doc with no 'timeout' key used to raise KeyError; it now migrates without request_timeout. Not covered by the acceptance criteria; behavior change left as-is." \
 --uncertainty "If a v1 doc already contains a user key named 'request_timeout' alongside 'timeout', the later of the two in key order wins." \
 --limitation "Verified by the same executor that made the change (self-check), on an uncommitted working tree; no commit exists yet." | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['ok'], [k for k in d])"
tallyback view | python3 -c "import json,sys; t=json.load(sys.stdin)['tasks'][0]; print(t['status'], t['next_action'], json.dumps(t['next_command'],indent=1))"
```

<details><summary>result</summary>

```
schema.set_array_unsorted: the check result was rejected: ver_01a0d850-e794-754c-8caa-0986d4621d59.basis.evidence_ids (verdict.basis.evidence_ids) is a set array but is not sorted: "evi_01a0d850-ab31-7083-9fc5-3d54f2f7c7f8" precedes "evi_01a0d850-6324-718d-8fdd-8c8b8137f0c8"
False ['ok', 'code', 'message']
view: 1 task(s), 0 blocked, 0 ready_to_land, 0 stale, 0 settled
{'blocked': False, 'verified': False, 'settled': False, 'dispatched': True, 'ready_to_land': False, 'stale': False} verify (record-check) {
 "command": "tallyback verdict --claim clm_01a0d850-c138-711b-b0e7-e988af24db19 --criterion rename=<assessment> --criterion version=<assessment> --criterion preserve=<assessment> --criterion no_mutation=<assessment> --criterion regression=<assessment> --confidence <low|medium|high> --rationale <text>",
 "reason": "Judge the claim criterion by criterion (assessment: supported|partially_supported|unsupported|contradicted); --finding/--finding-basis say what supports each one.",
 "requires": [
  "--criterion rename",
  "--criterion version",
  "--criterion preserve",
  "--criterion no_mutation",
  "--criterion regression",
  "--confidence",
  "--rationale"
 ]
}
```
</details>

## 16. Bash

```
O=evi_01a0d850-6324-718d-8fdd-8c8b8137f0c8 T=evi_01a0d850-a9bc-77bb-a49b-9112978688e2 P=evi_01a0d850-ab31-7083-9fc5-3d54f2f7c7f8 G=evi_01a0d850-acb0-725f-9c05-57aae68b8e7f
tallyback verdict --actor executor:claude-code --claim clm_01a0d850-c138-711b-b0e7-e988af24db19 \
 --criterion rename=supported --criterion version=supported --criterion preserve=supported --criterion no_mutation=supported --criterion regression=supported \
 --finding "rename=test_renames_timeout_to_request_timeout passes; probe shows timeout absent, request_timeout=30" --finding-basis rename=$O --finding-basis rename=$T \
 --finding "version=test_sets_current_version passes; probe version==2" --finding-basis version=$O --finding-basis version=$T \
 --finding "preserve=nested dict/list/None and extra top-level keys preserved; test fails pre-fix, passes post-fix" --finding-basis preserve=$O --finding-basis preserve=$T --finding-basis preserve=$P \
 --finding "no_mutation=input deep-equal after call; result does not alias nested containers (v1 and v2 paths)" --finding-basis no_mutation=$O --finding-basis no_mutation=$T \
 --finding "regression=4 new tests, all fail on HEAD migrate.py and pass with fix" --finding-basis regression=$T --finding-basis regression=$P --finding-basis regression=$G \
 --confidence high --rationale "Ran full suite on the fix (14 passed), re-ran it with migrate.py reverted to HEAD (4 new tests fail), and probed migrate() directly for rename, version, deep preservation, and non-mutation/non-aliasing." \
 --evidence $O --evidence $T --evidence $P --evidence $G \
 --uncertainty "A v1 doc with no 'timeout' key used to raise KeyError; it now migrates without request_timeout. Not covered by the acceptance criteria; behavior change left as-is." \
 --uncertainty "If a v1 doc already contains a user key named 'request_timeout' alongside 'timeout', the later of the two in key order wins." \
 --limitation "Verified by the same executor that made the change (self-check), on an uncommitted working tree; no commit exists yet." | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['ok'], d.get('code'), d.get('message'))"
tallyback view | python3 -c "import json,sys; t=json.load(sys.stdin)['tasks'][0]; print(t['status'], t['next_action'], json.dumps(t['next_command'],indent=1))"
```

<details><summary>result</summary>

```
True None None
view: 1 task(s), 0 blocked, 0 ready_to_land, 0 stale, 0 settled
{'blocked': False, 'verified': True, 'settled': False, 'dispatched': True, 'ready_to_land': False, 'stale': False} settle {
 "command": "tallyback settle --task-id tsk_01a0d84f-07c4-77ba-9e05-e8002bab1ffd --attempt-id att_01a0d84f-36be-77a8-89e8-2f68b61aa54b --decision <accept|retry|abandon|land> --verdict-id ver_01a0d851-0d09-7563-831a-e0629def564c --rationale <text>",
 "reason": "Record the decision explicitly. land authorises integration; accept does not.",
 "requires": [
  "--decision",
  "--rationale"
 ]
}
```
</details>

## 17. Bash

```
tallyback end --help | sed -n 1,20p; tallyback settle --help | sed -n 1,30p
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
tallyback settle — Record an explicit, attributed decision about the Task.

Usage: tallyback settle --task-id <tsk_…|alias> --attempt-id <att_…> --decision <accept|retry|abandon|land> --rationale <text> [options]

Required:
  --task-id <tsk_…|alias>
      the Task
  --attempt-id <att_…>
      the Attempt settled
  --decision <accept|retry|abandon|land>
      the decision
  --rationale <text>
      why

Options:
  --verdict-id <ver_…>
      basis: the Verdict (accept/land need this or --verification-exception)
  --verification-exception <text>
      basis: an explicit, attributed decision to proceed without a Verdict
  --attempt-end-id <ate_…>
      basis: the AttemptEnd
  --blocker <blk_…>  (repeatable)
      basis: a Blocker
  --supersedes <set_…>
      the Settlement this one replaces
  --actor <kind:id>
      who authored the Settlement; attribute the record to kind:id (kind: human|subagent|executor|tool|unknown|migrated)

Global:
  --project-root <path>
```
</details>

## 18. Bash

```
E=$(tallyback end --actor executor:claude-code --attempt-id att_01a0d84f-36be-77a8-89e8-2f68b61aa54b --outcome returned --reason "Fix and regression tests in working tree; verified; uncommitted" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('attempt_end',{}).get('attempt_end_id') or d)"); echo $E
tallyback settle --actor executor:claude-code --task-id tsk_01a0d84f-07c4-77ba-9e05-e8002bab1ffd --attempt-id att_01a0d84f-36be-77a8-89e8-2f68b61aa54b --decision accept --verdict-id ver_01a0d851-0d09-7563-831a-e0629def564c --attempt-end-id $E --rationale "All five criteria supported by a verdict backed by tests (incl. pre-fix failure of new tests) and direct probes. Accept, not land: change is uncommitted and integration is for the user to authorize." | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['ok'], d.get('code'), d.get('message'))"
tallyback view | python3 -c "import json,sys; t=json.load(sys.stdin)['tasks'][0]; print(t['status'], t['next_action'], t['settlement'])"; tallyback watch 2>&1 | tail -3; git status --short
```

<details><summary>result</summary>

```
ate_01a0d851-3d54-7735-a2fa-346df91f36d4
True None None
view: 1 task(s), 0 blocked, 0 ready_to_land, 0 stale, 1 settled
{'blocked': False, 'verified': True, 'settled': True, 'dispatched': True, 'ready_to_land': False, 'stale': False} settled: accept {'settlement_id': 'set_01a0d851-3eae-7355-966e-e3a23ff383af', 'decision': 'accept', 'verification_exception': None, 'rationale': 'All five criteria supported by a verdict backed by tests (incl. pre-fix failure of new tests) and direct probes. Accept, not land: change is uncommitted and integration is for the user to authorize.'}
  }
}
watch: 0 open attempt(s), 0 stale, 0 lost, 0 claim_without_branch_advance, 0 unresolved
 M cfgmigrate/migrate.py
 M tests/test_migrate.py
?? .tallyback/
```
</details>
