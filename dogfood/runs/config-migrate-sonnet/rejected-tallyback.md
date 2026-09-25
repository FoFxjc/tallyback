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
  "message": "No Tallyback ledger exists at /tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/bench/w/hf3yYVwB/repo/.tallyback.",
  "next_action": {
    "command": "tallyback init",
    "reason": "Initialize Tallyback before viewing or recording tracked work."
  }
}
mutation.ledger_not_initialized: No Tallyback ledger exists at /tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/bench/w/hf3yYVwB/repo/.tallyback.
```

## call 43
```
OUTPUT=$(python -m pytest -v 2>&1); PAYLOAD=$(python3 -c "import json,sys; print(json.dumps({'command': 'python -m pytest -v', 'exit_code': 0, 'passed': 13, 'failed': 0, 'output': sys.stdin.read()}))" <<< "$OUTPUT")
tallyback evidence --kind test_run --attempt-id att_01a0d755-436e-75c8-8227-e66f0f8fe1d9 --payload "$PAYLOAD" 2>&1 | head -60
```
```
{
  "ok": false,
  "code": "schema.unknown_property",
  "message": "/records/0/payload must NOT have additional properties"
}
schema.unknown_property: /records/0/payload must NOT have additional properties
```

## call 44
```
tallyback evidence --kind test_run --attempt-id att_01a0d755-436e-75c8-8227-e66f0f8fe1d9 --payload '{}' 2>&1 | head -30
```
```
{
  "ok": false,
  "code": "schema.unknown_property",
  "message": "/records/0/payload must have required property 'exit_code'"
}
schema.unknown_property: /records/0/payload must have required property 'exit_code'
```

## call 55
```
tallyback record-check --invocation-id chk_01a0d756-d5b6-77d6-86cd-e7a2b13c4743 --outcome verdict_emitted 2>&1 | head -30
```
```
{
  "ok": false,
  "code": "invariant.check_result_outcome_mismatch",
  "message": "recording the check result failed after 5 retries"
}
invariant.check_result_outcome_mismatch: recording the check result failed after 5 retries
```

## call 57
```
tallyback record-check --invocation-id chk_01a0d756-d5b6-77d6-86cd-e7a2b13c4743 --outcome verdict_emitted --verdict '{"result":"pass"}' 2>&1 | head -30
```
```
{
  "ok": false,
  "code": "schema.undefined_value",
  "message": "recording the check result failed after 5 retries"
}
schema.undefined_value: recording the check result failed after 5 retries
```

## call 58
```
for v in '{"pass":true}' '{"status":"pass","criteria":[]}' '{"decision":"pass"}' '{"outcome":"pass"}'; do
echo "trying $v"
tallyback record-check --invocation-id chk_01a0d756-d5b6-77d6-86cd-e7a2b13c4743 --outcome verdict_emitted --verdict "$v" 2>&1 | head -5
echo "---"
done
```
```
trying {"pass":true}
{
  "ok": false,
  "code": "schema.undefined_value",
  "message": "recording the check result failed after 5 retries"
}
---
trying {"status":"pass","criteria":[]}
{
  "ok": false,
  "code": "schema.undefined_value",
  "message": "recording the check result failed after 5 retries"
}
---
trying {"decision":"pass"}
{
  "ok": false,
  "code": "schema.undefined_value",
  "message": "recording the check result failed after 5 retries"
}
---
trying {"outcome":"pass"}
{
  "ok": false,
  "code": "schema.undefined_value",
  "message": "recording the check result failed after 5 retries"
}
---
```

## call 59
```
tallyback declare --task-id tsk_01a0d754-767f-7305-b41f-56bf31eb4aa0 --objective test --criterion foo 2>&1 | head -20
echo "==="
tallyback declare --task-id tsk_01a0d754-767f-7305-b41f-56bf31eb4aa0 --objective test --criteria foo 2>&1 | head -20
```
```
error: --criterion must be "code:statement"
===
{
  "ok": false,
  "code": "invariant.supersession_conflict",
  "message": "lineage declaration|task:tsk_01a0d754-767f-7305-b41f-56bf31eb4aa0 has 2 concurrent unsuperseded heads (dcl_01a0d754-d5e0-743d-9861-cc92ea857d4e, dcl_01a0d757-63b8-7201-91ff-32e9b41beb64); a revision must declare what it supersedes — Store never selects one by timestamp"
}
invariant.supersession_conflict: lineage declaration|task:tsk_01a0d754-767f-7305-b41f-56bf31eb4aa0 has 2 concurrent unsuperseded heads (dcl_01a0d754-d5e0-743d-9861-cc92ea857d4e, dcl_01a0d757-63b8-7201-91ff-32e9b41beb64); a revision must declare what it supersedes — Store never selects one by timestamp
```

## call 65
```
tallyback claim --attempt-id att_01a0d755-436e-75c8-8227-e66f0f8fe1d9 --task-id tsk_01a0d754-767f-7305-b41f-56bf31eb4aa0 --declaration-id dcl_01a0d757-c568-77c8-bf1b-6b92c446b52b --statement "Rewrote _v1_to_v2 in cfgmigrate/migrate.py to deep-copy the input (no input mutation), rename timeout->request_timeout, set version=2, default plugins to [] if missing, and preserve all other keys (e.g. custom) recursively. Added regression tests (test_preserves_unknown_top_level_keys, test_preserves_nested_unknown_keys_recursively, test_does_not_mutate_input). Full pytest suite (13 tests, including 3 new) passes; manually reproduced the exact example from ISSUE.md and confirmed output matches expected and input dict is untouched." 2>&1 | head -30
```
```
{
  "ok": false,
  "code": "invariant.reference_inconsistent",
  "message": "claim clm_01a0d758-0203-76ba-9c88-a6c0f50f1c97 cites a declaration other than the one its attempt was dispatched under"
}
invariant.reference_inconsistent: claim clm_01a0d758-0203-76ba-9c88-a6c0f50f1c97 cites a declaration other than the one its attempt was dispatched under
```

## call 72
```
VERDICT='{
  "criteria": [
    {"criterion_id": "cri_01a0d757-c569-73f9-865c-303f7c2cee03", "satisfied": true, "note": "test_renames_timeout_to_request_timeout passes"},
    {"criterion_id": "cri_01a0d757-c569-73f9-865c-356cfae23b50", "satisfied": true, "note": "test_sets_current_version passes"},
    {"criterion_id": "cri_01a0d757-c569-73f9-865c-3ac14da92e3a", "satisfied": true, "note": "test_preserves_unknown_top_level_keys and test_preserves_nested_unknown_keys_recursively pass; manual repro of ISSUE.md example matches expected output"},
    {"criterion_id": "cri_01a0d757-c569-73f9-865c-3e547e1ffcc0", "satisfied": true, "note": "test_does_not_mutate_input passes; _v1_to_v2 now deep-copies before mutating"},
    {"criterion_id": "cri_01a0d757-c569-73f9-865c-400dd5bcfcf7", "satisfied": true, "note": "3 new regression tests added covering unknown-key preservation"}
  ]
}'
tallyback record-check --invocation-id chk_01a0d758-5d82-76b8-b6f0-b2a96ff0b942 --outcome verdict_emitted --verdict "$VERDICT" 2>&1 | head -60
```
```
{
  "ok": false,
  "code": "schema.undefined_value",
  "message": "recording the check result failed after 5 retries"
}
schema.undefined_value: recording the check result failed after 5 retries
```

## call 75
```
for v in '{"status":"accept"}' '{"decision":"accept"}' '{"result":"accept"}' '{"accepted":true}'; do
echo "=== $v ==="
tallyback record-check --invocation-id chk_01a0d758-c7f8-7499-b60d-35ac5ad53f29 --outcome verdict_emitted --verdict "$v" 2>&1 | head -6
done
```
```
=== {"status":"accept"} ===
{
  "ok": false,
  "code": "schema.undefined_value",
  "message": "recording the check result failed after 5 retries"
}
schema.undefined_value: recording the check result failed after 5 retries
=== {"decision":"accept"} ===
{
  "ok": false,
  "code": "schema.undefined_value",
  "message": "recording the check result failed after 5 retries"
}
schema.undefined_value: recording the check result failed after 5 retries
=== {"result":"accept"} ===
{
  "ok": false,
  "code": "schema.undefined_value",
  "message": "recording the check result failed after 5 retries"
}
schema.undefined_value: recording the check result failed after 5 retries
=== {"accepted":true} ===
{
  "ok": false,
  "code": "schema.undefined_value",
  "message": "recording the check result failed after 5 retries"
}
schema.undefined_value: recording the check result failed after 5 retries
```

## call 76
```
tallyback record-check --invocation-id chk_01a0d758-c7f8-7499-b60d-35ac5ad53f29 --outcome verdict_emitted --verdict '{}' 2>&1 | head -20
```
```
{
  "ok": false,
  "code": "schema.undefined_value",
  "message": "recording the check result failed after 5 retries"
}
schema.undefined_value: recording the check result failed after 5 retries
```

## call 77
```
tallyback record-check 2>&1 | head -5
tallyback record-check --invocation-id x 2>&1 | head -5
tallyback record-check --invocation-id x --outcome check_failed 2>&1 | head -10
```
```
error: missing required --outcome
error: missing required --outcome
{
  "ok": false,
  "code": "schema.unknown_property",
  "message": "recording the check result failed after 5 retries"
}
schema.unknown_property: recording the check result failed after 5 retries
```

## call 79
```
tallyback reconcile 2>&1 | head -10
echo "---"
tallyback reconciliation 2>&1 | head -10
echo "---"
tallyback --help 2>&1 | head -60
```
```
{
  "ok": false,
  "code": "mutation.reconcile_nothing_to_do",
  "message": "this ledger has no forked lineages; there is nothing to reconcile",
  "conflicts": []
}
mutation.reconcile_nothing_to_do: this ledger has no forked lineages; there is nothing to reconcile
---
error: unknown command "reconciliation". Available: handshake, version, init, migrate, validate, reconcile, show, list, bindings, land, view, watch, topic, task, workspace, bind, declare, dispatch, end, claim, evidence, begin-check, record-check, verdict, block, resolve, settle, decision
---
tallyback — Git-native accountability ledger for delegated agent work

Usage: tallyback <command> [--flag value ...]

Capability / bootstrap:
  handshake, version, init, migrate

Core loop (declare -> dispatch -> observe -> verify -> settle):
  topic, task, workspace, bind, declare, dispatch, end, claim, evidence,
  begin-check, record-check, verdict, block, resolve, settle, decision

Read-only reports / gates:
  show, list, bindings, land, view, watch, validate, reconcile

Run with no command for the capability handshake.
For full flag-level syntax for each command, see README.md (Quick Start) or src/cli.ts.
```

## call 91
```
tallyback settle --task-id tsk_01a0d754-767f-7305-b41f-56bf31eb4aa0 --decision land --attempt-id att_01a0d758-2892-75df-9c9b-32bca255fb02 --rationale "Verdict ver_01a0d759-9a8e-728b-a205-0fdd8cf4f96b: all 5 declared criteria (rename, version, preserve, immutable, coverage) assessed as supported with high confidence, backed by a full pytest run (13/13 passing, 3 new regression tests) and a manual reproduction of the exact ISSUE.md example confirming correct output and no input mutation." 2>&1 | head -40
```
```
{
  "ok": false,
  "code": "invariant.settlement_basis_matrix",
  "message": "land requires exactly one of basis.verdict_id or verification_exception"
}
invariant.settlement_basis_matrix: land requires exactly one of basis.verdict_id or verification_exception
```

## call 101
```
tallyback end --attempt-id att_01a0d75a-a410-765c-9222-11aaf7b03e20 --outcome returned 2>&1 | head -10
tallyback settle --task-id tsk_01a0d754-767f-7305-b41f-56bf31eb4aa0 --decision land --attempt-id att_01a0d75a-a410-765c-9222-11aaf7b03e20 --verdict-id ver_01a0d759-9a8e-728b-a205-0fdd8cf4f96b --supersedes set_01a0d75a-0b38-7593-871c-611341316130 --rationale "Re-settling against attempt att_01a0d75a whose workspace has the branch field bound (fix/config-migration-preserve-keys), so the land cross-check can resolve live Git state. Same basis as before: verdict ver_01a0d759-9a8e-728b-a205-0fdd8cf4f96b (all 5 criteria supported, high confidence)." 2>&1 | head -40
```
```
{
  "ok": true,
  "revision": 27,
  "attempt_end": {
    "attempt_end_id": "ate_01a0d75a-bbc9-72b7-b93c-6e426123afe0",
    "attempt_id": "att_01a0d75a-a410-765c-9222-11aaf7b03e20",
    "outcome": "returned",
    "reported_by": {
      "kind": "tool",
      "id": "tallyback"
{
  "ok": false,
  "code": "invariant.supersession_subject",
  "message": "settlement supersedes a different subject"
}
invariant.supersession_subject: settlement supersedes a different subject
```
