# Failed or rejected Tallyback invocations

## call 3
```
tallyback view
```
```
Exit code 1
{
  "ok": false,
  "code": "mutation.ledger_not_initialized",
  "message": "No Tallyback ledger exists at /tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/bench/w/P1g2o0Ud/repo/.tallyback.",
  "next_action": {
    "command": "tallyback init",
    "reason": "Initialize Tallyback before viewing or recording tracked work."
  }
}
mutation.ledger_not_initialized: No Tallyback ledger exists at /tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/bench/w/P1g2o0Ud/repo/.tallyback.
```

## call 16
```
tallyback declare --task-id tsk_01a0d756-f269-7346-8f64-05de9bc48b12 --title "Fix chunk batching bug" --description "The chunk() function has a bug where oversized items (larger than max_bytes) are dropped. When an oversized item is encountered, the code uses 'continue' to skip adding it to any batch. The fix is to emit the oversized item in its own batch instead of dropping it. Must satisfy 6 acceptance criteria from ISSUE.md including: max_items limit, max_bytes limit, oversized items emitted alone, no empty batches, order preserved, and regression tests pass."
```
```
Exit code 1
error: missing required --objective
```

## call 17
```
tallyback declare --help
```
```
Exit code 1
error: missing required --task-id
```

## call 20
```
tallyback dispatch --task-id tsk_01a0d756-f269-7346-8f64-05de9bc48b12
```
```
Exit code 1
error: missing required --declaration-id
```

## call 21
```
tallyback dispatch --task-id tsk_01a0d756-f269-7346-8f64-05de9bc48b12 --declaration-id dcl_01a0d757-f59c-7550-ac71-4f16211c468f
```
```
Exit code 1
error: missing required --repository-id
```

## call 22
```
tallyback dispatch --task-id tsk_01a0d756-f269-7346-8f64-05de9bc48b12 --declaration-id dcl_01a0d757-f59c-7550-ac71-4f16211c468f --repository-id repo_01a0d756-cf95-770b-b141-e8a6f0bd90ff
```
```
Exit code 1
error: missing required --workspace-id
```

## call 23
```
tallyback dispatch --task-id tsk_01a0d756-f269-7346-8f64-05de9bc48b12 --declaration-id dcl_01a0d757-f59c-7550-ac71-4f16211c468f --repository-id repo_01a0d756-cf95-770b-b141-e8a6f0bd90ff --workspace-id /tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/bench/w/P1g2o0Ud/repo
```
```
Exit code 1
{
  "ok": false,
  "code": "schema.unknown_property",
  "message": "/records/0/workspace_id must match pattern \"^wsp_[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$\""
}
schema.unknown_property: /records/0/workspace_id must match pattern "^wsp_[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
```

## call 31
```
tallyback settle --task-id tsk_01a0d756-f269-7346-8f64-05de9bc48b12 --decision land --basis "All 9 tests pass, including the two previously failing tests (test_oversized_item_is_emitted_alone, test_oversized_first_item). All 6 acceptance criteria from ISSUE.md are satisfied: max_items limit respected, max_bytes limit respected, oversized items emitted alone, no empty batches, order preserved, and regression tests pass. Commit: 4a9ff99"
```
```
Exit code 1
error: missing required --attempt-id
```

## call 33
```
tallyback dispatch --task-id tsk_01a0d756-f269-7346-8f64-05de9bc48b12 --declaration-id dcl_01a0d757-f59c-7550-ac71-4f16211c468f --repository-id repo_01a0d756-cf95-770b-b141-e8a6f0bd90ff --workspace-id wsp_000001a0-d758-7cc1-9d27-f4f9511c9159
```
```
Exit code 1
{
  "ok": false,
  "code": "invariant.attempt_unresolved",
  "message": "attempt references an unknown task, declaration, repository, or workspace"
}
invariant.attempt_unresolved: attempt references an unknown task, declaration, repository, or workspace
```

## call 35
```
tallyback workspace --alias main
```
```
Exit code 1
error: missing required --repository-id
```

## call 38
```
tallyback claim --attempt-id att_01a0d759-1116-7166-889f-aa11b6caa875 --claim "The chunk() function now properly handles all acceptance criteria from ISSUE.md"
```
```
Exit code 1
error: missing required --task-id
```

## call 39
```
tallyback claim --task-id tsk_01a0d756-f269-7346-8f64-05de9bc48b12 --attempt-id att_01a0d759-1116-7166-889f-aa11b6caa875 --claim "The chunk() function now properly handles all acceptance criteria from ISSUE.md: max_items limit, max_bytes limit, oversized items emitted alone, no empty batches, and order preserved"
```
```
Exit code 1
error: missing required --declaration-id
```

## call 40
```
tallyback claim --task-id tsk_01a0d756-f269-7346-8f64-05de9bc48b12 --declaration-id dcl_01a0d757-f59c-7550-ac71-4f16211c468f --attempt-id att_01a0d759-1116-7166-889f-aa11b6caa875 --claim "The chunk() function now properly handles all acceptance criteria from ISSUE.md"
```
```
Exit code 1
error: missing required --statement
```

## call 42
```
tallyback evidence --claim-id clm_01a0d759-3c65-74e6-86d6-55026ceecb4a --attempt-id att_01a0d759-1116-7166-889f-aa11b6caa875 --pointer "git commit 4a9ff99: Fixed chunk batching bug" --description "All 9 tests pass, including test_oversized_item_is_emitted_alone and test_oversized_first_item which were previously failing"
```
```
Exit code 1
error: missing required --kind
```

## call 43
```
tallyback evidence --claim-id clm_01a0d759-3c65-74e6-86d6-55026ceecb4a --attempt-id att_01a0d759-1116-7166-889f-aa11b6caa875 --kind "test_result" --pointer "tests/test_chunk.py:all 9 tests passed" --description "All 9 tests pass, including test_oversized_item_is_emitted_alone and test_oversized_first_item which were previously failing"
```
```
Exit code 1
error: missing required --payload
```

## call 44
```
tallyback evidence --claim-id clm_01a0d759-3c65-74e6-86d6-55026ceecb4a --attempt-id att_01a0d759-1116-7166-889f-aa11b6caa875 --kind "test_result" --payload '{"tests_passed": 9, "tests_failed": 0, "previously_failing": ["test_oversized_item_is_emitted_alone", "test_oversized_first_item"]}'
```
```
Exit code 1
{
  "ok": false,
  "code": "schema.unknown_evidence_kind",
  "message": "unknown evidence kind \"test_result\""
}
schema.unknown_evidence_kind: unknown evidence kind "test_result"
```

## call 45
```
tallyback evidence --claim-id clm_01a0d759-3c65-74e6-86d6-55026ceecb4a --attempt-id att_01a0d759-1116-7166-889f-aa11b6caa875 --kind "build_log" --payload '{"test_status": "9 passed, 0 failed"}'
```
```
Exit code 1
{
  "ok": false,
  "code": "schema.unknown_evidence_kind",
  "message": "unknown evidence kind \"build_log\""
}
schema.unknown_evidence_kind: unknown evidence kind "build_log"
```

## call 46
```
tallyback evidence --claim-id clm_01a0d759-3c65-74e6-86d6-55026ceecb4a --attempt-id att_01a0d759-1116-7166-889f-aa11b6caa875 --kind "commit" --payload '{"sha": "4a9ff99", "message": "Fix chunk batching bug: handle oversized items"}'
```
```
Exit code 1
{
  "ok": false,
  "code": "schema.unknown_evidence_kind",
  "message": "unknown evidence kind \"commit\""
}
schema.unknown_evidence_kind: unknown evidence kind "commit"
```

## call 47
```
tallyback begin-check --task-id tsk_01a0d756-f269-7346-8f64-05de9bc48b12 --declaration-id dcl_01a0d757-f59c-7550-ac71-4f16211c468f --claim-id clm_01a0d759-3c65-74e6-86d6-55026ceecb4a --attempt-id att_01a0d759-1116-7166-889f-aa11b6caa875
```
```
Exit code 1
error: missing required --checker-id
```

## call 48
```
tallyback settle --task-id tsk_01a0d756-f269-7346-8f64-05de9bc48b12 --attempt-id att_01a0d759-1116-7166-889f-aa11b6caa875 --decision land --basis "All 9 tests pass. Commit 4a9ff99 fixes the bug: oversized items are now properly emitted in their own batch instead of being dropped. All 6 acceptance criteria from ISSUE.md satisfied."
```
```
Exit code 1
error: missing required --rationale
```

## call 49
```
tallyback settle --task-id tsk_01a0d756-f269-7346-8f64-05de9bc48b12 --attempt-id att_01a0d759-1116-7166-889f-aa11b6caa875 --decision land --basis "All 9 tests pass. Commit 4a9ff99 fixes the bug: oversized items are now properly emitted in their own batch instead of being dropped." --rationale "The bug was caused by a continue statement that skipped adding oversized items to any batch. The fix checks if an item exceeds max_bytes and emits it in its own batch, satisfying all 6 acceptance criteria."
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

## call 50
```
tallyback settle --task-id tsk_01a0d756-f269-7346-8f64-05de9bc48b12 --attempt-id att_01a0d759-1116-7166-889f-aa11b6caa875 --decision accept --basis "All 9 tests pass." --rationale "The bug was caused by a continue statement that skipped adding oversized items. The fix now emits them in their own batch, satisfying all 6 acceptance criteria from ISSUE.md."
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

## call 51
```
tallyback record-check --task-id tsk_01a0d756-f269-7346-8f64-05de9bc48b12 --declaration-id dcl_01a0d757-f59c-7550-ac71-4f16211c468f --claim-id clm_01a0d759-3c65-74e6-86d6-55026ceecb4a --attempt-id att_01a0d759-1116-7166-889f-aa11b6caa875 --verdict pass --comment "All 9 tests pass, including the two previously failing oversized item tests"
```
```
Exit code 1
error: missing required --outcome
```

## call 52
```
tallyback record-check --task-id tsk_01a0d756-f269-7346-8f64-05de9bc48b12 --declaration-id dcl_01a0d757-f59c-7550-ac71-4f16211c468f --claim-id clm_01a0d759-3c65-74e6-86d6-55026ceecb4a --attempt-id att_01a0d759-1116-7166-889f-aa11b6caa875 --outcome pass --comment "All 9 tests pass"
```
```
Exit code 1
error: --outcome must be one of verdict_emitted|verdict_withheld|check_failed
```

## call 53
```
tallyback record-check --task-id tsk_01a0d756-f269-7346-8f64-05de9bc48b12 --declaration-id dcl_01a0d757-f59c-7550-ac71-4f16211c468f --claim-id clm_01a0d759-3c65-74e6-86d6-55026ceecb4a --attempt-id att_01a0d759-1116-7166-889f-aa11b6caa875 --outcome verdict_emitted --verdict pass --comment "All 9 tests pass, including test_oversized_item_is_emitted_alone and test_oversized_first_item"
```
```
Exit code 1
error: --verdict must be valid JSON
```

## call 54
```
tallyback record-check --task-id tsk_01a0d756-f269-7346-8f64-05de9bc48b12 --declaration-id dcl_01a0d757-f59c-7550-ac71-4f16211c468f --claim-id clm_01a0d759-3c65-74e6-86d6-55026ceecb4a --attempt-id att_01a0d759-1116-7166-889f-aa11b6caa875 --outcome verdict_emitted --verdict '{"is_favorable": true}' --comment "All 9 tests pass"
```
```
Exit code 1
error: missing required --invocation-id
```

## call 55
```
tallyback end --attempt-id att_01a0d759-1116-7166-889f-aa11b6caa875 --stop-reason "completed" --summary "Bug fix complete: all 9 tests pass"
```
```
Exit code 1
error: missing required --outcome
```

## call 56
```
tallyback end --attempt-id att_01a0d759-1116-7166-889f-aa11b6caa875 --outcome success
```
```
Exit code 1
error: --outcome must be one of returned|failed|cancelled
```
