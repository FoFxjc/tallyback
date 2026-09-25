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
cat ISSUE.md; git status; git log --oneline | head; ls -R | grep -v node_modules | head -50
```

<details><summary>result</summary>

```
# Job timeouts written in minutes are 60× too long

A job configured with `timeout: 30m` was still running after 20 hours. `parse_duration`
returns the wrong number of seconds for anything with a minutes part:

```python
parse_duration("30m")    # 108000, expected 1800
parse_duration("1h30m")  # 111600, expected 5400
```

## Acceptance criteria

1. Minutes are converted correctly: `"30m"` → 1800, `"1h30m"` → 5400, `"2h15m30s"` → 8130.
2. Hours-only and seconds-only durations keep working.
3. Invalid input is still rejected with `InvalidDuration` (the grammar in `durations/parse.py` is unchanged).
4. Add regression tests covering minutes.
On branch main
nothing to commit, working tree clean
08080f4 seed: boundary-fit
.:
ISSUE.md
README.md
durations
pytest.ini
tests

./durations:
__init__.py
parse.py

./tests:
test_parse.py
```
</details>

## 3. Bash

```
tallyback view; tallyback handshake; cat durations/*.py tests/test_parse.py pytest.ini
```

<details><summary>result</summary>

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
            raise InvalidDuration(f"units out of order or repeated: {text!r}")
        last = rank
        total += int(amount) * _UNIT_SECONDS[unit]
        pos = match.end()
    if pos != len(text):
        raise InvalidDuration(f"not a duration: {text!r}")
    return total
import pytest

from durations import InvalidDuration, parse_duration


def test_hours():
    assert parse_duration("2h") == 7200


def test_seconds():
    assert parse_duration("45s") == 45


def test_hours_and_seconds():
    assert parse_duration("1h5s") == 3605


@pytest.mark.parametrize("text", ["", "h", "1x", "1h 30m", "-5s", "1.5h", "30m1h", "1h1h"])
def test_rejects_invalid(text):
    with pytest.raises(InvalidDuration):
        parse_duration(text)
[pytest]
testpaths = tests
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
  "project_id": "prj_01a0d885-9de0-761c-a791-79700c799cb0",
  "revision": 0,
  "repositories": [
    {
      "repository_id": "repo_01a0d885-9de0-761c-a791-7f659b26e7ea",
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
export TALLYBACK_ACTOR=executor:claude-code; tallyback topic --name durations-minutes-bug; tallyback view | tail -20
```

<details><summary>result</summary>

```
{
  "ok": true,
  "revision": 1,
  "topic": {
    "topic_id": "top_01a0d885-a825-779d-9a79-155d8ae1fc88",
    "project_id": "prj_01a0d885-9de0-761c-a791-79700c799cb0",
    "name": "durations-minutes-bug",
    "goal": "",
    "created_by": {
      "kind": "executor",
      "id": "claude-code"
    },
    "created_at": "2026-09-25T12:23:53.125Z"
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
    "command": "tallyback task --topic-id top_01a0d885-a825-779d-9a79-155d8ae1fc88 --title <title>",
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
export TALLYBACK_ACTOR=executor:claude-code; tallyback task --topic-id top_01a0d885-a825-779d-9a79-155d8ae1fc88 --title "Fix minutes conversion in parse_duration" >/dev/null; tallyback view | python3 -c "import json,sys; d=json.load(sys.stdin); print(json.dumps([t.get('next_command') for t in d['tasks']],indent=1))" ; tallyback declare --help
```

<details><summary>result</summary>

```
view: 1 task(s), 0 blocked, 0 ready_to_land, 1 stale, 0 settled
[
 {
  "command": "tallyback declare --task-id tsk_01a0d885-b565-74c5-982d-4e7c1fc59425 --objective <objective> --criterion <code:statement>",
  "reason": "Declare what done means; repeat --criterion once per acceptance criterion.",
  "requires": [
   "--objective",
   "--criterion"
  ]
 }
]
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
export TALLYBACK_ACTOR=executor:claude-code; T=tsk_01a0d885-b565-74c5-982d-4e7c1fc59425; tallyback declare --task-id $T --objective "parse_duration converts minutes to 60 seconds each; job timeouts in minutes are correct" \
 --criterion 'minutes:"30m"->1800, "1h30m"->5400, "2h15m30s"->8130' \
 --criterion 'no_regress:Hours-only and seconds-only durations keep working' \
 --criterion 'grammar:Invalid input still raises InvalidDuration; grammar in durations/parse.py unchanged' \
 --criterion 'tests:Regression tests covering minutes are added' >/dev/null; tallyback view | python3 -c "import json,sys; d=json.load(sys.stdin); print(json.dumps([t.get('next_command') for t in d['tasks']],indent=1))"
```

<details><summary>result</summary>

```
view: 1 task(s), 0 blocked, 0 ready_to_land, 0 stale, 0 settled
[
 {
  "command": "tallyback workspace --repository-id repo_01a0d885-9de0-761c-a791-7f659b26e7ea --branch <branch>",
  "reason": "Dispatch needs a Workspace; register the checkout/branch the work happens on.",
  "requires": [
   "--branch"
  ]
 }
]
```
</details>

## 8. Bash

```
export TALLYBACK_ACTOR=executor:claude-code; git checkout -b fix/duration-minutes; tallyback workspace --repository-id repo_01a0d885-9de0-761c-a791-7f659b26e7ea --branch fix/duration-minutes >/dev/null; tallyback view | python3 -c "import json,sys; d=json.load(sys.stdin); print(json.dumps([t.get('next_command') for t in d['tasks']],indent=1))"
```

<details><summary>result</summary>

```
Switched to a new branch 'fix/duration-minutes'
view: 1 task(s), 0 blocked, 0 ready_to_land, 0 stale, 0 settled
[
 {
  "command": "tallyback dispatch --task-id tsk_01a0d885-b565-74c5-982d-4e7c1fc59425 --declaration-id dcl_01a0d885-c5f1-7146-9b6f-3690126cf1e7 --repository-id repo_01a0d885-9de0-761c-a791-7f659b26e7ea --workspace-id wsp_01a0d885-d8e8-734a-b4ba-6baa4aabb63b --executor <kind:id>",
  "reason": "Start an Attempt; --executor names who does the work.",
  "requires": [
   "--executor"
  ]
 }
]
```
</details>

## 9. Bash

```
export TALLYBACK_ACTOR=executor:claude-code; tallyback dispatch --task-id tsk_01a0d885-b565-74c5-982d-4e7c1fc59425 --declaration-id dcl_01a0d885-c5f1-7146-9b6f-3690126cf1e7 --repository-id repo_01a0d885-9de0-761c-a791-7f659b26e7ea --workspace-id wsp_01a0d885-d8e8-734a-b4ba-6baa4aabb63b --executor executor:claude-code | grep -o '"attempt_id": "[^"]*"' | head -1; git status --short; git diff
```

<details><summary>result</summary>

```
"attempt_id": "att_01a0d885-e68b-77c7-b73d-acf9c4d45999"
?? .tallyback/
```
</details>

## 10. Bash

```
export TALLYBACK_ACTOR=executor:claude-code; tallyback decision --subject-kind attempt --subject-id att_01a0d885-e68b-77c7-b73d-acf9c4d45999 --role execution_choice --question "Execution fit" --choice "FIT: one-constant bug in _UNIT_SECONDS, verifiable with pytest" --rationale "criteria: all four clear; capability: yes; hardest: making sure the grammar (regex/order/validation) stays byte-identical so criterion 3 holds, and adding tests that would fail on the old code; evidence: pytest run + git diff restricted to the _UNIT_SECONDS line + running new tests against the pre-fix code; not authorised: commit, merge, push, settle land; stop if: any existing test fails or the fix needs grammar changes" --actor executor:claude-code | head -3
```

<details><summary>result</summary>

```
{
  "ok": true,
  "revision": 6,
```
</details>

## 11. Edit

```
/tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/fit2/w/NGeqJNpr/repo/durations/parse.py
```

<details><summary>result</summary>

```
The file /tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/fit2/w/NGeqJNpr/repo/durations/parse.py has been updated successfully.
```
</details>

## 12. Edit

```
/tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/fit2/w/NGeqJNpr/repo/tests/test_parse.py
```

<details><summary>result</summary>

```
The file /tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/fit2/w/NGeqJNpr/repo/tests/test_parse.py has been updated successfully.
```
</details>

## 13. Bash

```
python -m pytest -q 2>&1 | tail -3; echo ---OLD---; git stash push durations/parse.py -q && python -m pytest -q 2>&1 | tail -8; git stash pop -q; echo ---DIFF---; git diff --stat; git diff durations/
```

<details><summary>result</summary>

```
....................                                                     [100%]
20 passed in 0.02s
---OLD---
tests/test_parse.py:23: AssertionError
=========================== short test summary info ============================
FAILED tests/test_parse.py::test_minutes[30m-1800] - AssertionError: assert 1...
FAILED tests/test_parse.py::test_minutes[1m-60] - AssertionError: assert 3600...
FAILED tests/test_parse.py::test_minutes[1h30m-5400] - AssertionError: assert...
FAILED tests/test_parse.py::test_minutes[2h15m30s-8130] - AssertionError: ass...
FAILED tests/test_parse.py::test_minutes[5m10s-310] - AssertionError: assert ...
5 failed, 15 passed in 0.04s
---DIFF---
 durations/parse.py  |  2 +-
 tests/test_parse.py | 14 ++++++++++++++
 2 files changed, 15 insertions(+), 1 deletion(-)
diff --git a/durations/parse.py b/durations/parse.py
index 72928ed..f19fff2 100644
--- a/durations/parse.py
+++ b/durations/parse.py
@@ -10,7 +10,7 @@ from __future__ import annotations
 import re
 
 _PART = re.compile(r"(\d+)([hms])")
-_UNIT_SECONDS = {"h": 3600, "m": 3600, "s": 1}
+_UNIT_SECONDS = {"h": 3600, "m": 60, "s": 1}
 _ORDER = "hms"
```
</details>

## 14. Bash

```
tallyback evidence --help | sed -n 1,40p; tallyback claim --help | sed -n 1,30p
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
```
</details>

## 15. Bash

```
export TALLYBACK_ACTOR=executor:claude-code; R=repo_01a0d885-9de0-761c-a791-7f659b26e7ea; W=wsp_01a0d885-d8e8-734a-b4ba-6baa4aabb63b; H=$(git rev-parse HEAD)
id(){ grep -o '"evidence_id": "[^"]*"' | head -1 | cut -d'"' -f4; }
E1=$(tallyback evidence --kind test_run --payload "{\"command\":\"python -m pytest -q\",\"exit_code\":0,\"repository_id\":\"$R\",\"workspace_id\":\"$W\",\"working_tree\":\"dirty\"}" --note "20 passed on fixed working tree (incl. 5 test_minutes cases: 30m=1800, 1m=60, 1h30m=5400, 2h15m30s=8130, 5m10s=310; hours/seconds/invalid-input tests all pass)" | id)
E2=$(tallyback evidence --kind test_run --payload "{\"command\":\"git stash push durations/parse.py && python -m pytest -q\",\"exit_code\":1,\"repository_id\":\"$R\",\"workspace_id\":\"$W\"}" --note "Against unfixed parse.py: 5 failed (all test_minutes cases), 15 passed — new regression tests catch the bug" | id)
E3=$(tallyback evidence --kind git_diff --payload "{\"repository_id\":\"$R\",\"base_object_id\":\"$H\",\"path\":\"durations/parse.py\"}" --note "Only change to parse.py: _UNIT_SECONDS 'm' 3600 -> 60. _PART regex, _ORDER and validation logic untouched (grammar unchanged)" | id)
echo $E1 $E2 $E3
```

<details><summary>result</summary>

```
evi_01a0d886-388d-75db-a7a6-0f58c5396f87 evi_01a0d886-3a0b-7239-b540-1da841181076 evi_01a0d886-3bae-7598-94e8-e5a1caf08a62
```
</details>

## 16. Bash

```
export TALLYBACK_ACTOR=executor:claude-code; tallyback claim --task-id tsk_01a0d885-b565-74c5-982d-4e7c1fc59425 --attempt-id att_01a0d885-e68b-77c7-b73d-acf9c4d45999 --declaration-id dcl_01a0d885-c5f1-7146-9b6f-3690126cf1e7 --statement "Fixed minutes multiplier in _UNIT_SECONDS (3600->60) and added regression tests for minutes; grammar untouched. Changes are uncommitted on branch fix/duration-minutes." --evidence evi_01a0d886-388d-75db-a7a6-0f58c5396f87 --evidence evi_01a0d886-3a0b-7239-b540-1da841181076 --evidence evi_01a0d886-3bae-7598-94e8-e5a1caf08a62 | head -2; tallyback view | python3 -c "import json,sys; d=json.load(sys.stdin); print(json.dumps([t.get('next_command') for t in d['tasks']],indent=1))"; tallyback verdict --help | sed -n 1,45p
```

<details><summary>result</summary>

```
{
  "ok": true,
view: 1 task(s), 0 blocked, 0 ready_to_land, 0 stale, 0 settled
[
 {
  "command": "tallyback verdict --claim clm_01a0d886-4dbc-777b-b567-611b9be9a28d --criterion minutes=<assessment> --criterion no_regress=<assessment> --criterion grammar=<assessment> --criterion tests=<assessment> --confidence <low|medium|high> --rationale <text>",
  "reason": "Judge the claim criterion by criterion (assessment: supported|partially_supported|unsupported|contradicted); --finding/--finding-basis say what supports each one.",
  "requires": [
   "--criterion minutes",
   "--criterion no_regress",
   "--criterion grammar",
   "--criterion tests",
   "--confidence",
   "--rationale"
  ]
 }
]
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

## 17. Bash

```
export TALLYBACK_ACTOR=executor:claude-code; E1=evi_01a0d886-388d-75db-a7a6-0f58c5396f87; E2=evi_01a0d886-3a0b-7239-b540-1da841181076; E3=evi_01a0d886-3bae-7598-94e8-e5a1caf08a62
tallyback verdict --claim clm_01a0d886-4dbc-777b-b567-611b9be9a28d \
 --criterion minutes=supported --finding "minutes=test_minutes asserts 30m=1800, 1h30m=5400, 2h15m30s=8130; all pass" --finding-basis minutes=$E1 \
 --criterion no_regress=supported --finding "no_regress=test_hours, test_seconds, test_hours_and_seconds pass" --finding-basis no_regress=$E1 \
 --criterion grammar=supported --finding "grammar=diff touches only _UNIT_SECONDS; all 8 original invalid inputs + 4 new minute-related invalid inputs raise InvalidDuration" --finding-basis grammar=$E3 --finding-basis grammar=$E1 \
 --criterion tests=supported --finding "tests=5 new minute cases fail on unfixed code, pass on fix" --finding-basis tests=$E2 --finding-basis tests=$E1 \
 --confidence high --rationale "Full suite passes on the fix; new tests fail on the old code; diff confined to the multiplier constant." \
 --limitation "Verified by the same executor that made the change (no independent checker)" \
 --limitation "Changes are uncommitted in the working tree; not committed/merged" \
 --evidence $E1 --evidence $E2 --evidence $E3 | head -2
tallyback view | python3 -c "import json,sys; d=json.load(sys.stdin); t=d['tasks'][0]; print(json.dumps({k:t.get(k) for k in ('status','next_command','next_action')},indent=1))"
```

<details><summary>result</summary>

```
{
  "ok": true,
view: 1 task(s), 0 blocked, 0 ready_to_land, 0 stale, 0 settled
{
 "status": {
  "blocked": false,
  "verified": true,
  "settled": false,
  "dispatched": true,
  "ready_to_land": false,
  "stale": false
 },
 "next_command": {
  "command": "tallyback settle --task-id tsk_01a0d885-b565-74c5-982d-4e7c1fc59425 --attempt-id att_01a0d885-e68b-77c7-b73d-acf9c4d45999 --decision <accept|retry|abandon|land> --verdict-id ver_01a0d886-6c07-76be-907f-7bff2bffd582 --rationale <text>",
  "reason": "Record the decision explicitly. land authorises integration; accept does not.",
  "requires": [
   "--decision",
   "--rationale"
  ]
 },
 "next_action": "settle"
}
```
</details>

## 18. Bash

```
export TALLYBACK_ACTOR=executor:claude-code; tallyback settle --task-id tsk_01a0d885-b565-74c5-982d-4e7c1fc59425 --attempt-id att_01a0d885-e68b-77c7-b73d-acf9c4d45999 --decision accept --verdict-id ver_01a0d886-6c07-76be-907f-7bff2bffd582 --rationale "All four criteria supported by test runs (incl. new tests failing on unfixed code) and a diff confined to the minutes multiplier. Accept, not land: changes are uncommitted and integration was not authorized." | head -2; tallyback view | python3 -c "import json,sys; d=json.load(sys.stdin); t=d['tasks'][0]; print(json.dumps({k:t.get(k) for k in ('status','next_action','settlement')},indent=1)); print(d['summary'])"; git status --short
```

<details><summary>result</summary>

```
{
  "ok": true,
view: 1 task(s), 0 blocked, 0 ready_to_land, 0 stale, 1 settled
{
 "status": {
  "blocked": false,
  "verified": true,
  "settled": true,
  "dispatched": true,
  "ready_to_land": false,
  "stale": false
 },
 "next_action": "settled: accept",
 "settlement": {
  "settlement_id": "set_01a0d886-84d9-703f-bd2a-5c884cae796a",
  "decision": "accept",
  "verification_exception": null,
  "rationale": "All four criteria supported by test runs (incl. new tests failing on unfixed code) and a diff confined to the minutes multiplier. Accept, not land: changes are uncommitted and integration was not authorized."
 }
}
{'task_count': 1, 'blocked': 0, 'ready_to_land': 0, 'stale': 0, 'settled': 1}
 M durations/parse.py
 M tests/test_parse.py
?? .tallyback/
```
</details>
