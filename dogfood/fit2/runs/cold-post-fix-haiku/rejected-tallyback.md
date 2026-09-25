# Failed or rejected Tallyback invocations

## call 24
```
tallyback evidence --task-id tsk_01a0d87c-d854-77a6-90df-f86a576426c8 --attempt-id att_01a0d87d-308a-72df-b3ab-1dc0c832dd92 --note "All 16 tests pass: 10 original tests + 6 new regression tests for custom field preservation and no-mutation guarantee" --evidence-type test_execution
```
```
Exit code 1
{
  "ok": false,
  "code": "cli.unknown_flag",
  "message": "`evidence` does not accept --task-id; nothing was recorded. Evidence is recorded first and then linked from the Claim: `tallyback claim … --evidence <evi_…>` (or from a Verdict: `tallyback verdict … --evidence <evi_…>`). Accepted flags: --kind --payload --note --actor. See `tallyback evidence --help`."
}
cli.unknown_flag: `evidence` does not accept --task-id; nothing was recorded. Evidence is recorded first and then linked from the Claim: `tallyback claim … --evidence <evi_…>` (or from a Verdict: `tallyback verdict … --evidence <evi_…>`). Accepted flags: --kind --payload --note --actor. See `tallyback evidence --help`.
```

## call 25
```
tallyback evidence --kind test_execution --note "All 16 tests pass (10 original + 6 new regression tests for custom field preservation and no-mutation guarantee)"
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

## call 29
```
tallyback verdict --task-id tsk_01a0d87c-d854-77a6-90df-f86a576426c8 --attempt-id att_01a0d87d-308a-72df-b3ab-1dc0c832dd92 --criterion rename_timeout=supported --criterion set_version=supported --criterion preserve_custom=supported --criterion no_mutate=supported --criterion test_coverage=supported --finding rename_timeout="Verified: timeout is renamed to request_timeout in migration" --finding set_version="Verified: version is set to 2 in _v1_to_v2" --finding preserve_custom="Verified: custom fields and all unknown keys are preserved by dict(old) shallow copy" --finding no_mutate="Verified: input object is never mutated; migrate() returns a new dict when config is already current version" --finding test_coverage="Verified: 6 new regression tests added covering custom field preservation, nested preservation, and no-mutation guarantee" --finding-basis rename_timeout="evi_01a0d87f-4e54-731d-be99-e67b87985110" --finding-basis set_version="evi_01a0d87f-4e54-731d-be99-e67b87985110" --finding-basis preserve_custom="evi_01a0d87f-4e54-731d-be99-e67b87985110" --finding-basis no_mutate="evi_01a0d87f-4e54-731d-be99-e67b87985110" --finding-basis test_coverage="evi_01a0d87f-4e54-731d-be99-e67b87985110"
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

## call 32
```
tallyback end --attempt-id att_01a0d87d-308a-72df-b3ab-1dc0c832dd92 --outcome succeeded
```
```
Exit code 1
{
  "ok": false,
  "code": "cli.invalid_value",
  "message": "--outcome must be one of returned|failed|cancelled. See `tallyback end --help`."
}
cli.invalid_value: --outcome must be one of returned|failed|cancelled. See `tallyback end --help`.
```

## call 34
```
tallyback settle --task-id tsk_01a0d87c-d854-77a6-90df-f86a576426c8 --decision land --verdict-id ver_01a0d87f-88de-72dd-9e0f-307dc853705a --attempt-end-id ate_01a0d87f-9f1a-715a-a2c0-81909a607ae0
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
