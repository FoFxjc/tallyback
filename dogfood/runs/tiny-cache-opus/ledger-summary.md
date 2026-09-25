# Ledger summary — tiny-cache-opus

revision 14; repositories=1, workspaces=1, topics=1, tasks=1, declarations=3, attempts=1, claims=1, evidence=3, check_invocations=1, check_results=1, verdicts=1, settlements=1

## Declaration dcl_01a0d74d-43c6-719a-a63a-27fd8edb8b0f
- objective: Fix ttl_cache so refreshed expired entries remain cached for a fresh TTL window

## Declaration dcl_01a0d74d-6a4a-7019-a4d0-cdb11a77558f (supersedes dcl_01a0d74d-43c6-719a-a63a-27fd8edb8b0f)
- objective: x

## Declaration dcl_01a0d74d-8ba0-73ea-9d93-0e0e4f09e40a (supersedes dcl_01a0d74d-6a4a-7019-a4d0-cdb11a77558f)
- objective: Fix ttl_cache so refreshed expired entries remain cached for a fresh TTL window (ISSUE.md). Supersedes accidental probe declaration with objective 'x'.
  - criterion `AC1` required=True: An expired value is recomputed.
  - criterion `AC2` required=True: The refreshed value remains cached until its new TTL expires.
  - criterion `AC3` required=True: Existing cache-hit behavior remains unchanged.
  - criterion `AC4` required=True: A regression test demonstrates the bug.
  - criterion `AC5` required=True: The public API is not changed.

## Attempt att_01a0d74d-f470-72bf-bd2f-f8a9e4f42685 executor={'kind': 'executor', 'id': 'claude-opus-5-5'} branch=None dispatched=2026-09-25T06:43:25.424Z

## Claim clm_01a0d74e-864c-769d-9e1f-9ee4ec8946c0 (attempt att_01a0d74d-f470-72bf-bd2f-f8a9e4f42685)
> ttl_cache now resets stored_at when recomputing an expired entry; regression test added; all tests pass; public API unchanged. Changes are uncommitted in the working tree of fix/ttl-refresh-stored-at.
- evidence_ids: ['evi_01a0d74e-73b8-7108-8e3a-24b5328686e3', 'evi_01a0d74e-751f-777d-949f-0483f3a4964b', 'evi_01a0d74e-76a4-704f-a9b4-0bc5789f81a6']

## Evidence evi_01a0d74e-73b8-7108-8e3a-24b5328686e3 kind=observation
```json
{
 "kind": "observation",
 "payload": {
  "text": "With tinycache/cache.py fix stashed, 'python3 -m pytest -q' -> 1 failed, 10 passed; failing: tests/test_cache.py::test_refreshed_entry_stays_cached_for_a_new_ttl (call 1s after refresh recomputed, n=3 != 2)."
 },
 "submitted_by": {
  "kind": "executor",
  "id": "claude-opus-5-5"
 },
 "note": "regression test fails without fix",
 "submitted_at": "2026-09-25T06:43:58.008Z"
}
```

## Evidence evi_01a0d74e-751f-777d-949f-0483f3a4964b kind=observation
```json
{
 "kind": "observation",
 "payload": {
  "text": "With fix applied, 'python3 -m pytest -q' -> 11 passed (10 pre-existing + 1 regression test)."
 },
 "submitted_by": {
  "kind": "executor",
  "id": "claude-opus-5-5"
 },
 "note": "full suite passes with fix",
 "submitted_at": "2026-09-25T06:43:58.367Z"
}
```

## Evidence evi_01a0d74e-76a4-704f-a9b4-0bc5789f81a6 kind=observation
```json
{
 "kind": "observation",
 "payload": {
  "text": "git diff: tinycache/cache.py +1 line ('entry.stored_at = now' in the expiry branch); tests/test_cache.py +20 lines. ttl_cache signature, CacheInfo, cache_info, cache_clear and __all__ untouched."
 },
 "submitted_by": {
  "kind": "executor",
  "id": "claude-opus-5-5"
 },
 "note": "diff scope and public API",
 "submitted_at": "2026-09-25T06:43:58.756Z"
}
```

## CheckInvocation chk_01a0d74e-beec-7464-bf8d-ece3940d91e3 subject={'kind': 'claim', 'id': 'clm_01a0d74e-864c-769d-9e1f-9ee4ec8946c0'}
## CheckResult ckr_01a0d74e-befc-71ae-8536-7a7eac00afcd outcome=verdict_emitted verdict=ver_01a0d74e-beea-7360-a934-41648b267b2b diagnostics=[]

## Verdict ver_01a0d74e-beea-7360-a934-41648b267b2b conclusion=supported finality=final confidence=high
- evaluated: ['AC1', 'AC2', 'AC3', 'AC4', 'AC5']; unevaluated: []
  - `AC1`: supported — AC1: assessed as supported (basis [])
  - `AC2`: supported — AC2: assessed as supported (basis [])
  - `AC3`: supported — AC3: assessed as supported (basis [])
  - `AC4`: supported — AC4: assessed as supported (basis [])
  - `AC5`: supported — AC5: assessed as supported (basis [])
- basis: {'evidence_ids': ['evi_01a0d74e-73b8-7108-8e3a-24b5328686e3', 'evi_01a0d74e-751f-777d-949f-0483f3a4964b', 'evi_01a0d74e-76a4-704f-a9b4-0bc5789f81a6'], 'reconciliation_ids': []}
- rationale: Coordinator re-ran checks independently: pytest 11 passed; test_expired_entry_is_recomputed (AC1) and new test_refreshed_entry_stays_cached_for_a_new_ttl (AC2, AC4) pass, the latter fails without the fix; test_hit_within_ttl/cache_info tests unchanged and pass (AC3); standalone 1rps x 120s simulation gives 4 computes (one per TTL window), hits=116; ttl_cache signature and __all__ unchanged, diff touches no API (AC5). Caveat: changes are uncommitted, so branch has not advanced.
- uncertainty: []
- limitations: []

## Settlement set_01a0d74e-ddc4-75e8-96c7-2dec309db6a4 decision=accept
- basis: {'verdict_id': 'ver_01a0d74e-beea-7360-a934-41648b267b2b', 'attempt_end_id': None, 'blocker_ids': []}
- verification_exception: None
- rationale: All five criteria supported at high confidence by independent re-verification. Accept only: fix is uncommitted on fix/ttl-refresh-stored-at; commit and land authorization left to the user.

