# Failed or rejected Tallyback invocations

## call 12
```
tallyback decision \
  --subject-kind attempt \
  --subject-id att_01a0d84f-8df5-7529-9bb7-e59eda227479 \
  --role execution_choice \
  --question "Execution fit" \
  --choice "FIT: Clear path to implement and verify" \
  --rationale "criteria: All 5 criteria are clear and testable; capability: Can write Python, run tests; verification: Test suite can verify all criteria; tools/authority: Have edit/bash/read tools, can modify code and run tests" \
  --actor executor:claude-haiku-4-5
```
```
Exit code 1
{
  "ok": false,
  "code": "invariant.supersession_conflict",
  "message": "lineage decision|decision:attempt:att_01a0d84f-8df5-7529-9bb7-e59eda227479:execution_choice has 2 concurrent unsuperseded heads (dec_01a0d84f-ab8d-7658-881a-d7ec29245480, dec_01a0d850-954f-767a-8edb-d593c6316fc5); a revision must declare what it supersedes — Store never selects one by timestamp"
}
invariant.supersession_conflict: lineage decision|decision:attempt:att_01a0d84f-8df5-7529-9bb7-e59eda227479:execution_choice has 2 concurrent unsuperseded heads (dec_01a0d84f-ab8d-7658-881a-d7ec29245480, dec_01a0d850-954f-767a-8edb-d593c6316fc5); a revision must declare what it supersedes — Store never selects one by timestamp
```

## call 13
```
tallyback show att_01a0d84f-8df5-7529-9bb7-e59eda227479 | head -100
```
```
cli.unexpected_argument: `show` takes no positional arguments (got "att_01a0d84f-8df5-7529-9bb7-e59eda227479"); pass values with flags. See `tallyback show --help`.
{
  "ok": false,
  "code": "cli.unexpected_argument",
  "message": "`show` takes no positional arguments (got \"att_01a0d84f-8df5-7529-9bb7-e59eda227479\"); pass values with flags. See `tallyback show --help`."
}
```

## call 32
```
tallyback evidence \
  --attempt-id att_01a0d84f-8df5-7529-9bb7-e59eda227479 \
  --summary "All tests passing" \
  --note "Ran pytest tests/ -v: 14 passed in 0.02s. Tests include 4 new regression tests for unknown key preservation." \
  --actor executor:claude-haiku-4-5
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

## call 33
```
tallyback evidence \
  --kind test_results \
  --note "Ran pytest tests/ -v: 14 passed in 0.02s. Tests include: 10 existing tests + 4 new regression tests for unknown key preservation, input non-mutation, and nested object isolation." \
  --actor executor:claude-haiku-4-5
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

## call 37
```
tallyback verdict \
  --task-id tsk_01a0d84f-4b61-7299-b289-9bdfa76dbec7 \
  --attempt-id att_01a0d84f-8df5-7529-9bb7-e59eda227479 \
  --criterion c1=PASS \
  --criterion c2=PASS \
  --criterion c3=PASS \
  --criterion c4=PASS \
  --criterion c5=PASS \
  --finding c1="test_renames_timeout_to_request_timeout verifies timeout renamed and 'timeout' key removed" \
  --finding c2="test_sets_current_version verifies version set to 2" \
  --finding c3="test_preserves_nested_unknown_keys verifies recursive preservation of user-defined keys" \
  --finding c4="test_does_not_mutate_input and test_does_not_share_nested_objects_with_input verify no mutation" \
  --finding c5="4 new regression tests added for unknown key preservation coverage" \
  --finding-basis c1=evi_01a0d851-fa4d-7400-bcfd-e72d5e56d013 \
  --finding-basis c2=evi_01a0d851-fa4d-7400-bcfd-e72d5e56d013 \
  --finding-basis c3=evi_01a0d851-fa4d-7400-bcfd-e72d5e56d013 \
  --finding-basis c4=evi_01a0d851-fa4d-7400-bcfd-e72d5e56d013 \
  --finding-basis c5=evi_01a0d851-fa4d-7400-bcfd-e72d5e56d013 \
  --actor executor:claude-haiku-4-5
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
  --task-id tsk_01a0d84f-4b61-7299-b289-9bdfa76dbec7 \
  --attempt-end-id att_01a0d84f-8df5-7529-9bb7-e59eda227479 \
  --decision land \
  --basis-verdict ver_01a0d852-400f-709b-b4fe-d8b78ab3f35e \
  --basis-evidence evi_01a0d852-7625-704d-b330-87c125fd78d9 \
  --rationale "All 5 acceptance criteria verified: (c1) timeout renamed to request_timeout, (c2) version set to 2, (c3) user-defined keys preserved recursively, (c4) input object not mutated, (c5) regression coverage added. All 14 tests passing. Code committed." \
  --actor executor:claude-haiku-4-5
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

## call 45
```
tallyback settle \
  --task-id tsk_01a0d84f-4b61-7299-b289-9bdfa76dbec7 \
  --attempt-end-id att_01a0d84f-8df5-7529-9bb7-e59eda227479 \
  --decision land \
  --verdict-id ver_01a0d852-400f-709b-b4fe-d8b78ab3f35e \
  --rationale "All 5 acceptance criteria verified: (c1) timeout renamed to request_timeout, (c2) version set to 2, (c3) user-defined keys preserved recursively, (c4) input object not mutated, (c5) regression coverage added. All 14 tests passing. Code committed." \
  --actor executor:claude-haiku-4-5
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

## call 46
```
tallyback settle \
  --task-id tsk_01a0d84f-4b61-7299-b289-9bdfa76dbec7 \
  --attempt-id att_01a0d84f-8df5-7529-9bb7-e59eda227479 \
  --attempt-end-id att_01a0d84f-8df5-7529-9bb7-e59eda227479 \
  --decision land \
  --verdict-id ver_01a0d852-400f-709b-b4fe-d8b78ab3f35e \
  --rationale "All 5 acceptance criteria verified: (c1) timeout renamed to request_timeout, (c2) version set to 2, (c3) user-defined keys preserved recursively, (c4) input object not mutated, (c5) regression coverage added. All 14 tests passing. Code committed." \
  --actor executor:claude-haiku-4-5
```
```
Exit code 1
{
  "ok": false,
  "code": "schema.unknown_property",
  "message": "/records/0/basis/attempt_end_id must match pattern \"^ate_[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$\""
}
schema.unknown_property: /records/0/basis/attempt_end_id must match pattern "^ate_[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
```
