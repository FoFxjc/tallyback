# Failed or rejected Tallyback invocations

## call 4
```
tallyback view
```
```
Exit code 1
{
  "ok": false,
  "code": "mutation.ledger_not_initialized",
  "message": "No Tallyback ledger exists at /tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/fit/w/j1RfJsDl/repo/.tallyback.",
  "next_action": {
    "command": "tallyback init",
    "reason": "Initialize Tallyback before viewing or recording tracked work."
  }
}
mutation.ledger_not_initialized: No Tallyback ledger exists at /tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/fit/w/j1RfJsDl/repo/.tallyback.
```

## call 13
```
tallyback dispatch --task-id tsk_01a0d843-580c-71df-9b65-abace2e44069 --actor executor:claude-code
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

## call 14
```
tallyback dispatch --task-id tsk_01a0d843-580c-71df-9b65-abace2e44069 --executor claude-code
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

## call 15
```
tallyback dispatch --task-id tsk_01a0d843-580c-71df-9b65-abace2e44069 --declaration-id dcl_01a0d843-7426-731f-8f95-1bb0958fb173 --executor claude-code
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

## call 16
```
tallyback dispatch --task-id tsk_01a0d843-580c-71df-9b65-abace2e44069 --declaration-id dcl_01a0d843-7426-731f-8f95-1bb0958fb173 --executor claude-code --repository-id repo_01a0d843-36c0-71da-9b84-a036f4bc836c
```
```
Exit code 1
{
  "ok": false,
  "code": "cli.missing_flag",
  "message": "missing required --workspace-id. See `tallyback dispatch --help`."
}
cli.missing_flag: missing required --workspace-id. See `tallyback dispatch --help`.
```

## call 21
```
tallyback dispatch --task-id tsk_01a0d843-580c-71df-9b65-abace2e44069 --declaration-id dcl_01a0d843-7426-731f-8f95-1bb0958fb173 --executor claude-code --repository-id repo_01a0d843-36c0-71da-9b84-a036f4bc836c --workspace-id wsp_01a0d843-c0bb-721d-b103-7993fc54770f
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

## call 27
```
tallyback evidence --attempt-id att_01a0d843-d7e1-7344-93d8-30adb3016306 \
  --note "Found bug in chunk() function: line 31-32 uses 'continue' when item size > max_bytes, which skips adding the oversized item to any batch. Test test_oversized_item_is_emitted_alone fails because b(50, 'B') is lost. Expected [[b'ss'], [b'BBBBB...'], [b'tt']] but got [[b'ss'], [b'tt']]" \
  --as executor:claude-code
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

## call 28
```
tallyback evidence --kind test_output \
  --note "Test test_oversized_item_is_emitted_alone fails: oversized item (50 bytes) is lost. Bug: chunk() line 31-32 has 'continue' that skips items larger than max_bytes instead of emitting them alone. Expected [[b'ss'], [b'BBBBB...'], [b'tt']] but got [[b'ss'], [b'tt']]" \
  --as executor:claude-code
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

## call 40
```
tallyback claim --task-id tsk_01a0d843-580c-71df-9b65-abace2e44069 \
  --statement "Oversized items are now correctly emitted in their own batch, not dropped" \
  --criterion oversized_item \
  --evidence evi_01a0d844-9844-72e8-aebe-4119139aa52d \
  --evidence evi_01a0d844-c0ab-744f-990d-c9e261b00481 \
  --as executor:claude-code
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

## call 43
```
tallyback verdict \
  --task-id tsk_01a0d843-580c-71df-9b65-abace2e44069 \
  --attempt-id att_01a0d843-d7e1-7344-93d8-30adb3016306 \
  --declaration-id dcl_01a0d843-7426-731f-8f95-1bb0958fb173 \
  --criterion max_items=met \
  --finding max_items="test_respects_max_items passes: batches respect max_items limit" \
  --finding-basis max_items=evi_01a0d844-9844-72e8-aebe-4119139aa52d \
  --criterion max_bytes=met \
  --finding max_bytes="test_respects_max_bytes and test_exact_byte_boundary_fits_in_one_batch pass" \
  --finding-basis max_bytes=evi_01a0d844-9844-72e8-aebe-4119139aa52d \
  --criterion oversized_item=met \
  --finding oversized_item="test_oversized_item_is_emitted_alone now passes (was failing before fix)" \
  --finding-basis oversized_item=evi_01a0d844-9844-72e8-aebe-4119139aa52d \
  --criterion no_empty_batches=met \
  --finding no_empty_batches="test_empty_input correctly returns empty list; no empty batches produced in other tests" \
  --finding-basis no_empty_batches=evi_01a0d844-9844-72e8-aebe-4119139aa52d \
  --criterion order_preserved=met \
  --finding order_preserved="test_preserves_order passes: concatenating batches yields original order" \
  --finding-basis order_preserved=evi_01a0d844-9844-72e8-aebe-4119139aa52d \
  --criterion regression_tests=met \
  --finding regression_tests="All 8 tests pass including test for oversized item handling" \
  --finding-basis regression_tests=evi_01a0d844-9844-72e8-aebe-4119139aa52d \
  --as executor:claude-code
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

## call 52
```
tallyback settle \
  --task-id tsk_01a0d843-580c-71df-9b65-abace2e44069 \
  --attempt-id att_01a0d843-d7e1-7344-93d8-30adb3016306 \
  --decision retry \
  --attempt-end-id ate_01a0d845-aec6-73a8-a0da-2a38af9af463 \
  --rationale "Property-based check revealed regression: empty batches produced. Test suite passed but acceptance criterion 4 (no empty batches) violated. Need to add guard: only append current if non-empty before emitting oversized item." \
  --as executor:claude-code
```
```
Exit code 1
{
  "ok": false,
  "code": "invariant.supersession_conflict",
  "message": "lineage settlement|task:tsk_01a0d843-580c-71df-9b65-abace2e44069:attempt:att_01a0d843-d7e1-7344-93d8-30adb3016306 has 2 concurrent unsuperseded heads (set_01a0d845-4b9d-75da-b26e-3fd1ef331cad, set_01a0d845-bd80-77ce-bd11-ec790e970778); a revision must declare what it supersedes — Store never selects one by timestamp"
}
invariant.supersession_conflict: lineage settlement|task:tsk_01a0d843-580c-71df-9b65-abace2e44069:attempt:att_01a0d843-d7e1-7344-93d8-30adb3016306 has 2 concurrent unsuperseded heads (set_01a0d845-4b9d-75da-b26e-3fd1ef331cad, set_01a0d845-bd80-77ce-bd11-ec790e970778); a revision must declare what it supersedes — Store never selects one by timestamp
```
