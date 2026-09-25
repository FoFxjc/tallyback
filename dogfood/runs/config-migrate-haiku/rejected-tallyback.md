# Failed or rejected Tallyback invocations

## call 9
```
tallyback view
```
```
Exit code 1
{
  "ok": false,
  "code": "mutation.ledger_not_initialized",
  "message": "No Tallyback ledger exists at /tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/bench/w/4HqUcbEs/repo/.tallyback.",
  "next_action": {
    "command": "tallyback init",
    "reason": "Initialize Tallyback before viewing or recording tracked work."
  }
}
mutation.ledger_not_initialized: No Tallyback ledger exists at /tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/bench/w/4HqUcbEs/repo/.tallyback.
```

## call 17
```
tallyback declare --task-id tsk_01a0d754-bd94-763b-bbb6-d5681ecd75f4
```
```
Exit code 1
error: missing required --objective
```

## call 20
```
tallyback dispatch --task-id tsk_01a0d754-bd94-763b-bbb6-d5681ecd75f4
```
```
Exit code 1
error: missing required --declaration-id
```

## call 21
```
tallyback dispatch --task-id tsk_01a0d754-bd94-763b-bbb6-d5681ecd75f4 --declaration-id dcl_01a0d754-ddb1-73fb-a808-02c4074906d4
```
```
Exit code 1
error: missing required --repository-id
```

## call 22
```
tallyback dispatch --task-id tsk_01a0d754-bd94-763b-bbb6-d5681ecd75f4 --declaration-id dcl_01a0d754-ddb1-73fb-a808-02c4074906d4 --repository-id repo_01a0d754-9e8e-70db-a29b-febf498fd5fa
```
```
Exit code 1
error: missing required --workspace-id
```

## call 29
```
tallyback claim --attempt-id att_01a0d755-1b78-711f-b309-d5115efd1a5d --declaration-id dcl_01a0d754-ddb1-73fb-a808-02c4074906d4 --what "Migration function updated to preserve all unknown keys"
```
```
Exit code 1
error: missing required --task-id
```

## call 30
```
tallyback claim --task-id tsk_01a0d754-bd94-763b-bbb6-d5681ecd75f4 --attempt-id att_01a0d755-1b78-711f-b309-d5115efd1a5d --declaration-id dcl_01a0d754-ddb1-73fb-a808-02c4074906d4 --what "Migration function updated to preserve all unknown keys"
```
```
Exit code 1
error: missing required --statement
```

## call 32
```
tallyback evidence --task-id tsk_01a0d754-bd94-763b-bbb6-d5681ecd75f4 --attempt-id att_01a0d755-1b78-711f-b309-d5115efd1a5d --claim-id clm_01a0d755-73bf-703e-b488-0b5cf53efdcb --reference "12 tests passing, including new tests for unknown key preservation and input mutation"
```
```
Exit code 1
error: missing required --kind
```

## call 34
```
tallyback evidence --task-id tsk_01a0d754-bd94-763b-bbb6-d5681ecd75f4 --attempt-id att_01a0d755-1b78-711f-b309-d5115efd1a5d --claim-id clm_01a0d755-73bf-703e-b488-0b5cf53efdcb --kind test --reference "12 tests passing, including new tests for unknown key preservation and input mutation"
```
```
Exit code 1
error: missing required --payload
```

## call 35
```
tallyback evidence --task-id tsk_01a0d754-bd94-763b-bbb6-d5681ecd75f4 --attempt-id att_01a0d755-1b78-711f-b309-d5115efd1a5d --claim-id clm_01a0d755-73bf-703e-b488-0b5cf53efdcb --kind test --reference "tests/test_migrate.py" --payload "12 tests passed: test_preserves_unknown_keys, test_does_not_mutate_input, and all existing tests"
```
```
Exit code 1
error: --payload must be valid JSON
```

## call 36
```
tallyback evidence --task-id tsk_01a0d754-bd94-763b-bbb6-d5681ecd75f4 --attempt-id att_01a0d755-1b78-711f-b309-d5115efd1a5d --claim-id clm_01a0d755-73bf-703e-b488-0b5cf53efdcb --kind test --reference "tests/test_migrate.py" --payload '{"passed": 12, "failed": 0, "tests": ["test_preserves_unknown_keys", "test_does_not_mutate_input"]}'
```
```
Exit code 1
{
  "ok": false,
  "code": "schema.unknown_evidence_kind",
  "message": "unknown evidence kind \"test\""
}
schema.unknown_evidence_kind: unknown evidence kind "test"
```

## call 37
```
tallyback evidence --task-id tsk_01a0d754-bd94-763b-bbb6-d5681ecd75f4 --attempt-id att_01a0d755-1b78-711f-b309-d5115efd1a5d --claim-id clm_01a0d755-73bf-703e-b488-0b5cf53efdcb --kind artifact --reference "tests/test_migrate.py" --payload '{"passed": 12, "failed": 0}'
```
```
Exit code 1
{
  "ok": false,
  "code": "schema.unknown_property",
  "message": "/records/0/payload must NOT have additional properties"
}
schema.unknown_property: /records/0/payload must NOT have additional properties
```

## call 40
```
tallyback begin-check --task-id tsk_01a0d754-bd94-763b-bbb6-d5681ecd75f4 --declaration-id dcl_01a0d754-ddb1-73fb-a808-02c4074906d4 --criterion "Acceptance criteria met: all 5 criteria verified"
```
```
Exit code 1
error: missing required --claim-id
```

## call 41
```
tallyback begin-check --task-id tsk_01a0d754-bd94-763b-bbb6-d5681ecd75f4 --declaration-id dcl_01a0d754-ddb1-73fb-a808-02c4074906d4 --claim-id clm_01a0d755-73bf-703e-b488-0b5cf53efdcb --criterion "Acceptance criteria met: all 5 criteria verified"
```
```
Exit code 1
error: missing required --checker-id
```

## call 42
```
tallyback begin-check --task-id tsk_01a0d754-bd94-763b-bbb6-d5681ecd75f4 --declaration-id dcl_01a0d754-ddb1-73fb-a808-02c4074906d4 --claim-id clm_01a0d755-73bf-703e-b488-0b5cf53efdcb --criterion "Acceptance criteria met: all 5 criteria verified" --checker-id claude
```
```
Exit code 1
error: missing required --checker-version
```

## call 44
```
tallyback record-check --check-invocation-id chk_01a0d755-f5d1-738e-98df-cef03a2b3cc5 --outcome pass
```
```
Exit code 1
error: --outcome must be one of verdict_emitted|verdict_withheld|check_failed
```

## call 45
```
tallyback record-check --check-invocation-id chk_01a0d755-f5d1-738e-98df-cef03a2b3cc5 --outcome verdict_emitted --verdict pass
```
```
Exit code 1
error: --verdict must be valid JSON
```

## call 46
```
tallyback record-check --check-invocation-id chk_01a0d755-f5d1-738e-98df-cef03a2b3cc5 --outcome verdict_emitted --verdict '{"pass": true}'
```
```
Exit code 1
error: missing required --invocation-id
```

## call 47
```
tallyback record-check --invocation-id chk_01a0d755-f5d1-738e-98df-cef03a2b3cc5 --outcome verdict_emitted --verdict '{"pass": true}'
```
```
Exit code 1
{
  "ok": false,
  "code": "schema.undefined_value",
  "message": "recording the check result failed after 5 retries"
}
schema.undefined_value: recording the check result failed after 5 retries
```

## call 50
```
tallyback settle --task-id tsk_01a0d754-bd94-763b-bbb6-d5681ecd75f4 --decision land --basis "All acceptance criteria met: timeout renamed to request_timeout, version set to 2, unknown keys preserved recursively, input not mutated, and regression tests added"
```
```
Exit code 1
error: missing required --attempt-id
```

## call 51
```
tallyback settle --task-id tsk_01a0d754-bd94-763b-bbb6-d5681ecd75f4 --attempt-id att_01a0d755-1b78-711f-b309-d5115efd1a5d --decision land --basis "All acceptance criteria met: timeout renamed to request_timeout, version set to 2, unknown keys preserved recursively, input not mutated, and regression tests added"
```
```
Exit code 1
error: missing required --rationale
```

## call 52
```
tallyback settle --task-id tsk_01a0d754-bd94-763b-bbb6-d5681ecd75f4 --attempt-id att_01a0d755-1b78-711f-b309-d5115efd1a5d --decision land --rationale "Fixed the migration function to preserve unknown keys and added regression tests" --basis "All acceptance criteria met"
```
```
Exit code 1
{
  "ok": false,
  "code": "invariant.settlement_basis_matrix",
  "message": "land requires exactly one of basis.verdict_id or verification_exception"
}
invariant.settlement_basis_matrix: land requires exactly one of basis.verdict_id or verification_exception
```

## call 53
```
tallyback end --attempt-id att_01a0d755-1b78-711f-b309-d5115efd1a5d --outcome done
```
```
Exit code 1
error: --outcome must be one of returned|failed|cancelled
```

## call 56
```
tallyback verdict --check-invocation-id chk_01a0d755-f5d1-738e-98df-cef03a2b3cc5 --pass
```
```
Exit code 1
error: --pass requires a value (use --pass=<value> if it starts with "--")
```

## call 57
```
tallyback verdict --check-invocation-id chk_01a0d755-f5d1-738e-98df-cef03a2b3cc5 --pass=true
```
```
Exit code 1
error: missing required --claim
```

## call 58
```
tallyback verdict --check-invocation-id chk_01a0d755-f5d1-738e-98df-cef03a2b3cc5 --claim clm_01a0d755-73bf-703e-b488-0b5cf53efdcb --pass=true
```
```
Exit code 1
error: declaration dcl_01a0d754-ddb1-73fb-a808-02c4074906d4 has no criteria; nothing to assess
```

## call 59
```
tallyback settle --task-id tsk_01a0d754-bd94-763b-bbb6-d5681ecd75f4 --attempt-id att_01a0d755-1b78-711f-b309-d5115efd1a5d --decision land --rationale "Fixed the migration function to preserve unknown keys and added regression tests" --basis-verification-exception "No formal verification needed - tests confirm all criteria"
```
```
Exit code 1
{
  "ok": false,
  "code": "invariant.settlement_basis_matrix",
  "message": "land requires exactly one of basis.verdict_id or verification_exception"
}
invariant.settlement_basis_matrix: land requires exactly one of basis.verdict_id or verification_exception
```

## call 60
```
tallyback settle --task-id tsk_01a0d754-bd94-763b-bbb6-d5681ecd75f4 --attempt-id att_01a0d755-1b78-711f-b309-d5115efd1a5d --decision land --rationale "Fixed the migration function to preserve unknown keys and added regression tests" --verdict-exception "No formal verification needed - tests confirm all criteria"
```
```
Exit code 1
{
  "ok": false,
  "code": "invariant.settlement_basis_matrix",
  "message": "land requires exactly one of basis.verdict_id or verification_exception"
}
invariant.settlement_basis_matrix: land requires exactly one of basis.verdict_id or verification_exception
```

## call 61
```
tallyback settle --task-id tsk_01a0d754-bd94-763b-bbb6-d5681ecd75f4 --attempt-id att_01a0d755-1b78-711f-b309-d5115efd1a5d --decision done --rationale "Fixed the migration function to preserve unknown keys and added regression tests"
```
```
Exit code 1
error: --decision must be one of accept|retry|abandon|land
```

## call 62
```
tallyback settle --task-id tsk_01a0d754-bd94-763b-bbb6-d5681ecd75f4 --attempt-id att_01a0d755-1b78-711f-b309-d5115efd1a5d --decision accept --rationale "Fixed the migration function to preserve unknown keys and added regression tests"
```
```
Exit code 1
{
  "ok": false,
  "code": "invariant.settlement_basis_matrix",
  "message": "accept requires exactly one of basis.verdict_id or verification_exception"
}
invariant.settlement_basis_matrix: accept requires exactly one of basis.verdict_id or verification_exception
```
