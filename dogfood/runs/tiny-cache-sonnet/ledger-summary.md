# Ledger summary — tiny-cache-sonnet

revision 18; repositories=1, workspaces=1, topics=1, tasks=1, declarations=4, attempts=2, attempt_ends=1, claims=2, evidence=2, reconciliations=1, check_invocations=2, check_results=1, verdicts=1, settlements=1

## Declaration dcl_01a0d74d-9466-7471-bf02-9043fb2a027e
- objective: Fix ttl_cache so that after an expired entry is recomputed, the refreshed value stays cached until its new TTL elapses, without changing the public API

## Declaration dcl_01a0d74f-e459-7040-b084-41ab0268dd8b (supersedes dcl_01a0d74d-9466-7471-bf02-9043fb2a027e)
- objective: Fix ttl_cache so that after an expired entry is recomputed, the refreshed value stays cached until its new TTL elapses, without changing the public API

## Declaration dcl_01a0d74f-f46d-725c-80ec-89761a0ddd74 (supersedes dcl_01a0d74f-e459-7040-b084-41ab0268dd8b)
- objective: Fix ttl_cache so that after an expired entry is recomputed, the refreshed value stays cached until its new TTL elapses, without changing the public API

## Declaration dcl_01a0d750-ce24-721e-bb28-fd0563f7ab1f (supersedes dcl_01a0d74f-f46d-725c-80ec-89761a0ddd74)
- objective: Fix ttl_cache so that after an expired entry is recomputed, the refreshed value stays cached until its new TTL elapses, without changing the public API
  - criterion `expired_recomputed` required=True: An expired value is recomputed
  - criterion `refresh_stays_cached` required=True: The refreshed value remains cached until its new TTL expires
  - criterion `hit_behavior_unchanged` required=True: Existing cache-hit behavior remains unchanged
  - criterion `regression_test` required=True: A regression test demonstrating the bug is added
  - criterion `api_unchanged` required=True: The public API is not changed

## Attempt att_01a0d74d-f70a-711d-a3fa-06fcd9709642 executor={'kind': 'tool', 'id': 'tallyback'} branch=None dispatched=2026-09-25T06:43:26.090Z
## Attempt att_01a0d751-4b17-70b0-9d9a-33540be39b38 executor={'kind': 'tool', 'id': 'tallyback'} branch=None dispatched=2026-09-25T06:47:04.215Z
- AttemptEnd att_01a0d74d-f70a-711d-a3fa-06fcd9709642: returned — 

## Claim clm_01a0d74e-80a6-721c-ba54-7382ca40bd07 (attempt att_01a0d74d-f70a-711d-a3fa-06fcd9709642)
> Fixed ttl_cache to update entry.stored_at on refresh after expiry so the recomputed value stays cached for a full new TTL window; added a regression test (test_refreshed_entry_stays_cached_until_new_ttl_expires) that fails on the pre-fix code and passes after the fix. Full test suite (11 tests) passes.
- evidence_ids: []

## Claim clm_01a0d751-5f98-7408-b7d3-c1a950452b56 (attempt att_01a0d751-4b17-70b0-9d9a-33540be39b38)
> Fixed ttl_cache: on cache-entry expiry, entry.stored_at is now updated to the current clock value after recomputing entry.value (tinycache/cache.py), so the refreshed entry is treated as freshly stored and served as a cache hit for a full new ttl_seconds window instead of being recomputed on almost every subsequent call. Cache-hit and initial-miss code paths are unchanged. Added regression test test_refreshed_entry_stays_cached_until_new_ttl_expires in tests/test_cache.py, which fails against the pre-fix code (verified via git stash) and passes with the fix. Full suite: 11/11 tests pass. No public API changes (ttl_cache signature, cache_info, cache_clear all unchanged).
- evidence_ids: []

## Evidence evi_01a0d74f-12e8-72a4-a3f2-d156ef06fe92 kind=test_run
```json
{
 "kind": "test_run",
 "payload": {
  "command": "python -m pytest tests/ -v",
  "exit_code": 0
 },
 "submitted_by": {
  "kind": "tool",
  "id": "tallyback"
 },
 "submitted_at": "2026-09-25T06:44:38.760Z"
}
```

## Evidence evi_01a0d751-812b-7615-b25f-5e58cde0afde kind=test_run
```json
{
 "kind": "test_run",
 "payload": {
  "command": "python -m pytest tests/ -v",
  "exit_code": 0
 },
 "submitted_by": {
  "kind": "tool",
  "id": "tallyback"
 },
 "submitted_at": "2026-09-25T06:47:18.059Z"
}
```

## Reconciliation rec_1f17c700-cc30-70f6-aa64-c21dedb8e7f4
```json
{
 "reconciliation_id": "rec_1f17c700-cc30-70f6-aa64-c21dedb8e7f4",
 "evidence_id": "evi_01a0d751-812b-7615-b25f-5e58cde0afde",
 "checked_by": {
  "kind": "tool",
  "id": "tallyback-check"
 },
 "checked_at": "2026-09-25T06:49:12.000Z",
 "method": {
  "name": "pytest",
  "version": "8.3.3"
 },
 "observed_context": {
  "repository_id": "repo_01a0d74d-241e-708b-816e-208a8e37f8d9",
  "head_oid": "3177d80d7a8ad00bbb839afcd4624b70e02d08c0"
 },
 "checks": [
  {
   "predicate": "pytest tests/ -v exits 0 with 11 passed, 0 failed, including test_refreshed_entry_stays_cached_until_new_ttl_expires and test_expired_entry_is_recomputed",
   "outcome": "confirmed"
  },
  {
   "predicate": "test_refreshed_entry_stays_cached_until_new_ttl_expires fails against pre-fix tinycache/cache.py (verified via git stash) and passes against the fixed version",
   "outcome": "confirmed"
  },
  {
   "predicate": "tinycache/cache.py public API (ttl_cache signature, cache_info, cache_clear) is unchanged; only entry.stored_at = now was added inside the expiry branch",
   "outcome": "confirmed"
  }
 ],
 "limitations": []
}
```

## CheckInvocation chk_01a0d74f-56c7-73ed-80e4-d59f70e536b1 subject={'kind': 'claim', 'id': 'clm_01a0d74e-80a6-721c-ba54-7382ca40bd07'}
## CheckInvocation chk_01a0d751-8f5e-711d-9386-6cb4cb1cdc12 subject={'kind': 'claim', 'id': 'clm_01a0d751-5f98-7408-b7d3-c1a950452b56'}
## CheckResult ckr_01a0d753-b0e7-7621-9fb2-ee34cffcc137 outcome=verdict_emitted verdict=ver_524e1920-2c14-70e3-95dc-f1eaefabfb17 diagnostics=[]

## Verdict ver_524e1920-2c14-70e3-95dc-f1eaefabfb17 conclusion=supported finality=final confidence=high
- evaluated: ['expired_recomputed', 'refresh_stays_cached', 'hit_behavior_unchanged', 'regression_test', 'api_unchanged']; unevaluated: []
  - `expired_recomputed`: supported — test_expired_entry_is_recomputed confirms an expired entry recomputes its value. (basis ['evi_01a0d751-812b-7615-b25f-5e58cde0afde', 'rec_1f17c700-cc30-70f6-aa64-c21dedb8e7f4'])
  - `refresh_stays_cached`: supported — entry.stored_at is now reset to the recompute time; test_refreshed_entry_stays_cached_until_new_ttl_expires shows the refreshed value is served as a hit until the new TTL elapses. (basis ['evi_01a0d751-812b-7615-b25f-5e58cde0afde', 'rec_1f17c700-cc30-70f6-aa64-c21dedb8e7f4'])
  - `hit_behavior_unchanged`: supported — Pre-existing hit/miss tests (test_hit_within_ttl, test_distinct_arguments_are_cached_separately, test_cache_info_counts_hits_and_misses, etc.) still pass unmodified. (basis ['evi_01a0d751-812b-7615-b25f-5e58cde0afde'])
  - `regression_test`: supported — test_refreshed_entry_stays_cached_until_new_ttl_expires added to tests/test_cache.py; confirmed to fail on pre-fix code via git stash and pass post-fix. (basis ['evi_01a0d751-812b-7615-b25f-5e58cde0afde', 'rec_1f17c700-cc30-70f6-aa64-c21dedb8e7f4'])
  - `api_unchanged`: supported — Only change is adding entry.stored_at = now inside the existing expiry branch; ttl_cache's decorator signature, cache_info, and cache_clear are untouched. (basis ['rec_1f17c700-cc30-70f6-aa64-c21dedb8e7f4'])
- basis: {'evidence_ids': ['evi_01a0d751-812b-7615-b25f-5e58cde0afde'], 'reconciliation_ids': ['rec_1f17c700-cc30-70f6-aa64-c21dedb8e7f4']}
- rationale: The bug was a missing refresh of entry.stored_at on the expiry/recompute path, so the TTL window never restarted after a refresh. Setting entry.stored_at = now alongside entry.value fixes this without touching any other code path.
- uncertainty: []
- limitations: []

## Settlement set_01a0d754-2289-7079-b91c-cdb3512540c9 decision=accept
- basis: {'verdict_id': 'ver_524e1920-2c14-70e3-95dc-f1eaefabfb17', 'attempt_end_id': None, 'blocker_ids': []}
- verification_exception: None
- rationale: All 5 acceptance criteria verified via pytest and code review; see verdict ver_524e1920-2c14-70e3-95dc-f1eaefabfb17.

