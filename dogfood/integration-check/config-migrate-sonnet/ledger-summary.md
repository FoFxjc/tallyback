# Ledger summary — config-migrate-sonnet

revision 11; repositories=1, workspaces=1, topics=1, tasks=1, declarations=1, attempts=1, claims=1, evidence=2, check_invocations=1, check_results=1, verdicts=1, settlements=1

## Declaration dcl_01a0d7a8-41e1-71ba-8c87-c176ccbbfa46
- objective: Fix cfgmigrate v1->v2 migration so it preserves unrelated user-defined keys instead of dropping them
  - criterion `rename` required=True: timeout is renamed to request_timeout
  - criterion `version` required=True: version is set to 2
  - criterion `preserve` required=True: all unrelated user-defined keys are preserved recursively
  - criterion `immutable` required=True: the input config object is not mutated
  - criterion `regression` required=True: regression test coverage exists for preservation of unknown keys

## Attempt att_01a0d7a8-822e-717a-87fe-459d61eae511 executor={'kind': 'executor', 'id': 'claude-code'} branch=None dispatched=2026-09-25T08:22:19.950Z

## Claim clm_01a0d7a8-e115-7288-a55b-ab569fdbd376 (attempt att_01a0d7a8-822e-717a-87fe-459d61eae511)
> Rewrote _v1_to_v2 in cfgmigrate/migrate.py to build the new dict from a copy of all of old's keys (excluding 'timeout'), then set version=2 and request_timeout, defaulting plugins only if absent. This preserves unrelated/nested keys like 'custom' and does not mutate the input. Added 3 regression tests; full suite (13 tests) passes.
- evidence_ids: ['evi_01a0d7a8-aa1c-754d-a86a-278119f6f78a', 'evi_01a0d7a8-b9bf-7489-aaf0-d946db14646b']

## Evidence evi_01a0d7a8-aa1c-754d-a86a-278119f6f78a kind=test_run
```json
{
 "kind": "test_run",
 "payload": {
  "command": "python3 -m pytest -v",
  "exit_code": 0
 },
 "submitted_by": {
  "kind": "executor",
  "id": "claude-code"
 },
 "note": "13 passed, 0 failed: tests/test_migrate.py, including 3 new regression tests (test_preserves_unrelated_top_level_keys, test_preserves_nested_and_unknown_keys_recursively, test_does_not_mutate_input)",
 "submitted_at": "2026-09-25T08:22:30.172Z"
}
```

## Evidence evi_01a0d7a8-b9bf-7489-aaf0-d946db14646b kind=observation
```json
{
 "kind": "observation",
 "payload": {
  "text": "Manually ran migrate() on the exact ISSUE.md example {version:1, timeout:30, plugins:[foo], custom:{owner:peter}}. Output: {version:2, request_timeout:30, plugins:[foo], custom:{owner:peter}}. Confirmed original input dict unchanged after the call (deepcopy comparison)."
 },
 "submitted_by": {
  "kind": "executor",
  "id": "claude-code"
 },
 "submitted_at": "2026-09-25T08:22:34.175Z"
}
```

## CheckInvocation chk_01a0d7a9-19fe-7798-999f-7ea18ba07907 subject={'kind': 'claim', 'id': 'clm_01a0d7a8-e115-7288-a55b-ab569fdbd376'}
## CheckResult ckr_01a0d7a9-1a0e-775a-8229-797d48200e70 outcome=verdict_emitted verdict=ver_01a0d7a9-19fc-709a-8696-0e3ef94079db diagnostics=[]

## Verdict ver_01a0d7a9-19fc-709a-8696-0e3ef94079db conclusion=supported finality=final confidence=high
- evaluated: ['rename', 'version', 'preserve', 'immutable', 'regression']; unevaluated: []
  - `rename`: supported — test_renames_timeout_to_request_timeout passes; code sets request_timeout from old['timeout'] and excludes 'timeout' key (basis ['evi_01a0d7a8-aa1c-754d-a86a-278119f6f78a'])
  - `version`: supported — test_sets_current_version passes; code hardcodes new['version']=2 (basis ['evi_01a0d7a8-aa1c-754d-a86a-278119f6f78a'])
  - `preserve`: supported — test_preserves_nested_and_unknown_keys_recursively passes; manual run of ISSUE.md example keeps 'custom':{'owner':'peter'} intact (basis ['evi_01a0d7a8-b9bf-7489-aaf0-d946db14646b'])
  - `immutable`: supported — test_does_not_mutate_input passes; manual deepcopy comparison confirms original dict unchanged after migrate() (basis ['evi_01a0d7a8-b9bf-7489-aaf0-d946db14646b'])
  - `regression`: supported — 3 new tests added: test_preserves_unrelated_top_level_keys, test_preserves_nested_and_unknown_keys_recursively, test_does_not_mutate_input (basis ['evi_01a0d7a8-aa1c-754d-a86a-278119f6f78a'])
- basis: {'evidence_ids': ['evi_01a0d7a8-aa1c-754d-a86a-278119f6f78a', 'evi_01a0d7a8-b9bf-7489-aaf0-d946db14646b'], 'reconciliation_ids': []}
- rationale: Full pytest suite (13 tests) passes including 3 new regression tests targeting exactly the acceptance criteria; manual reproduction of the ISSUE.md example confirms correct output and no input mutation. Code inspection of the fixed _v1_to_v2 confirms it copies all keys except 'timeout' rather than allowlisting a fixed set.
- uncertainty: []
- limitations: []

## Settlement set_01a0d7a9-472d-765e-a581-f245801989a5 decision=accept
- basis: {'verdict_id': 'ver_01a0d7a9-19fc-709a-8696-0e3ef94079db', 'attempt_end_id': None, 'blocker_ids': []}
- verification_exception: None
- rationale: All 5 acceptance criteria verified as supported with high confidence. Fix is in the working tree (cfgmigrate/migrate.py, tests/test_migrate.py) but not yet committed; the user has not requested a commit, so settling as accept rather than land.

