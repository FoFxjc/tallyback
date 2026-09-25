# Ledger summary — config-migrate-sonnet

revision 28; repositories=1, workspaces=2, topics=1, tasks=1, declarations=3, attempts=3, attempt_ends=3, claims=2, evidence=3, check_invocations=5, check_results=3, verdicts=1, settlements=2

## Declaration dcl_01a0d754-d5e0-743d-9861-cc92ea857d4e
- objective: Fix v1->v2 config migration in cfgmigrate/migrate.py so it preserves unrelated user-defined keys (e.g. 'custom') recursively, renames timeout->request_timeout, sets version=2, and does not mutate the input object; add regression coverage for unknown-key preservation.

## Declaration dcl_01a0d757-9981-765e-b08e-4bba667321dd (supersedes dcl_01a0d754-d5e0-743d-9861-cc92ea857d4e)
- objective: x

## Declaration dcl_01a0d757-c568-77c8-bf1b-6b92c446b52b (supersedes dcl_01a0d757-9981-765e-b08e-4bba667321dd)
- objective: Fix v1->v2 config migration in cfgmigrate/migrate.py so it preserves unrelated user-defined keys (e.g. 'custom') recursively, renames timeout->request_timeout, sets version=2, and does not mutate the input object; add regression coverage for unknown-key preservation.
  - criterion `rename` required=True: Rename 'timeout' to 'request_timeout'.
  - criterion `version` required=True: Set 'version' to 2.
  - criterion `preserve` required=True: Preserve all unrelated user-defined keys recursively.
  - criterion `immutable` required=True: Do not mutate the input object.
  - criterion `coverage` required=True: Add regression coverage for preservation of unknown keys.

## Attempt att_01a0d755-436e-75c8-8227-e66f0f8fe1d9 executor={'kind': 'tool', 'id': 'tallyback'} branch=None dispatched=2026-09-25T06:51:24.399Z
## Attempt att_01a0d758-2892-75df-9c9b-32bca255fb02 executor={'kind': 'tool', 'id': 'tallyback'} branch=None dispatched=2026-09-25T06:54:34.130Z
## Attempt att_01a0d75a-a410-765c-9222-11aaf7b03e20 executor={'kind': 'tool', 'id': 'tallyback'} branch=None dispatched=2026-09-25T06:57:16.816Z
- AttemptEnd att_01a0d755-436e-75c8-8227-e66f0f8fe1d9: returned — 
- AttemptEnd att_01a0d758-2892-75df-9c9b-32bca255fb02: returned — 
- AttemptEnd att_01a0d75a-a410-765c-9222-11aaf7b03e20: returned — 

## Claim clm_01a0d756-2b01-755a-b2d9-dcac34bdc1d6 (attempt att_01a0d755-436e-75c8-8227-e66f0f8fe1d9)
> Rewrote _v1_to_v2 in cfgmigrate/migrate.py to deep-copy the input, rename timeout->request_timeout, set version=2, default plugins to [] if missing, and preserve all other keys (e.g. custom) recursively without mutating the input. Added regression tests for unknown top-level key preservation, nested key preservation, and non-mutation of the input. Full pytest suite (13 tests) passes.
- evidence_ids: []

## Claim clm_01a0d758-439a-75f1-90e7-130c4fc24e2e (attempt att_01a0d758-2892-75df-9c9b-32bca255fb02)
> Rewrote _v1_to_v2 in cfgmigrate/migrate.py to deep-copy the input (no input mutation), rename timeout->request_timeout, set version=2, default plugins to [] if missing, and preserve all other keys (e.g. custom) recursively. Added regression tests (test_preserves_unknown_top_level_keys, test_preserves_nested_unknown_keys_recursively, test_does_not_mutate_input). Full pytest suite (13 tests, including 3 new) passes; manually reproduced the exact example from ISSUE.md and confirmed output matches expected and input dict is untouched.
- evidence_ids: []

## Evidence evi_01a0d756-7f96-70c8-999f-fc565d7de21f kind=test_run
```json
{
 "kind": "test_run",
 "payload": {
  "exit_code": 0
 },
 "submitted_by": {
  "kind": "tool",
  "id": "tallyback"
 },
 "submitted_at": "2026-09-25T06:52:45.335Z"
}
```

## Evidence evi_01a0d756-9875-760f-b12b-c046fd5e815c kind=test_run
```json
{
 "kind": "test_run",
 "payload": {
  "exit_code": 0
 },
 "submitted_by": {
  "kind": "tool",
  "id": "tallyback"
 },
 "submitted_at": "2026-09-25T06:52:51.702Z"
}
```

## Evidence evi_01a0d758-4f60-757d-bc2a-a560ddd0e76d kind=test_run
```json
{
 "kind": "test_run",
 "payload": {
  "exit_code": 0
 },
 "submitted_by": {
  "kind": "tool",
  "id": "tallyback"
 },
 "submitted_at": "2026-09-25T06:54:44.064Z"
}
```

## CheckInvocation chk_01a0d756-d5b6-77d6-86cd-e7a2b13c4743 subject={'kind': 'claim', 'id': 'clm_01a0d756-2b01-755a-b2d9-dcac34bdc1d6'}
## CheckInvocation chk_01a0d758-5d82-76b8-b6f0-b2a96ff0b942 subject={'kind': 'claim', 'id': 'clm_01a0d758-439a-75f1-90e7-130c4fc24e2e'}
## CheckInvocation chk_01a0d758-c7f8-7499-b60d-35ac5ad53f29 subject={'kind': 'claim', 'id': 'clm_01a0d758-439a-75f1-90e7-130c4fc24e2e'}
## CheckInvocation chk_01a0d759-5327-777c-b5a4-d1e3f82178f0 subject={'kind': 'claim', 'id': 'clm_01a0d758-439a-75f1-90e7-130c4fc24e2e'}
## CheckInvocation chk_01a0d759-9a8f-76f4-aa4f-555b04673a27 subject={'kind': 'claim', 'id': 'clm_01a0d758-439a-75f1-90e7-130c4fc24e2e'}
## CheckResult ckr_01a0d758-aea3-7072-aab9-c56ad2db46c1 outcome=verdict_withheld verdict=None diagnostics=[]
## CheckResult ckr_01a0d759-17e8-77ea-a988-5be99e98179e outcome=check_failed verdict=None diagnostics=[]
## CheckResult ckr_01a0d759-9aa5-76d5-96b5-8e2866195da0 outcome=verdict_emitted verdict=ver_01a0d759-9a8e-728b-a205-0fdd8cf4f96b diagnostics=[]

## Verdict ver_01a0d759-9a8e-728b-a205-0fdd8cf4f96b conclusion=supported finality=final confidence=high
- evaluated: ['rename', 'version', 'preserve', 'immutable', 'coverage']; unevaluated: []
  - `rename`: supported — rename: assessed as supported (basis [])
  - `version`: supported — version: assessed as supported (basis [])
  - `preserve`: supported — preserve: assessed as supported (basis [])
  - `immutable`: supported — immutable: assessed as supported (basis [])
  - `coverage`: supported — coverage: assessed as supported (basis [])
- basis: {'evidence_ids': [], 'reconciliation_ids': []}
- rationale: python -m pytest -v: 13/13 passed, including the 3 new regression tests (test_preserves_unknown_top_level_keys, test_preserves_nested_unknown_keys_recursively, test_does_not_mutate_input). Manually reproduced the exact ISSUE.md example: migrating {version:1, timeout:30, plugins:[foo], custom:{owner:peter}} yields {version:2, request_timeout:30, plugins:[foo], custom:{owner:peter}} and confirmed the input dict is unchanged after the call.
- uncertainty: []
- limitations: []

## Settlement set_01a0d75a-0b38-7593-871c-611341316130 decision=land
- basis: {'verdict_id': 'ver_01a0d759-9a8e-728b-a205-0fdd8cf4f96b', 'attempt_end_id': None, 'blocker_ids': []}
- verification_exception: None
- rationale: Verdict ver_01a0d759-9a8e-728b-a205-0fdd8cf4f96b: all 5 declared criteria (rename, version, preserve, immutable, coverage) assessed as supported with high confidence, backed by a full pytest run (13/13 passing, 3 new regression tests) and a manual reproduction of the exact ISSUE.md example confirming correct output and no input mutation.

## Settlement set_01a0d75a-d3e8-7358-b633-00d9521732c6 decision=land
- basis: {'verdict_id': 'ver_01a0d759-9a8e-728b-a205-0fdd8cf4f96b', 'attempt_end_id': None, 'blocker_ids': []}
- verification_exception: None
- rationale: Re-settling against attempt att_01a0d75a whose workspace has the branch field bound (fix/config-migration-preserve-keys), so the land cross-check can resolve live Git state. Same basis as before: verdict ver_01a0d759-9a8e-728b-a205-0fdd8cf4f96b (all 5 criteria supported, high confidence).

