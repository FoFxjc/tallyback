# Failed or rejected Tallyback invocations

## call 7
```
tallyback view
```
```
Exit code 1
{
  "ok": false,
  "code": "mutation.ledger_not_initialized",
  "message": "No Tallyback ledger exists at /tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/bench/w/zn58AAo6/repo/.tallyback.",
  "next_action": {
    "command": "tallyback init",
    "reason": "Initialize Tallyback before viewing or recording tracked work."
  }
}
mutation.ledger_not_initialized: No Tallyback ledger exists at /tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/bench/w/zn58AAo6/repo/.tallyback.
```

## call 14
```
tallyback declare --task-id tsk_01a0d74d-70f7-730e-94b6-e26636a609b5 --description "Fix bug where expired cache entries keep getting recomputed instead of staying cached after refresh" --decision-required false
```
```
Exit code 1
error: missing required --objective
```

## call 17
```
tallyback dispatch --task-id tsk_01a0d74d-70f7-730e-94b6-e26636a609b5
```
```
Exit code 1
error: missing required --declaration-id
```

## call 18
```
tallyback dispatch --task-id tsk_01a0d74d-70f7-730e-94b6-e26636a609b5 --declaration-id dcl_01a0d74d-8d50-73ad-a6ef-bfd9832fbbb8
```
```
Exit code 1
error: missing required --repository-id
```

## call 19
```
tallyback dispatch --task-id tsk_01a0d74d-70f7-730e-94b6-e26636a609b5 --declaration-id dcl_01a0d74d-8d50-73ad-a6ef-bfd9832fbbb8 --repository-id repo_01a0d74d-51aa-7345-acd4-67ab28123d08
```
```
Exit code 1
error: missing required --workspace-id
```

## call 29
```
tallyback view 2>&1 | jq '.tasks[0] | {title, next_action, status}'
```
```
Exit code 5
jq: parse error: Invalid numeric literal at line 38, column 5
{
  "title": "Fix expired cache entries bug",
  "next_action": "dispatch",
  "status": {
    "blocked": false,
    "verified": false,
    "settled": false,
    "dispatched": false,
    "ready_to_land": false,
    "stale": false
  }
}
```

## call 33
```
tallyback claim --attempt-id att_01a0d74e-4245-7619-a555-bc68dca4f6ab --declaration-id dcl_01a0d74d-8d50-73ad-a6ef-bfd9832fbbb8 --criteria "expired entries are recomputed once and stay cached" 2>&1
```
```
Exit code 1
error: missing required --task-id
```

## call 34
```
tallyback claim --task-id tsk_01a0d74d-70f7-730e-94b6-e26636a609b5 --attempt-id att_01a0d74e-4245-7619-a555-bc68dca4f6ab --declaration-id dcl_01a0d74d-8d50-73ad-a6ef-bfd9832fbbb8 --criteria "expired entries are recomputed once and stay cached" 2>&1
```
```
Exit code 1
error: missing required --statement
```

## call 35
```
tallyback claim --task-id tsk_01a0d74d-70f7-730e-94b6-e26636a609b5 --attempt-id att_01a0d74e-4245-7619-a555-bc68dca4f6ab --statement "Added regression test and fixed bug where expired cache entries were not staying cached"
```
```
Exit code 1
error: missing required --declaration-id
```

## call 37
```
git diff tinycache/cache.py > /tmp/cache_fix.patch && tallyback evidence --attempt-id att_01a0d74e-4245-7619-a555-bc68dca4f6ab --claim-id clm_01a0d74e-6bc3-747e-950a-fa5071a5b6d3 --description "Fixed cache.py by updating entry.stored_at timestamp on expiry refresh" --file /tmp/cache_fix.patch
```
```
Exit code 1
error: missing required --kind
```

## call 38
```
tallyback evidence --attempt-id att_01a0d74e-4245-7619-a555-bc68dca4f6ab --claim-id clm_01a0d74e-6bc3-747e-950a-fa5071a5b6d3 --kind file --description "Diff of cache.py fix" --file /tmp/cache_fix.patch
```
```
Exit code 1
error: missing required --payload
```

## call 39
```
tallyback evidence --attempt-id att_01a0d74e-4245-7619-a555-bc68dca4f6ab --claim-id clm_01a0d74e-6bc3-747e-950a-fa5071a5b6d3 --kind patch --description "cache.py: update entry.stored_at on TTL refresh" --payload "$(git diff tinycache/cache.py)"
```
```
Exit code 1
error: --payload must be valid JSON
```

## call 40
```
tallyback evidence --attempt-id att_01a0d74e-4245-7619-a555-bc68dca4f6ab --claim-id clm_01a0d74e-6bc3-747e-950a-fa5071a5b6d3 --kind patch --description "cache.py: update entry.stored_at on TTL refresh" --payload "$(git diff tinycache/cache.py | jq -Rs .)"
```
```
Exit code 1
{
  "ok": false,
  "code": "schema.unknown_evidence_kind",
  "message": "unknown evidence kind \"patch\""
}
schema.unknown_evidence_kind: unknown evidence kind "patch"
```

## call 42
```
tallyback begin-check --attempt-id att_01a0d74e-4245-7619-a555-bc68dca4f6ab --claim-id clm_01a0d74e-6bc3-747e-950a-fa5071a5b6d3 --description "Run full test suite"
```
```
Exit code 1
error: missing required --checker-id
```

## call 43
```
tallyback begin-check --attempt-id att_01a0d74e-4245-7619-a555-bc68dca4f6ab --claim-id clm_01a0d74e-6bc3-747e-950a-fa5071a5b6d3 --description "Run full test suite" --checker-id "pytest"
```
```
Exit code 1
error: missing required --checker-version
```

## call 46
```
tallyback record-check --check-invocation-id chk_01a0d74e-c05e-73fc-baf9-c1caba1297b7 --result pass --message "All 11 tests pass"
```
```
Exit code 1
error: missing required --outcome
```

## call 47
```
tallyback record-check --check-invocation-id chk_01a0d74e-c05e-73fc-baf9-c1caba1297b7 --outcome pass --message "All 11 tests pass: test_first_call_computes, test_hit_within_ttl, test_distinct_arguments_are_cached_separately, test_kwargs_are_part_of_the_key, test_expired_entry_is_recomputed, test_cache_info_counts_hits_and_misses, test_cache_clear_empties_the_cache, test_wraps_preserves_metadata, test_expired_entry_stays_cached (regression test), test_rejects_non_positive_ttl[0], test_rejects_non_positive_ttl[-1]"
```
```
Exit code 1
error: --outcome must be one of verdict_emitted|verdict_withheld|check_failed
```

## call 48
```
tallyback record-check --check-invocation-id chk_01a0d74e-c05e-73fc-baf9-c1caba1297b7 --outcome verdict_emitted --message "All 11 tests pass" --verdict accepted
```
```
Exit code 1
error: --verdict must be valid JSON
```

## call 49
```
tallyback record-check --check-invocation-id chk_01a0d74e-c05e-73fc-baf9-c1caba1297b7 --outcome verdict_emitted --message "All 11 tests pass" --verdict '{"pass": true}'
```
```
Exit code 1
error: missing required --invocation-id
```

## call 50
```
tallyback record-check --invocation-id chk_01a0d74e-c05e-73fc-baf9-c1caba1297b7 --outcome verdict_emitted --message "All 11 tests pass" --verdict '{"pass": true}'
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

## call 51
```
tallyback end --attempt-id att_01a0d74e-4245-7619-a555-bc68dca4f6ab --conclusion success
```
```
Exit code 1
error: missing required --outcome
```

## call 52
```
tallyback end --attempt-id att_01a0d74e-4245-7619-a555-bc68dca4f6ab --outcome success
```
```
Exit code 1
error: --outcome must be one of returned|failed|cancelled
```

## call 55
```
tallyback settle --task-id tsk_01a0d74d-70f7-730e-94b6-e26636a609b5 --decision land --rationale "Regression test added, bug fixed (added entry.stored_at = now on refresh), all 11 tests pass"
```
```
Exit code 1
error: missing required --attempt-id
```

## call 56
```
tallyback settle --task-id tsk_01a0d74d-70f7-730e-94b6-e26636a609b5 --attempt-id att_01a0d74e-4245-7619-a555-bc68dca4f6ab --decision land --rationale "Regression test added, bug fixed (added entry.stored_at = now on refresh), all 11 tests pass"
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

## call 57
```
tallyback settle --task-id tsk_01a0d74d-70f7-730e-94b6-e26636a609b5 --attempt-id att_01a0d74e-4245-7619-a555-bc68dca4f6ab --decision land --basis-attempt att_01a0d74e-4245-7619-a555-bc68dca4f6ab --rationale "Regression test added, bug fixed (added entry.stored_at = now on refresh), all 11 tests pass"
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

## call 60
```
tallyback settle --task-id tsk_01a0d74d-70f7-730e-94b6-e26636a609b5 --attempt-id att_01a0d74e-4245-7619-a555-bc68dca4f6ab --decision land --basis-attempt-end ate_01a0d74f-0acb-7078-82db-895216ab4e6f --rationale "Regression test added, bug fixed (added entry.stored_at = now on refresh), all 11 tests pass. Committed to main."
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

## call 61
```
tallyback settle --task-id tsk_01a0d74d-70f7-730e-94b6-e26636a609b5 --attempt-id att_01a0d74e-4245-7619-a555-bc68dca4f6ab --decision land --basis-verification-exception "Manual verification: all 11 tests pass" --rationale "Regression test added, bug fixed (added entry.stored_at = now on refresh), all 11 tests pass. Committed to main."
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
