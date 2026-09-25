# Ledger summary — config-migrate-opus

revision 14; repositories=1, workspaces=1, topics=1, tasks=1, declarations=1, attempts=1, attempt_ends=1, claims=1, evidence=4, check_invocations=1, check_results=1, verdicts=1, settlements=1

## Declaration dcl_01a0d7a7-87d6-74a1-a7cf-228d24b0e545
- objective: Migrating a v1 config to v2 renames timeout, bumps version, and preserves all other user keys without mutating input
  - criterion `rename` required=True: timeout is renamed to request_timeout
  - criterion `version` required=True: version is set to 2
  - criterion `preserve` required=True: all unrelated user-defined keys are preserved recursively
  - criterion `no_mutation` required=True: the input object is not mutated
  - criterion `regression` required=True: regression tests cover preservation of unknown keys

## Attempt att_01a0d7a7-a123-7755-b595-1fc939c3c1f2 executor={'kind': 'executor', 'id': 'claude-code'} branch=None dispatched=2026-09-25T08:21:22.340Z
- AttemptEnd att_01a0d7a7-a123-7755-b595-1fc939c3c1f2: returned — Fix committed at 1686844 on fix/preserve-user-keys

## Claim clm_01a0d7a8-174c-72ef-9c23-4639ddddbf51 (attempt att_01a0d7a7-a123-7755-b595-1fc939c3c1f2)
> v1->v2 migration now renames timeout, sets version 2, preserves all other user keys via deep copy, never mutates input; 4 regression tests added
- evidence_ids: ['evi_01a0d7a8-01a7-7242-9ba8-3ed24f3dccc1', 'evi_01a0d7a8-0328-758a-bef3-16e525ca0435', 'evi_01a0d7a8-0497-76f4-9c9e-3e0e0387a23f', 'evi_01a0d7a8-0603-72df-8564-63bbb997a0b3']

## Evidence evi_01a0d7a8-01a7-7242-9ba8-3ed24f3dccc1 kind=git_commit
```json
{
 "kind": "git_commit",
 "payload": {
  "repository_id": "repo_01a0d7a7-6283-73bb-b8d5-0f5e3e3a13dc",
  "object_id": "1686844691800a5ff213d3acc5e2e355bd5a25e5",
  "object_format": "sha1"
 },
 "submitted_by": {
  "kind": "executor",
  "id": "claude-code"
 },
 "note": "Fix commit on fix/preserve-user-keys",
 "submitted_at": "2026-09-25T08:21:47.048Z"
}
```

## Evidence evi_01a0d7a8-0328-758a-bef3-16e525ca0435 kind=test_run
```json
{
 "kind": "test_run",
 "payload": {
  "exit_code": 0,
  "command": "python3 -m pytest -q",
  "repository_id": "repo_01a0d7a7-6283-73bb-b8d5-0f5e3e3a13dc",
  "workspace_id": "wsp_01a0d7a7-9367-741f-853a-06e2b2f0f83d"
 },
 "submitted_by": {
  "kind": "executor",
  "id": "claude-code"
 },
 "note": "14 passed at 1686844691800a5ff213d3acc5e2e355bd5a25e5 (10 existing + 4 new regression tests)",
 "submitted_at": "2026-09-25T08:21:47.432Z"
}
```

## Evidence evi_01a0d7a8-0497-76f4-9c9e-3e0e0387a23f kind=command_run
```json
{
 "kind": "command_run",
 "payload": {
  "command": "git stash push cfgmigrate/migrate.py && python3 -m pytest -q",
  "exit_code": 1,
  "repository_id": "repo_01a0d7a7-6283-73bb-b8d5-0f5e3e3a13dc",
  "workspace_id": "wsp_01a0d7a7-9367-741f-853a-06e2b2f0f83d"
 },
 "submitted_by": {
  "kind": "executor",
  "id": "claude-code"
 },
 "note": "Against the original migrate.py (533937679bcb1cbc5854dadec7acfed4a2c5b745), the new tests fail: 4 failed, 10 passed (test_issue_example_preserves_custom_section, test_preserves_unknown_keys_recursively, test_does_not_mutate_input, test_current_version_result_does_not_alias_input)",
 "submitted_at": "2026-09-25T08:21:47.800Z"
}
```

## Evidence evi_01a0d7a8-0603-72df-8564-63bbb997a0b3 kind=git_diff
```json
{
 "kind": "git_diff",
 "payload": {
  "repository_id": "repo_01a0d7a7-6283-73bb-b8d5-0f5e3e3a13dc",
  "base_object_id": "533937679bcb1cbc5854dadec7acfed4a2c5b745",
  "head_object_id": "1686844691800a5ff213d3acc5e2e355bd5a25e5"
 },
 "submitted_by": {
  "kind": "executor",
  "id": "claude-code"
 },
 "note": "Diff: _v1_to_v2 deep-copies input, pops timeout into request_timeout, sets version 2, keeps plugins default; migrate() deep-copies before migrating",
 "submitted_at": "2026-09-25T08:21:48.163Z"
}
```

## CheckInvocation chk_01a0d7a8-42cd-76d7-9dce-2f7f21f7f913 subject={'kind': 'claim', 'id': 'clm_01a0d7a8-174c-72ef-9c23-4639ddddbf51'}
## CheckResult ckr_01a0d7a8-42dd-756f-817c-f1be5c2842cd outcome=verdict_emitted verdict=ver_01a0d7a8-42cb-7405-8665-d283c9a04921 diagnostics=[]

## Verdict ver_01a0d7a8-42cb-7405-8665-d283c9a04921 conclusion=supported finality=final confidence=high
- evaluated: ['rename', 'version', 'preserve', 'no_mutation', 'regression']; unevaluated: []
  - `rename`: supported — test_renames_timeout_to_request_timeout passes; diff pops timeout into request_timeout (basis ['evi_01a0d7a8-0328-758a-bef3-16e525ca0435', 'evi_01a0d7a8-0603-72df-8564-63bbb997a0b3'])
  - `version`: supported — test_sets_current_version passes (basis ['evi_01a0d7a8-0328-758a-bef3-16e525ca0435'])
  - `preserve`: supported — issue example and nested unknown keys (incl. nested 'timeout') preserved; tests fail on original code (basis ['evi_01a0d7a8-0328-758a-bef3-16e525ca0435', 'evi_01a0d7a8-0497-76f4-9c9e-3e0e0387a23f'])
  - `no_mutation`: supported — input equals deep snapshot after migrate and after mutating the output; result shares no nested objects (basis ['evi_01a0d7a8-0328-758a-bef3-16e525ca0435', 'evi_01a0d7a8-0497-76f4-9c9e-3e0e0387a23f'])
  - `regression`: supported — 4 new tests, all 4 fail on original migrate.py and pass on fix (basis ['evi_01a0d7a8-0328-758a-bef3-16e525ca0435', 'evi_01a0d7a8-0497-76f4-9c9e-3e0e0387a23f'])
- basis: {'evidence_ids': ['evi_01a0d7a8-01a7-7242-9ba8-3ed24f3dccc1', 'evi_01a0d7a8-0328-758a-bef3-16e525ca0435', 'evi_01a0d7a8-0497-76f4-9c9e-3e0e0387a23f', 'evi_01a0d7a8-0603-72df-8564-63bbb997a0b3'], 'reconciliation_ids': []}
- rationale: Full suite 14/14 at commit 1686844; the 4 new tests fail against the unfixed code; issue example checked directly outside pytest
- uncertainty: ["Output key order differs from the issue's YAML (request_timeout is appended last); the dict is semantically equal"]
- limitations: ['Verified by the same executor that wrote the fix; no independent reviewer']

## Settlement set_01a0d7a8-63c4-744e-b0b0-abcee4b83a11 decision=accept
- basis: {'verdict_id': 'ver_01a0d7a8-42cb-7405-8665-d283c9a04921', 'attempt_end_id': None, 'blocker_ids': []}
- verification_exception: None
- rationale: All 5 criteria supported with high confidence (14/14 tests; new tests fail on unfixed code). Accepting the work; landing to main left to the user's explicit decision.

