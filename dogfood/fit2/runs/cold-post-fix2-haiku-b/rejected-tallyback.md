# Failed or rejected Tallyback invocations

## call 13
```
tallyback evidence --task-id tsk_01a0d881-b95e-7176-9148-368ddf93c29c --attempt-id att_01a0d882-0dad-728f-ab06-25ad6c2351ce --kind test_result --note "12 tests pass: version set to 2, timeout renamed to request_timeout, plugins preserved, unknown keys preserved (custom, other_field), input not mutated" --actor executor:claude-code
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

## call 14
```
tallyback evidence --kind test_result --note "12 tests pass: version set to 2, timeout renamed to request_timeout, plugins preserved, unknown keys preserved (custom, other_field), input not mutated" --actor executor:claude-code
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

## call 18
```
tallyback verdict --task-id tsk_01a0d881-b95e-7176-9148-368ddf93c29c --attempt-id att_01a0d882-0dad-728f-ab06-25ad6c2351ce --criterion rename_timeout=supported --finding rename_timeout="timeout is renamed to request_timeout (verified by test_renames_timeout_to_request_timeout)" --finding-basis rename_timeout=evi_01a0d883-4534-7114-8ef1-0029cd85e826 --actor executor:claude-code
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

## call 21
```
tallyback settle --task-id tsk_01a0d881-b95e-7176-9148-368ddf93c29c --decision land --verdict-id ver_01a0d883-87a9-70c9-95b4-bc09c427b4a3 --actor executor:claude-code
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

## call 22
```
tallyback settle --task-id tsk_01a0d881-b95e-7176-9148-368ddf93c29c --attempt-id att_01a0d882-0dad-728f-ab06-25ad6c2351ce --decision land --verdict-id ver_01a0d883-87a9-70c9-95b4-bc09c427b4a3 --actor executor:claude-code
```
```
Exit code 1
{
  "ok": false,
  "code": "cli.missing_flag",
  "message": "missing required --rationale. See `tallyback settle --help`."
}
cli.missing_flag: missing required --rationale. See `tallyback settle --help`.
```
