# Failed or rejected Tallyback invocations

## call 5
```
tallyback declare --title "Fix parse_duration for minutes" --body "Minutes unit mapping is 3600 instead of 60, causing 60× timeout errors. Fix mapping and add regression tests."
```
```
Exit code 1
{
  "ok": false,
  "code": "cli.unknown_flag",
  "message": "`declare` does not accept --title; nothing was recorded. Accepted flags: --task-id --objective --criterion --no-criteria --supersedes --actor. See `tallyback declare --help`."
}
cli.unknown_flag: `declare` does not accept --title; nothing was recorded. Accepted flags: --task-id --objective --criterion --no-criteria --supersedes --actor. See `tallyback declare --help`.
```

## call 7
```
tallyback view
```
```
Exit code 1
{
  "ok": false,
  "code": "mutation.ledger_not_initialized",
  "message": "No Tallyback ledger exists at /tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/fit2/w/JcsKACIr/repo/.tallyback.",
  "next_action": {
    "command": "tallyback init",
    "reason": "Initialize Tallyback before viewing or recording tracked work."
  }
}
mutation.ledger_not_initialized: No Tallyback ledger exists at /tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/fit2/w/JcsKACIr/repo/.tallyback.
```

## call 12
```
tallyback task --topic-id top_01a0d885-f156-74be-9bd7-93638b0e1f19 --name "Fix parse_duration minutes mapping"
```
```
Exit code 1
{
  "ok": false,
  "code": "cli.unknown_flag",
  "message": "`task` does not accept --name; nothing was recorded. Accepted flags: --topic-id --title --alias. See `tallyback task --help`."
}
cli.unknown_flag: `task` does not accept --name; nothing was recorded. Accepted flags: --topic-id --title --alias. See `tallyback task --help`.
```

## call 18
```
tallyback dispatch --task-id tsk_01a0d886-0168-74fb-87ed-28aef536b04a --workspace-id wsp_01a0d886-2911-725f-9d96-3bb7b7c1d996 --actor executor:claude-code
```
```
Exit code 1
{
  "ok": false,
  "code": "cli.unknown_flag",
  "message": "`dispatch` does not accept --actor; nothing was recorded. Accepted flags: --task-id --declaration-id --repository-id --workspace-id --executor --dispatcher --session-id. See `tallyback dispatch --help`."
}
cli.unknown_flag: `dispatch` does not accept --actor; nothing was recorded. Accepted flags: --task-id --declaration-id --repository-id --workspace-id --executor --dispatcher --session-id. See `tallyback dispatch --help`.
```

## call 19
```
tallyback dispatch --task-id tsk_01a0d886-0168-74fb-87ed-28aef536b04a --workspace-id wsp_01a0d886-2911-725f-9d96-3bb7b7c1d996 --executor claude-code
```
```
Exit code 1
{
  "ok": false,
  "code": "cli.missing_flag",
  "message": "missing required --declaration-id. See `tallyback dispatch --help`."
}
cli.missing_flag: missing required --declaration-id. See `tallyback dispatch --help`.
```

## call 20
```
tallyback dispatch --task-id tsk_01a0d886-0168-74fb-87ed-28aef536b04a --declaration-id dcl_01a0d886-10a6-747e-8a90-517ca35d965e --workspace-id wsp_01a0d886-2911-725f-9d96-3bb7b7c1d996 --executor claude-code
```
```
Exit code 1
{
  "ok": false,
  "code": "cli.missing_flag",
  "message": "missing required --repository-id. See `tallyback dispatch --help`."
}
cli.missing_flag: missing required --repository-id. See `tallyback dispatch --help`.
```

## call 21
```
tallyback dispatch --task-id tsk_01a0d886-0168-74fb-87ed-28aef536b04a --declaration-id dcl_01a0d886-10a6-747e-8a90-517ca35d965e --repository-id repo_01a0d885-d971-729c-b32d-e05c35d79a48 --workspace-id wsp_01a0d886-2911-725f-9d96-3bb7b7c1d996 --executor claude-code
```
```
Exit code 1
{
  "ok": false,
  "code": "cli.invalid_value",
  "message": "--executor must be \"kind:id\" with kind one of human|subagent|executor|tool|unknown|migrated (got \"claude-code\"). See `tallyback dispatch --help`."
}
cli.invalid_value: --executor must be "kind:id" with kind one of human|subagent|executor|tool|unknown|migrated (got "claude-code"). See `tallyback dispatch --help`.
```

## call 28
```
tallyback evidence --attempt-id att_01a0d886-5c80-7717-89df-0844bec55e6f --note "All 14 tests pass including 3 new regression tests: test_minutes (30m=1800), test_hours_and_minutes (1h30m=5400), test_hours_minutes_and_seconds (2h15m30s=8130)"
```
```
Exit code 1
{
  "ok": false,
  "code": "cli.unknown_flag",
  "message": "`evidence` does not accept --attempt-id; nothing was recorded. Evidence is recorded first and then linked from the Claim: `tallyback claim … --evidence <evi_…>` (or from a Verdict: `tallyback verdict … --evidence <evi_…>`). Accepted flags: --kind --payload --note --actor. See `tallyback evidence --help`."
}
cli.unknown_flag: `evidence` does not accept --attempt-id; nothing was recorded. Evidence is recorded first and then linked from the Claim: `tallyback claim … --evidence <evi_…>` (or from a Verdict: `tallyback verdict … --evidence <evi_…>`). Accepted flags: --kind --payload --note --actor. See `tallyback evidence --help`.
```

## call 29
```
tallyback evidence --kind test_execution --note "All 14 tests pass including 3 new regression tests: test_minutes (30m=1800), test_hours_and_minutes (1h30m=5400), test_hours_minutes_and_seconds (2h15m30s=8130)"
```
```
Exit code 1
{
  "ok": false,
  "code": "cli.missing_flag",
  "message": "missing required --payload. See `tallyback evidence --help`."
}
cli.missing_flag: missing required --payload. See `tallyback evidence --help`.
```

## call 32
```
tallyback verdict --task-id tsk_01a0d886-0168-74fb-87ed-28aef536b04a --attempt-id att_01a0d886-5c80-7717-89df-0844bec55e6f --criterion "minutes_correct=supported" --criterion "hours_and_seconds_work=supported" --criterion "invalid_rejected=supported" --criterion "regression_tests=supported" --evidence evi_01a0d886-ce14-77ad-8a3e-46abf467dec7 --finding "minutes_correct=30m correctly converts to 1800s, 1h30m to 5400s, 2h15m30s to 8130s (all regression test cases pass)" --finding "hours_and_seconds_work=Existing tests for hours (2h=7200s) and seconds (45s=45s) continue to pass" --finding "invalid_rejected=Invalid input tests continue to pass (empty string, 'h', '1x', '1h 30m', '-5s', '1.5h', '30m1h', '1h1h')" --finding "regression_tests=3 new tests added covering all required minute cases"
```
```
Exit code 1
{
  "ok": false,
  "code": "cli.unknown_flag",
  "message": "`verdict` does not accept --task-id; nothing was recorded. Accepted flags: --claim --criterion --confidence --rationale --finding --finding-basis --attempt --allow-partial --evidence --reconciliation --finality --confidence-rationale --conclusion --uncertainty --limitation --checker-id --checker-version --actor. See `tallyback verdict --help`."
}
cli.unknown_flag: `verdict` does not accept --task-id; nothing was recorded. Accepted flags: --claim --criterion --confidence --rationale --finding --finding-basis --attempt --allow-partial --evidence --reconciliation --finality --confidence-rationale --conclusion --uncertainty --limitation --checker-id --checker-version --actor. See `tallyback verdict --help`.
```

## call 34
```
tallyback claim --attempt-id att_01a0d886-5c80-7717-89df-0844bec55e6f --criterion minutes_correct --criterion hours_and_seconds_work --criterion invalid_rejected --criterion regression_tests --evidence evi_01a0d886-ce14-77ad-8a3e-46abf467dec7
```
```
Exit code 1
{
  "ok": false,
  "code": "cli.unknown_flag",
  "message": "`claim` does not accept --criterion; nothing was recorded. Accepted flags: --task-id --attempt-id --declaration-id --statement --evidence --actor. See `tallyback claim --help`."
}
cli.unknown_flag: `claim` does not accept --criterion; nothing was recorded. Accepted flags: --task-id --attempt-id --declaration-id --statement --evidence --actor. See `tallyback claim --help`.
```

## call 38
```
tallyback settle --task-id tsk_01a0d886-0168-74fb-87ed-28aef536b04a --decision land --basis "ver_01a0d887-1dd1-76ab-9873-7cc7d1365717"
```
```
Exit code 1
{
  "ok": false,
  "code": "cli.unknown_flag",
  "message": "`settle` does not accept --basis; nothing was recorded. Accepted flags: --task-id --attempt-id --decision --rationale --verdict-id --verification-exception --attempt-end-id --blocker --supersedes --actor. See `tallyback settle --help`."
}
cli.unknown_flag: `settle` does not accept --basis; nothing was recorded. Accepted flags: --task-id --attempt-id --decision --rationale --verdict-id --verification-exception --attempt-end-id --blocker --supersedes --actor. See `tallyback settle --help`.
```

## call 39
```
tallyback settle --task-id tsk_01a0d886-0168-74fb-87ed-28aef536b04a --decision land --verdict-id ver_01a0d887-1dd1-76ab-9873-7cc7d1365717 --rationale "All acceptance criteria verified by test execution. Code changes: 1-line fix to parse.py (minutes unit 3600→60), 3 regression tests added."
```
```
Exit code 1
{
  "ok": false,
  "code": "cli.missing_flag",
  "message": "missing required --attempt-id. See `tallyback settle --help`."
}
cli.missing_flag: missing required --attempt-id. See `tallyback settle --help`.
```
