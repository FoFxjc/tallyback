# Ledger summary — config-migrate-opus

revision 16; repositories=1, workspaces=1, topics=1, tasks=1, declarations=2, attempts=1, attempt_ends=1, claims=2, evidence=2, check_invocations=2, check_results=2, verdicts=1, settlements=1

## Declaration dcl_01a0d754-843d-75bd-a568-2b31e220019d
- objective: Fix v1->v2 config migration dropping user-defined keys (ISSUE.md)

## Declaration dcl_01a0d754-a7b9-7747-95ea-dfe814552f9d (supersedes dcl_01a0d754-843d-75bd-a568-2b31e220019d)
- objective: Fix v1->v2 config migration dropping user-defined keys (ISSUE.md)
  - criterion `AC1` required=True:  rename timeout to request_timeout
  - criterion `AC2` required=True:  set version to 2
  - criterion `AC3` required=True:  preserve all unrelated user-defined keys recursively
  - criterion `AC4` required=True:  do not mutate the input object
  - criterion `AC5` required=True:  regression coverage for preservation of unknown keys

## Attempt att_01a0d754-d98e-736b-b01c-65f804f30e35 executor={'kind': 'tool', 'id': 'tallyback'} branch=None dispatched=2026-09-25T06:50:57.294Z
- AttemptEnd att_01a0d754-d98e-736b-b01c-65f804f30e35: returned — 

## Claim clm_01a0d755-4c18-76c3-aefb-25104a71b812 (attempt att_01a0d754-d98e-736b-b01c-65f804f30e35)
> Commit 06e0223 on fix/preserve-user-keys: v1->v2 deep-copies input, renames timeout, sets version 2; 4 regression tests added
- evidence_ids: []

## Claim clm_01a0d756-66f3-72fc-b039-14141f176d15 (attempt att_01a0d754-d98e-736b-b01c-65f804f30e35)
> Commit 06e0223 on fix/preserve-user-keys: v1->v2 deep-copies input, renames timeout, sets version 2, migrate() never returns input object; 4 regression tests added (fail on seed, pass after fix)
- evidence_ids: ['evi_01a0d755-9958-743f-a97c-cc9ad3b3be91', 'evi_01a0d755-acef-704f-b543-801068b633a1']

## Evidence evi_01a0d755-9958-743f-a97c-cc9ad3b3be91 kind=test_run
```json
{
 "kind": "test_run",
 "payload": {
  "command": "python3 -m pytest",
  "exit_code": 0
 },
 "submitted_by": {
  "kind": "tool",
  "id": "tallyback"
 },
 "submitted_at": "2026-09-25T06:51:46.392Z"
}
```

## Evidence evi_01a0d755-acef-704f-b543-801068b633a1 kind=test_run
```json
{
 "kind": "test_run",
 "payload": {
  "command": "git checkout cfb8d40 -- cfgmigrate && python3 -m pytest  # new tests vs seed code: 4 failed, 10 passed",
  "exit_code": 1
 },
 "submitted_by": {
  "kind": "tool",
  "id": "tallyback"
 },
 "submitted_at": "2026-09-25T06:51:51.407Z"
}
```

## CheckInvocation chk_01a0d755-de70-732d-8384-2f69f26d7e48 subject={'kind': 'claim', 'id': 'clm_01a0d755-4c18-76c3-aefb-25104a71b812'}
## CheckInvocation chk_01a0d756-7bb2-77c7-b8fa-8a6b5a8ce9ad subject={'kind': 'claim', 'id': 'clm_01a0d756-66f3-72fc-b039-14141f176d15'}
## CheckResult ckr_01a0d756-65a2-739c-bd20-9ed750029096 outcome=verdict_withheld verdict=None diagnostics=[]
## CheckResult ckr_01a0d756-7bc2-74f9-9458-4482602aeb65 outcome=verdict_emitted verdict=ver_01a0d756-7bb1-743d-b67e-c5a72d3fdc8e diagnostics=[]

## Verdict ver_01a0d756-7bb1-743d-b67e-c5a72d3fdc8e conclusion=supported finality=final confidence=high
- evaluated: ['AC1', 'AC2', 'AC3', 'AC4', 'AC5']; unevaluated: []
  - `AC1`: supported — AC1: assessed as supported (basis [])
  - `AC2`: supported — AC2: assessed as supported (basis [])
  - `AC3`: supported — AC3: assessed as supported (basis [])
  - `AC4`: supported — AC4: assessed as supported (basis [])
  - `AC5`: supported — AC5: assessed as supported (basis [])
- basis: {'evidence_ids': ['evi_01a0d755-9958-743f-a97c-cc9ad3b3be91', 'evi_01a0d755-acef-704f-b543-801068b633a1'], 'reconciliation_ids': []}
- rationale: Independently re-ran pytest at 06e0223 (14 passed); new tests fail on seed code (4 failed); direct check of ISSUE.md YAML example: request_timeout=30, no timeout, version=2, output equals expected incl. custom; input unchanged and result shares no objects with input
- uncertainty: []
- limitations: []

## Settlement set_01a0d756-b4c8-721d-8df0-3c41935f4494 decision=accept
- basis: {'verdict_id': 'ver_01a0d756-7bb1-743d-b67e-c5a72d3fdc8e', 'attempt_end_id': None, 'blocker_ids': []}
- verification_exception: None
- rationale: All 5 criteria supported at high confidence by independent re-verification; accept (not land) since merge to main was not requested

