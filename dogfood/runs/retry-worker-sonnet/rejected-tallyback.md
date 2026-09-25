# Failed or rejected Tallyback invocations

## call 3
```
tallyback handshake && echo "---" && tallyback view
```
```
Exit code 1
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
---
{
  "ok": false,
  "code": "mutation.ledger_not_initialized",
  "message": "No Tallyback ledger exists at /tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/bench/w/2X7XStlz/repo/.tallyback.",
  "next_action": {
    "command": "tallyback init",
    "reason": "Initialize Tallyback before viewing or recording tracked work."
  }
}
mutation.ledger_not_initialized: No Tallyback ledger exists at /tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/bench/w/2X7XStlz/repo/.tallyback.
```

## call 23
```
tallyback declare --task-id tsk_01a0d757-93cb-768a-9c51-2a9a1df412d9 --objective "test" --criteria "foo" 2>&1
```
```
Exit code 1
{
  "ok": false,
  "code": "invariant.supersession_conflict",
  "message": "lineage declaration|task:tsk_01a0d757-93cb-768a-9c51-2a9a1df412d9 has 2 concurrent unsuperseded heads (dcl_01a0d757-cc01-7100-947e-84a5263c23f1, dcl_01a0d757-eb65-7487-88b1-fd61851d591b); a revision must declare what it supersedes — Store never selects one by timestamp"
}
invariant.supersession_conflict: lineage declaration|task:tsk_01a0d757-93cb-768a-9c51-2a9a1df412d9 has 2 concurrent unsuperseded heads (dcl_01a0d757-cc01-7100-947e-84a5263c23f1, dcl_01a0d757-eb65-7487-88b1-fd61851d591b); a revision must declare what it supersedes — Store never selects one by timestamp
```

## call 24
```
tallyback declare --task-id tsk_01a0d757-93cb-768a-9c51-2a9a1df412d9 --objective "Fix batcher.chunk so oversized items are never dropped, per ISSUE.md acceptance criteria" --supersedes dcl_01a0d757-cc01-7100-947e-84a5263c23f1,dcl_01a0d757-eb65-7487-88b1-fd61851d591b 2>&1
```
```
Exit code 1
{
  "ok": false,
  "code": "schema.unknown_property",
  "message": "/records/0/supersedes must match pattern \"^dcl_[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$\""
}
schema.unknown_property: /records/0/supersedes must match pattern "^dcl_[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
```

## call 25
```
tallyback declare --task-id tsk_01a0d757-93cb-768a-9c51-2a9a1df412d9 --objective "Fix batcher.chunk so oversized items are never dropped, per ISSUE.md acceptance criteria" --supersedes dcl_01a0d757-cc01-7100-947e-84a5263c23f1 --supersedes dcl_01a0d757-eb65-7487-88b1-fd61851d591b 2>&1
```
```
Exit code 1
{
  "ok": false,
  "code": "invariant.supersession_conflict",
  "message": "lineage declaration|task:tsk_01a0d757-93cb-768a-9c51-2a9a1df412d9 has 2 concurrent unsuperseded heads (dcl_01a0d757-cc01-7100-947e-84a5263c23f1, dcl_01a0d758-0fc7-71da-b7ed-93e1899c1440); a revision must declare what it supersedes — Store never selects one by timestamp"
}
invariant.supersession_conflict: lineage declaration|task:tsk_01a0d757-93cb-768a-9c51-2a9a1df412d9 has 2 concurrent unsuperseded heads (dcl_01a0d757-cc01-7100-947e-84a5263c23f1, dcl_01a0d758-0fc7-71da-b7ed-93e1899c1440); a revision must declare what it supersedes — Store never selects one by timestamp
```

## call 27
```
tallyback dispatch --task-id tsk_01a0d757-93cb-768a-9c51-2a9a1df412d9 --repository-id repo_01a0d756-d392-72fb-8f6c-e7447a9c9c86 2>&1
```
```
Exit code 1
error: missing required --declaration-id
```

## call 28
```
tallyback dispatch --task-id tsk_01a0d757-93cb-768a-9c51-2a9a1df412d9 --declaration-id dcl_01a0d757-cc01-7100-947e-84a5263c23f1 --repository-id repo_01a0d756-d392-72fb-8f6c-e7447a9c9c86 2>&1
```
```
Exit code 1
error: missing required --workspace-id
```

## call 29
```
tallyback workspace 2>&1
```
```
Exit code 1
error: missing required --repository-id
```

## call 34
```
tallyback claim --attempt-id att_01a0d758-9ddb-771a-8c5b-1277259d0ae0 --declaration-id dcl_01a0d757-cc01-7100-947e-84a5263c23f1 --text "Fixed chunk() in batcher/chunk.py: an item larger than max_bytes was being flushed as part of the current batch handling but never appended to any batch, silently dropping it. Now an oversized item flushes the current batch (if non-empty) then is emitted alone as its own batch. Added regression test test_consecutive_oversized_items_each_emitted_alone. All 10 tests in tests/test_chunk.py pass (python -m pytest)." 2>&1
```
```
Exit code 1
error: missing required --task-id
```

## call 35
```
tallyback claim --attempt-id att_01a0d758-9ddb-771a-8c5b-1277259d0ae0 --task-id tsk_01a0d757-93cb-768a-9c51-2a9a1df412d9 --declaration-id dcl_01a0d757-cc01-7100-947e-84a5263c23f1 --text "Fixed chunk() in batcher/chunk.py: an item larger than max_bytes was being flushed but never appended to any batch, silently dropping it. Now an oversized item flushes the current batch (if non-empty) then is emitted alone as its own batch. Added regression test test_consecutive_oversized_items_each_emitted_alone. All 10 tests in tests/test_chunk.py pass." 2>&1
```
```
Exit code 1
error: missing required --statement
```

## call 38
```
tallyback evidence --attempt-id att_01a0d758-9ddb-771a-8c5b-1277259d0ae0 --task-id tsk_01a0d757-93cb-768a-9c51-2a9a1df412d9 --claim-id clm_01a0d758-e658-737f-a0f5-948933a2d68c 2>&1
```
```
Exit code 1
error: missing required --kind
```

## call 39
```
tallyback evidence --attempt-id att_01a0d758-9ddb-771a-8c5b-1277259d0ae0 --task-id tsk_01a0d757-93cb-768a-9c51-2a9a1df412d9 --claim-id clm_01a0d758-e658-737f-a0f5-948933a2d68c --kind command 2>&1
```
```
Exit code 1
error: missing required --payload
```

## call 40
```
tallyback evidence --attempt-id att_01a0d758-9ddb-771a-8c5b-1277259d0ae0 --task-id tsk_01a0d757-93cb-768a-9c51-2a9a1df412d9 --claim-id clm_01a0d758-e658-737f-a0f5-948933a2d68c --kind command --payload "python -m pytest -v => 10 passed in 0.01s (tests/test_chunk.py, including test_oversized_item_is_emitted_alone, test_oversized_first_item, and new test_consecutive_oversized_items_each_emitted_alone)" 2>&1
```
```
Exit code 1
error: --payload must be valid JSON
```

## call 41
```
tallyback evidence --attempt-id att_01a0d758-9ddb-771a-8c5b-1277259d0ae0 --task-id tsk_01a0d757-93cb-768a-9c51-2a9a1df412d9 --claim-id clm_01a0d758-e658-737f-a0f5-948933a2d68c --kind command --payload '{"command":"python -m pytest -v","result":"10 passed in 0.01s","tests":["test_empty_input","test_respects_max_items","test_respects_max_bytes","test_exact_byte_boundary_fits_in_one_batch","test_preserves_order","test_oversized_item_is_emitted_alone","test_oversized_first_item","test_consecutive_oversized_items_each_emitted_alone","test_rejects_invalid_limits[0-10]","test_rejects_invalid_limits[1-0]"]}' 2>&1
```
```
Exit code 1
{
  "ok": false,
  "code": "schema.unknown_evidence_kind",
  "message": "unknown evidence kind \"command\""
}
schema.unknown_evidence_kind: unknown evidence kind "command"
```

## call 42
```
tallyback evidence --attempt-id att_01a0d758-9ddb-771a-8c5b-1277259d0ae0 --task-id tsk_01a0d757-93cb-768a-9c51-2a9a1df412d9 --claim-id clm_01a0d758-e658-737f-a0f5-948933a2d68c --kind bogus --payload '{}' 2>&1
```
```
Exit code 1
{
  "ok": false,
  "code": "schema.unknown_evidence_kind",
  "message": "unknown evidence kind \"bogus\""
}
schema.unknown_evidence_kind: unknown evidence kind "bogus"
```

## call 44
```
for k in test log diff artifact note link check test_run command_output ci build file diff_summary git; do
  out=$(tallyback evidence --attempt-id att_01a0d758-9ddb-771a-8c5b-1277259d0ae0 --task-id tsk_01a0d757-93cb-768a-9c51-2a9a1df412d9 --claim-id clm_01a0d758-e658-737f-a0f5-948933a2d68c --kind "$k" --payload '{}' 2>&1)
  echo "$k => $out" | head -c 200
  echo
done
```
```
test => {
  "ok": false,
  "code": "schema.unknown_evidence_kind",
  "message": "unknown evidence kind \"test\""
}
schema.unknown_evidence_kind: unknown evidence kind "test"

log => {
  "ok": false,
  "code": "schema.unknown_evidence_kind",
  "message": "unknown evidence kind \"log\""
}
schema.unknown_evidence_kind: unknown evidence kind "log"

diff => {
  "ok": false,
  "code": "schema.unknown_evidence_kind",
  "message": "unknown evidence kind \"diff\""
}
schema.unknown_evidence_kind: unknown evidence kind "diff"

artifact => {
  "ok": true,
  "revision": 7,
  "evidence": {
    "kind": "artifact",
    "payload": {},
    "submitted_by": {
      "kind": "tool",
      "id": "tallyback"
    },
    "evidence_id": "e
note => {
  "ok": false,
  "code": "schema.unknown_evidence_kind",
  "message": "unknown evidence kind \"note\""
}
schema.unknown_evidence_kind: unknown evidence kind "note"

link => {
  "ok": false,
  "code": "schema.unknown_evidence_kind",
  "message": "unknown evidence kind \"link\""
}
schema.unknown_evidence_kind: unknown evidence kind "link"

check => {
  "ok": false,
  "code": "schema.unknown_evidence_kind",
  "message": "unknown evidence kind \"check\""
}
schema.unknown_evidence_kind: unknown evidence kind "check"

test_run => {
  "ok": false,
  "code": "schema.unknown_property",
  "message": "/records/0/payload must have required property 'exit_code'"
}
schema.unknown_property: /records/0/payload must have requ
command_output => {
  "ok": false,
  "code": "schema.unknown_evidence_kind",
  "message": "unknown evidence kind \"command_output\""
}
schema.unknown_evidence_kind: unknown evidence kind "command_outp
ci => {
  "ok": false,
  "code": "schema.unknown_evidence_kind",
  "message": "unknown evidence kind \"ci\""
}
schema.unknown_evidence_kind: unknown evidence kind "ci"

build => {
  "ok": false,
  "code": "schema.unknown_evidence_kind",
  "message": "unknown evidence kind \"build\""
}
schema.unknown_evidence_kind: unknown evidence kind "build"


```

## call 45
```
tallyback evidence --attempt-id att_01a0d758-9ddb-771a-8c5b-1277259d0ae0 --task-id tsk_01a0d757-93cb-768a-9c51-2a9a1df412d9 --claim-id clm_01a0d758-e658-737f-a0f5-948933a2d68c --kind test_run --payload '{"exit_code":0,"command":"python -m pytest -v","summary":"10 passed in 0.01s","suite":"tests/test_chunk.py"}' 2>&1
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

## call 48
```
tallyback begin-check --task-id tsk_01a0d757-93cb-768a-9c51-2a9a1df412d9 --claim-id clm_01a0d758-e658-737f-a0f5-948933a2d68c --declaration-id dcl_01a0d757-cc01-7100-947e-84a5263c23f1 2>&1
```
```
Exit code 1
error: missing required --checker-id
```

## call 49
```
tallyback begin-check --task-id tsk_01a0d757-93cb-768a-9c51-2a9a1df412d9 --claim-id clm_01a0d758-e658-737f-a0f5-948933a2d68c --declaration-id dcl_01a0d757-cc01-7100-947e-84a5263c23f1 --checker-id pytest 2>&1
```
```
Exit code 1
error: missing required --checker-version
```

## call 53
```
tallyback record-check --check-invocation-id chk_01a0d759-e7e8-75a4-b4d6-611c8b1c919a --task-id tsk_01a0d757-93cb-768a-9c51-2a9a1df412d9 2>&1
```
```
Exit code 1
error: missing required --outcome
```

## call 54
```
tallyback record-check --check-invocation-id chk_01a0d759-e7e8-75a4-b4d6-611c8b1c919a --task-id tsk_01a0d757-93cb-768a-9c51-2a9a1df412d9 --outcome pass 2>&1
```
```
Exit code 1
error: --outcome must be one of verdict_emitted|verdict_withheld|check_failed
```

## call 55
```
tallyback record-check --check-invocation-id chk_01a0d759-e7e8-75a4-b4d6-611c8b1c919a --task-id tsk_01a0d757-93cb-768a-9c51-2a9a1df412d9 --outcome verdict_emitted 2>&1
```
```
Exit code 1
error: missing required --invocation-id
```

## call 56
```
tallyback record-check --invocation-id chk_01a0d759-e7e8-75a4-b4d6-611c8b1c919a --task-id tsk_01a0d757-93cb-768a-9c51-2a9a1df412d9 --outcome verdict_emitted 2>&1
```
```
Exit code 1
{
  "ok": false,
  "code": "invariant.check_result_outcome_mismatch",
  "message": "recording the check result failed after 5 retries"
}
invariant.check_result_outcome_mismatch: recording the check result failed after 5 retries
```

## call 57
```
tallyback record-check --invocation-id chk_01a0d759-e7e8-75a4-b4d6-611c8b1c919a --task-id tsk_01a0d757-93cb-768a-9c51-2a9a1df412d9 --outcome verdict_emitted --verdict pass 2>&1
```
```
Exit code 1
error: --verdict must be valid JSON
```

## call 58
```
tallyback record-check --invocation-id chk_01a0d759-e7e8-75a4-b4d6-611c8b1c919a --task-id tsk_01a0d757-93cb-768a-9c51-2a9a1df412d9 --outcome verdict_emitted --verdict '{"result":"pass"}' 2>&1
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

## call 59
```
for v in '{"status":"confirmed"}' '{"status":"pass"}' '{"decision":"confirmed"}' '{"outcome":"pass"}' '{"result":"confirmed","reconciliations":[]}' '{"verdict":"confirmed"}' '{"conclusion":"confirmed"}'; do
  out=$(tallyback record-check --invocation-id chk_01a0d759-e7e8-75a4-b4d6-611c8b1c919a --task-id tsk_01a0d757-93cb-768a-9c51-2a9a1df412d9 --outcome verdict_emitted --verdict "$v" 2>&1)
  echo "$v => $out"
  echo "---"
done
```
```
{"status":"confirmed"} => {
  "ok": false,
  "code": "schema.undefined_value",
  "message": "recording the check result failed after 5 retries"
}
schema.undefined_value: recording the check result failed after 5 retries
---
{"status":"pass"} => {
  "ok": false,
  "code": "schema.undefined_value",
  "message": "recording the check result failed after 5 retries"
}
schema.undefined_value: recording the check result failed after 5 retries
---
{"decision":"confirmed"} => {
  "ok": false,
  "code": "schema.undefined_value",
  "message": "recording the check result failed after 5 retries"
}
schema.undefined_value: recording the check result failed after 5 retries
---
{"outcome":"pass"} => {
  "ok": false,
  "code": "schema.undefined_value",
  "message": "recording the check result failed after 5 retries"
}
schema.undefined_value: recording the check result failed after 5 retries
---
{"result":"confirmed","reconciliations":[]} => {
  "ok": false,
  "code": "schema.undefined_value",
  "message": "recording the check result failed after 5 retries"
}
schema.undefined_value: recording the check result failed after 5 retries
---
{"verdict":"confirmed"} => {
  "ok": false,
  "code": "schema.undefined_value",
  "message": "recording the check result failed after 5 retries"
}
schema.undefined_value: recording the check result failed after 5 retries
---
{"conclusion":"confirmed"} => {
  "ok": false,
  "code": "schema.undefined_value",
  "message": "recording the check result failed after 5 retries"
}
schema.undefined_value: recording the check result failed after 5 retries
---
```

## call 60
```
tallyback record-check --invocation-id chk_01a0d759-e7e8-75a4-b4d6-611c8b1c919a --task-id tsk_01a0d757-93cb-768a-9c51-2a9a1df412d9 --outcome verdict_emitted --reconciliations '[]' --verdict '{"status":"confirmed"}' 2>&1
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

## call 62
```
tallyback verdict 2>&1; echo "==="; tallyback reconcile 2>&1
```
```
Exit code 1
error: missing required --claim
===
{
  "ok": false,
  "code": "mutation.reconcile_nothing_to_do",
  "message": "this ledger has no forked lineages; there is nothing to reconcile",
  "conflicts": []
}
mutation.reconcile_nothing_to_do: this ledger has no forked lineages; there is nothing to reconcile
```

## call 63
```
tallyback verdict --claim clm_01a0d758-e658-737f-a0f5-948933a2d68c 2>&1
```
```
Exit code 1
error: declaration dcl_01a0d757-cc01-7100-947e-84a5263c23f1 has no criteria; nothing to assess
```

## call 65
```
tallyback declare --task-id tsk_01a0d757-93cb-768a-9c51-2a9a1df412d9 --objective "Fix batcher.chunk so oversized items are never dropped" --supersedes dcl_01a0d75b-1dda-710b-b15e-fe4199990a18 --criterion "A batch contains at most max_items items." --criterion "An item larger than max_bytes is never dropped; it is emitted alone in its own batch." 2>&1
```
```
Exit code 1
error: --criterion must be "code:statement"
```

## call 68
```
tallyback verdict --claim clm_01a0d758-e658-737f-a0f5-948933a2d68c 2>&1
```
```
Exit code 1
error: declaration dcl_01a0d757-cc01-7100-947e-84a5263c23f1 has no criteria; nothing to assess
```

## call 69
```
tallyback claim --attempt-id att_01a0d758-9ddb-771a-8c5b-1277259d0ae0 --task-id tsk_01a0d757-93cb-768a-9c51-2a9a1df412d9 --declaration-id dcl_01a0d75b-4888-7534-a2b9-6ed6dcb9af75 --statement "chunk() in batcher/chunk.py fixed: an oversized item (len > max_bytes) now flushes the current batch (if non-empty) and is emitted alone in its own batch, instead of being silently dropped. max_items and max_bytes limits are respected per normal batch, no empty batches are produced, and order is preserved (unchanged logic for the non-oversized path). Regression tests added: test_oversized_item_is_emitted_alone, test_oversized_first_item (pre-existing, previously failing), and test_consecutive_oversized_items_each_emitted_alone (new). Full suite: 10/10 pass via python -m pytest -v." 2>&1
```
```
Exit code 1
{
  "ok": false,
  "code": "invariant.reference_inconsistent",
  "message": "claim clm_01a0d75b-a9bc-77c8-b36f-364d4c5395e2 cites a declaration other than the one its attempt was dispatched under"
}
invariant.reference_inconsistent: claim clm_01a0d75b-a9bc-77c8-b36f-364d4c5395e2 cites a declaration other than the one its attempt was dispatched under
```

## call 70
```
tallyback end --attempt-id att_01a0d758-9ddb-771a-8c5b-1277259d0ae0 --task-id tsk_01a0d757-93cb-768a-9c51-2a9a1df412d9 2>&1
```
```
Exit code 1
error: missing required --outcome
```

## call 71
```
tallyback end --attempt-id att_01a0d758-9ddb-771a-8c5b-1277259d0ae0 --task-id tsk_01a0d757-93cb-768a-9c51-2a9a1df412d9 --outcome superseded 2>&1
```
```
Exit code 1
error: --outcome must be one of returned|failed|cancelled
```

## call 78
```
tallyback verdict --claim clm_01a0d75c-03fb-773f-9b5a-07371b08b5ee 2>&1
```
```
Exit code 1
error: at least one --criterion <ref>=<assessment> is required; <ref> may be a cri_<UUIDv7> id or the criterion's declared code
```

## call 79
```
tallyback verdict --claim clm_01a0d75c-03fb-773f-9b5a-07371b08b5ee --criterion max_items=met 2>&1
```
```
Exit code 1
error: --criterion assessment for cri_01a0d75b-4889-7502-a3bf-e9b74afabc98 must be one of supported|partially_supported|unsupported|contradicted; got "met"
```

## call 80
```
tallyback verdict --claim clm_01a0d75c-03fb-773f-9b5a-07371b08b5ee \
  --criterion max_items=supported \
  --criterion max_bytes=supported \
  --criterion oversized_alone=supported \
  --criterion no_empty_batches=supported \
  --criterion order_preserved=supported \
  --criterion regression_tests=supported \
  2>&1
```
```
Exit code 1
error: missing required --confidence
```

## call 81
```
tallyback verdict --claim clm_01a0d75c-03fb-773f-9b5a-07371b08b5ee \
  --criterion max_items=supported \
  --criterion max_bytes=supported \
  --criterion oversized_alone=supported \
  --criterion no_empty_batches=supported \
  --criterion order_preserved=supported \
  --criterion regression_tests=supported \
  --confidence high \
  2>&1
```
```
Exit code 1
error: missing required --rationale
```

## call 84
```
tallyback settle --task-id tsk_01a0d757-93cb-768a-9c51-2a9a1df412d9 2>&1
```
```
Exit code 1
error: missing required --decision
```

## call 85
```
tallyback settle --task-id tsk_01a0d757-93cb-768a-9c51-2a9a1df412d9 --decision land 2>&1
```
```
Exit code 1
error: missing required --attempt-id
```

## call 86
```
tallyback settle --task-id tsk_01a0d757-93cb-768a-9c51-2a9a1df412d9 --decision land --attempt-id att_01a0d75b-edea-7042-81a9-fd17ba627cdf 2>&1
```
```
Exit code 1
error: missing required --rationale
```

## call 87
```
tallyback settle --task-id tsk_01a0d757-93cb-768a-9c51-2a9a1df412d9 --decision land --attempt-id att_01a0d75b-edea-7042-81a9-fd17ba627cdf --rationale "Verdict ver_01a0d75c-bbb9-707e-84bc-87786bff27ee (high confidence) found all 6 declared acceptance criteria supported: batch max_items/max_bytes limits respected, oversized items emitted alone rather than dropped, no empty batches, order preserved, and regression tests added with full suite passing (10/10 via python -m pytest -v)." 2>&1
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
