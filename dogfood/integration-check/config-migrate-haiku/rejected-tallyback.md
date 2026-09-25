# Failed or rejected Tallyback invocations

## call 7
```
tallyback view
```
```
Exit code 1
{
  "ok": false,
  "code": "mutation.ledger_not_initialized",
  "message": "No Tallyback ledger exists at /tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/ic/w/38peCW8L/repo/.tallyback.",
  "next_action": {
    "command": "tallyback init",
    "reason": "Initialize Tallyback before viewing or recording tracked work."
  }
}
mutation.ledger_not_initialized: No Tallyback ledger exists at /tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/ic/w/38peCW8L/repo/.tallyback.
```

## call 31
```
tallyback evidence \
  --attempt-id att_01a0d7a7-eb8f-77ab-b013-c8a4440db20c \
  --kind test_run \
  --note "All 13 tests pass: existing tests + 3 new regression tests for unknown key preservation. Verified exact scenario from ISSUE.md works correctly."
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

## call 32
```
tallyback evidence \
  --kind test_run \
  --note "All 13 tests pass: existing tests + 3 new regression tests for unknown key preservation. Verified exact scenario from ISSUE.md works correctly."
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

## call 33
```
tallyback evidence \
  --kind test_run \
  --payload "13 passed in 0.02s" \
  --note "All 13 tests pass: existing tests + 3 new regression tests for unknown key preservation. Verified exact scenario from ISSUE.md works correctly."
```
```
Exit code 1
{
  "ok": false,
  "code": "cli.usage_error",
  "message": "--payload must be valid JSON"
}
cli.usage_error: --payload must be valid JSON
```

## call 34
```
tallyback evidence \
  --kind test_run \
  --payload '{"passed": 13, "failed": 0, "duration": "0.02s"}' \
  --note "All 13 tests pass: existing tests + 3 new regression tests for unknown key preservation"
```
```
Exit code 1
{
  "ok": false,
  "code": "schema.unknown_property",
  "message": "/records/0/payload must have required property 'exit_code'",
  "hint": "--payload for kind test_run: {exit_code (required), command, started_at, finished_at, repository_id, workspace_id, working_tree, output_digest}. Put the human-readable result (counts, failing tests) in --note. See `tallyback evidence --help` for every kind."
}
schema.unknown_property: /records/0/payload must have required property 'exit_code'
hint: --payload for kind test_run: {exit_code (required), command, started_at, finished_at, repository_id, workspace_id, working_tree, output_digest}. Put the human-readable result (counts, failing tests) in --note. See `tallyback evidence --help` for every kind.
```

## call 36
```
tallyback claim \
  --task-id tsk_01a0d7a7-a620-73cb-926a-3a03912f0e09 \
  --attempt-id att_01a0d7a7-eb8f-77ab-b013-c8a4440db20c \
  --criterion timeout_renamed \
  --evidence evi_01a0d7a8-b70d-73be-bfaa-99ca532e23c1 \
  --note "test_renames_timeout_to_request_timeout verifies timeout is renamed and removed"
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

## call 37
```
tallyback claim \
  --task-id tsk_01a0d7a7-a620-73cb-926a-3a03912f0e09 \
  --attempt-id att_01a0d7a7-eb8f-77ab-b013-c8a4440db20c \
  --statement "timeout renamed to request_timeout" \
  --evidence evi_01a0d7a8-b70d-73be-bfaa-99ca532e23c1
```
```
Exit code 1
{
  "ok": false,
  "code": "cli.missing_flag",
  "message": "missing required --declaration-id. See `tallyback claim --help`."
}
cli.missing_flag: missing required --declaration-id. See `tallyback claim --help`.
```

## call 41
```
tallyback verdict \
  --task-id tsk_01a0d7a7-a620-73cb-926a-3a03912f0e09 \
  --criterion timeout_renamed=CONFIRMED \
  --criterion version_updated=CONFIRMED \
  --criterion preserve_keys=CONFIRMED \
  --criterion no_mutation=CONFIRMED \
  --criterion test_coverage=CONFIRMED \
  --finding timeout_renamed="test_renames_timeout_to_request_timeout passes and verifies rename" \
  --finding version_updated="test_sets_current_version passes and verifies version=2" \
  --finding preserve_keys="test_preserves_unknown_keys and test_preserves_nested_unknown_keys pass" \
  --finding no_mutation="test_does_not_mutate_input passes" \
  --finding test_coverage="Added 3 new regression tests covering unknown key preservation" \
  --note "All acceptance criteria verified through passing test suite"
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

## call 44
```
tallyback settle \
  --task-id tsk_01a0d7a7-a620-73cb-926a-3a03912f0e09 \
  --decision land \
  --rationale "All acceptance criteria verified. Test suite passes 100%. Ready to merge."
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

## call 45
```
tallyback settle \
  --task-id tsk_01a0d7a7-a620-73cb-926a-3a03912f0e09 \
  --attempt-id att_01a0d7a7-eb8f-77ab-b013-c8a4440db20c \
  --decision land \
  --rationale "All acceptance criteria verified. Test suite passes 100%. Ready to merge."
```
```
Exit code 1
{
  "ok": false,
  "code": "invariant.settlement_basis_matrix",
  "message": "land requires exactly one of basis.verdict_id or verification_exception",
  "hint": "accept and land need exactly one basis: --verdict-id <ver_…> (a Verdict recorded with `tallyback verdict`), or --verification-exception \"<why this is accepted without a Verdict>\" — an explicit, attributed override. Passing tests are not a Verdict."
}
invariant.settlement_basis_matrix: land requires exactly one of basis.verdict_id or verification_exception
hint: accept and land need exactly one basis: --verdict-id <ver_…> (a Verdict recorded with `tallyback verdict`), or --verification-exception "<why this is accepted without a Verdict>" — an explicit, attributed override. Passing tests are not a Verdict.
```
