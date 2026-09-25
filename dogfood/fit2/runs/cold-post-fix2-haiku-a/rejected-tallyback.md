# Failed or rejected Tallyback invocations

## call 21
```
tallyback evidence --attempt-id att_01a0d881-fc00-77ea-ae06-6c3a249c9eec --note "All 15 tests pass including 5 new regression tests for custom key preservation" --category test_results
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

## call 22
```
tallyback evidence --kind test_results --note "All 15 pytest tests pass (10 existing + 5 new regression tests)" --actor executor:claude-code
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

## call 26
```
tallyback verdict --task-id tsk_01a0d881-b6bf-711d-b54e-1d68981fef4c --attempt-id att_01a0d881-fc00-77ea-ae06-6c3a249c9eec --claim-id clm_01a0d883-d8a1-74c1-b071-54d305125a57 --criterion timeout_renamed=supported --finding timeout_renamed="timeout key properly renamed to request_timeout" --criterion version_set=supported --finding version_set="version set to 2" --criterion preserve_keys=supported --finding preserve_keys="Custom fields and arbitrary keys preserved recursively" --criterion no_mutation=supported --finding no_mutation="Input object not mutated; deep copies prevent reference sharing" --criterion regression_test=supported --finding regression_test="5 new regression tests added covering custom key preservation and no-mutation" --evidence evi_01a0d883-c3a2-7310-813c-4c347946007d --actor executor:claude-code
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

## call 29
```
tallyback settle --task-id tsk_01a0d881-b6bf-711d-b54e-1d68981fef4c --decision land --basis-verdict ver_01a0d884-0c96-73ff-b28c-1e57a8ee6b15 --actor executor:claude-code
```
```
Exit code 1
{
  "ok": false,
  "code": "cli.unknown_flag",
  "message": "`settle` does not accept --basis-verdict; nothing was recorded. Accepted flags: --task-id --attempt-id --decision --rationale --verdict-id --verification-exception --attempt-end-id --blocker --supersedes --actor. See `tallyback settle --help`."
}
cli.unknown_flag: `settle` does not accept --basis-verdict; nothing was recorded. Accepted flags: --task-id --attempt-id --decision --rationale --verdict-id --verification-exception --attempt-end-id --blocker --supersedes --actor. See `tallyback settle --help`.
```

## call 30
```
tallyback settle --task-id tsk_01a0d881-b6bf-711d-b54e-1d68981fef4c --decision land --verdict-id ver_01a0d884-0c96-73ff-b28c-1e57a8ee6b15 --rationale "All acceptance criteria verified and passing. Ready to land." --actor executor:claude-code
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
