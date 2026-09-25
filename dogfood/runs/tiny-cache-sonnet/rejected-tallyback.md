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
  "message": "No Tallyback ledger exists at /tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/bench/w/Vh0Y7e6t/repo/.tallyback.",
  "next_action": {
    "command": "tallyback init",
    "reason": "Initialize Tallyback before viewing or recording tracked work."
  }
}
mutation.ledger_not_initialized: No Tallyback ledger exists at /tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/bench/w/Vh0Y7e6t/repo/.tallyback.
```

## call 13
```
tallyback declare --help 2>&1
```
```
Exit code 1
error: missing required --task-id
```

## call 14
```
tallyback declare --task-id tsk_01a0d74d-645d-7283-8607-716318f220b7 --help 2>&1; echo ---; tallyback declare --task-id tsk_01a0d74d-645d-7283-8607-716318f220b7 2>&1
```
```
Exit code 1
error: missing required --objective
---
error: missing required --objective
```

## call 17
```
tallyback dispatch --task-id tsk_01a0d74d-645d-7283-8607-716318f220b7 2>&1
```
```
Exit code 1
error: missing required --declaration-id
```

## call 18
```
tallyback dispatch --task-id tsk_01a0d74d-645d-7283-8607-716318f220b7 --declaration-id dcl_01a0d74d-9466-7471-bf02-9043fb2a027e 2>&1
```
```
Exit code 1
error: missing required --repository-id
```

## call 19
```
tallyback dispatch --task-id tsk_01a0d74d-645d-7283-8607-716318f220b7 --declaration-id dcl_01a0d74d-9466-7471-bf02-9043fb2a027e --repository-id repo_01a0d74d-241e-708b-816e-208a8e37f8d9 2>&1
```
```
Exit code 1
error: missing required --workspace-id
```

## call 21
```
tallyback workspace 2>&1
```
```
Exit code 1
error: missing required --repository-id
```

## call 30
```
tallyback claim --attempt-id att_01a0d74d-f70a-711d-a3fa-06fcd9709642 2>&1
```
```
Exit code 1
error: missing required --task-id
```

## call 31
```
tallyback claim --attempt-id att_01a0d74d-f70a-711d-a3fa-06fcd9709642 --task-id tsk_01a0d74d-645d-7283-8607-716318f220b7 2>&1
```
```
Exit code 1
error: missing required --declaration-id
```

## call 32
```
tallyback claim --attempt-id att_01a0d74d-f70a-711d-a3fa-06fcd9709642 --task-id tsk_01a0d74d-645d-7283-8607-716318f220b7 --declaration-id dcl_01a0d74d-9466-7471-bf02-9043fb2a027e 2>&1
```
```
Exit code 1
error: missing required --statement
```

## call 35
```
tallyback evidence --task-id tsk_01a0d74d-645d-7283-8607-716318f220b7 --attempt-id att_01a0d74d-f70a-711d-a3fa-06fcd9709642 --claim-id clm_01a0d74e-80a6-721c-ba54-7382ca40bd07 --kind test_run --path /tmp/claude-0/-tmp-claude-0--home-user-tallyback-01b763c0-69a7-5ad2-94c6-b173155321d2-scratchpad-bench-w-Vh0Y7e6t-repo/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/pytest_output.txt --summary "pytest tests/ -v : 11 passed" 2>&1
```
```
Exit code 1
error: missing required --payload
```

## call 36
```
tallyback evidence --task-id tsk_01a0d74d-645d-7283-8607-716318f220b7 --attempt-id att_01a0d74d-f70a-711d-a3fa-06fcd9709642 --claim-id clm_01a0d74e-80a6-721c-ba54-7382ca40bd07 --kind test_run --payload "pytest tests/ -v => 11 passed, 0 failed. Includes new regression test test_refreshed_entry_stays_cached_until_new_ttl_expires which fails on pre-fix code (verified via git stash) and passes post-fix." 2>&1
```
```
Exit code 1
error: --payload must be valid JSON
```

## call 37
```
tallyback evidence --task-id tsk_01a0d74d-645d-7283-8607-716318f220b7 --attempt-id att_01a0d74d-f70a-711d-a3fa-06fcd9709642 --claim-id clm_01a0d74e-80a6-721c-ba54-7382ca40bd07 --kind test_run --payload '{"command":"python -m pytest tests/ -v","result":"11 passed, 0 failed","note":"new regression test test_refreshed_entry_stays_cached_until_new_ttl_expires fails on pre-fix code (verified via git stash) and passes post-fix"}' 2>&1
```
```
Exit code 1
{
  "ok": false,
  "code": "schema.unknown_property",
  "message": "/records/0/payload must have required property 'exit_code'"
}
schema.unknown_property: /records/0/payload must have required property 'exit_code'
```

## call 38
```
tallyback evidence --task-id tsk_01a0d74d-645d-7283-8607-716318f220b7 --attempt-id att_01a0d74d-f70a-711d-a3fa-06fcd9709642 --claim-id clm_01a0d74e-80a6-721c-ba54-7382ca40bd07 --kind test_run --payload '{"command":"python -m pytest tests/ -v","exit_code":0,"result":"11 passed, 0 failed","note":"new regression test test_refreshed_entry_stays_cached_until_new_ttl_expires fails on pre-fix code (verified via git stash) and passes post-fix"}' 2>&1
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

## call 43
```
tallyback begin-check --task-id tsk_01a0d74d-645d-7283-8607-716318f220b7 --declaration-id dcl_01a0d74d-9466-7471-bf02-9043fb2a027e --claim-id clm_01a0d74e-80a6-721c-ba54-7382ca40bd07 2>&1
```
```
Exit code 1
error: missing required --checker-id
```

## call 44
```
tallyback begin-check --task-id tsk_01a0d74d-645d-7283-8607-716318f220b7 --declaration-id dcl_01a0d74d-9466-7471-bf02-9043fb2a027e --claim-id clm_01a0d74e-80a6-721c-ba54-7382ca40bd07 --checker-id pytest 2>&1
```
```
Exit code 1
error: missing required --checker-version
```

## call 48
```
tallyback record-check --check-invocation-id chk_01a0d74f-56c7-73ed-80e4-d59f70e536b1 2>&1
```
```
Exit code 1
error: missing required --outcome
```

## call 49
```
tallyback record-check --check-invocation-id chk_01a0d74f-56c7-73ed-80e4-d59f70e536b1 --outcome pass 2>&1
```
```
Exit code 1
error: --outcome must be one of verdict_emitted|verdict_withheld|check_failed
```

## call 50
```
tallyback record-check --check-invocation-id chk_01a0d74f-56c7-73ed-80e4-d59f70e536b1 --outcome verdict_emitted 2>&1
```
```
Exit code 1
error: missing required --invocation-id
```

## call 51
```
tallyback record-check --invocation-id chk_01a0d74f-56c7-73ed-80e4-d59f70e536b1 --outcome verdict_emitted 2>&1
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

## call 52
```
tallyback verdict 2>&1
```
```
Exit code 1
error: missing required --claim
```

## call 53
```
tallyback verdict --claim clm_01a0d74e-80a6-721c-ba54-7382ca40bd07 2>&1
```
```
Exit code 1
error: declaration dcl_01a0d74d-9466-7471-bf02-9043fb2a027e has no criteria; nothing to assess
```

## call 57
```
tallyback declare --task-id tsk_01a0d74d-645d-7283-8607-716318f220b7 --objective "test" --totallyfakeflag foo 2>&1
```
```
Exit code 1
{
  "ok": false,
  "code": "invariant.supersession_conflict",
  "message": "lineage declaration|task:tsk_01a0d74d-645d-7283-8607-716318f220b7 has 2 concurrent unsuperseded heads (dcl_01a0d74f-f46d-725c-80ec-89761a0ddd74, dcl_01a0d750-0901-73f8-b080-e563d2070859); a revision must declare what it supersedes — Store never selects one by timestamp"
}
invariant.supersession_conflict: lineage declaration|task:tsk_01a0d74d-645d-7283-8607-716318f220b7 has 2 concurrent unsuperseded heads (dcl_01a0d74f-f46d-725c-80ec-89761a0ddd74, dcl_01a0d750-0901-73f8-b080-e563d2070859); a revision must declare what it supersedes — Store never selects one by timestamp
```

## call 58
```
tallyback declare --task-id tsk_01a0d74d-645d-7283-8607-716318f220b7 --objective "Fix ttl_cache so that after an expired entry is recomputed, the refreshed value stays cached until its new TTL elapses, without changing the public API" --supersedes dcl_01a0d74f-f46d-725c-80ec-89761a0ddd74 --supersedes dcl_01a0d750-0901-73f8-b080-e563d2070859 2>&1
```
```
Exit code 1
{
  "ok": false,
  "code": "invariant.supersession_conflict",
  "message": "lineage declaration|task:tsk_01a0d74d-645d-7283-8607-716318f220b7 has 2 concurrent unsuperseded heads (dcl_01a0d74f-f46d-725c-80ec-89761a0ddd74, dcl_01a0d750-2bc5-7099-96e8-3a20e9bbe58b); a revision must declare what it supersedes — Store never selects one by timestamp"
}
invariant.supersession_conflict: lineage declaration|task:tsk_01a0d74d-645d-7283-8607-716318f220b7 has 2 concurrent unsuperseded heads (dcl_01a0d74f-f46d-725c-80ec-89761a0ddd74, dcl_01a0d750-2bc5-7099-96e8-3a20e9bbe58b); a revision must declare what it supersedes — Store never selects one by timestamp
```

## call 60
```
tallyback declare --task-id tsk_01a0d74d-645d-7283-8607-716318f220b7 --objective "Fix ttl_cache so refreshed value stays cached until new TTL expires, without changing public API" --supersedes dcl_01a0d74f-f46d-725c-80ec-89761a0ddd74 --criterion "expired value is recomputed" 2>&1
```
```
Exit code 1
error: --criterion must be "code:statement"
```

## call 63
```
tallyback claim --attempt-id att_01a0d74d-f70a-711d-a3fa-06fcd9709642 --task-id tsk_01a0d74d-645d-7283-8607-716318f220b7 --declaration-id dcl_01a0d750-ce24-721e-bb28-fd0563f7ab1f --statement "Fixed ttl_cache: on cache-entry expiry, entry.stored_at is now updated to the current clock value after recomputing entry.value, so the refreshed entry is treated as freshly stored and served as a hit for a full new ttl_seconds window. Cache-hit and initial-miss paths are untouched. Added regression test test_refreshed_entry_stays_cached_until_new_ttl_expires in tests/test_cache.py, which fails against the pre-fix code (verified via git stash) and passes with the fix. Full suite: 11/11 tests pass. No public API changes (ttl_cache signature, cache_info, cache_clear all unchanged)." 2>&1
```
```
Exit code 1
{
  "ok": false,
  "code": "invariant.reference_inconsistent",
  "message": "claim clm_01a0d751-0439-70e9-ad40-dfeb7645418b cites a declaration other than the one its attempt was dispatched under"
}
invariant.reference_inconsistent: claim clm_01a0d751-0439-70e9-ad40-dfeb7645418b cites a declaration other than the one its attempt was dispatched under
```

## call 64
```
tallyback end --attempt-id att_01a0d74d-f70a-711d-a3fa-06fcd9709642 --task-id tsk_01a0d74d-645d-7283-8607-716318f220b7 2>&1
```
```
Exit code 1
error: missing required --outcome
```

## call 65
```
tallyback end --attempt-id att_01a0d74d-f70a-711d-a3fa-06fcd9709642 --task-id tsk_01a0d74d-645d-7283-8607-716318f220b7 --outcome superseded 2>&1
```
```
Exit code 1
error: --outcome must be one of returned|failed|cancelled
```

## call 72
```
tallyback record-check --invocation-id chk_01a0d751-8f5e-711d-9386-6cb4cb1cdc12 --outcome verdict_emitted 2>&1
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

## call 73
```
tallyback record-check --invocation-id chk_01a0d751-8f5e-711d-9386-6cb4cb1cdc12 --outcome verdict_emitted --reconciliation "expired_recomputed:met" 2>&1
```
```
Exit code 1
error: --reconciliation must be valid JSON
```

## call 74
```
tallyback record-check --invocation-id chk_01a0d751-8f5e-711d-9386-6cb4cb1cdc12 --outcome verdict_emitted --reconciliation '{"criterion_code":"expired_recomputed","status":"met"}' 2>&1
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

## call 75
```
tallyback record-check --invocation-id chk_01a0d751-8f5e-711d-9386-6cb4cb1cdc12 --outcome verdict_emitted --reconciliation '{"criterion_id":"cri_01a0d750-ce25-709f-9ceb-445fbcd2cdfe","status":"met"}' 2>&1
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

## call 76
```
tallyback record-check --invocation-id chk_01a0d751-8f5e-711d-9386-6cb4cb1cdc12 --outcome verdict_emitted \
  --reconciliation '{"criterion_id":"cri_01a0d750-ce25-709f-9ceb-445fbcd2cdfe","status":"met"}' \
  --reconciliation '{"criterion_id":"cri_01a0d750-ce25-709f-9ceb-491d7b5d337d","status":"met"}' \
  --reconciliation '{"criterion_id":"cri_01a0d750-ce25-709f-9ceb-4f5ab5493ffc","status":"met"}' \
  --reconciliation '{"criterion_id":"cri_01a0d750-ce25-709f-9ceb-50af2d5d21c1","status":"met"}' \
  --reconciliation '{"criterion_id":"cri_01a0d750-ce25-709f-9ceb-544d88554607","status":"met"}' \
  2>&1
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

## call 77
```
tallyback record-check --invocation-id chk_01a0d751-8f5e-711d-9386-6cb4cb1cdc12 --outcome verdict_emitted --reconciliation '{"criterion_id":"cri_01a0d750-ce25-709f-9ceb-445fbcd2cdfe","result":"met"}' 2>&1
echo "---try2---"
tallyback record-check --invocation-id chk_01a0d751-8f5e-711d-9386-6cb4cb1cdc12 --outcome verdict_emitted --reconciliation '{"criterion_id":"cri_01a0d750-ce25-709f-9ceb-445fbcd2cdfe","satisfied":true}' 2>&1
```
```
Exit code 1
{
  "ok": false,
  "code": "schema.undefined_value",
  "message": "recording the check result failed after 5 retries"
}
schema.undefined_value: recording the check result failed after 5 retries
---try2---
{
  "ok": false,
  "code": "schema.undefined_value",
  "message": "recording the check result failed after 5 retries"
}
schema.undefined_value: recording the check result failed after 5 retries
```

## call 78
```
tallyback record-check --invocation-id chk_01a0d751-8f5e-711d-9386-6cb4cb1cdc12 --outcome verdict_emitted --verdict pass 2>&1
echo "---try2---"
tallyback record-check --invocation-id chk_01a0d751-8f5e-711d-9386-6cb4cb1cdc12 --outcome verdict_emitted --decision pass 2>&1
```
```
Exit code 1
error: --verdict must be valid JSON
---try2---
{
  "ok": false,
  "code": "invariant.check_result_outcome_mismatch",
  "message": "recording the check result failed after 5 retries"
}
invariant.check_result_outcome_mismatch: recording the check result failed after 5 retries
```

## call 79
```
tallyback record-check --invocation-id chk_01a0d751-8f5e-711d-9386-6cb4cb1cdc12 --outcome verdict_emitted --verdict '{"decision":"pass"}' 2>&1
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

## call 97
```
tallyback view 2>&1 | python3 -c "import json,sys; d=json.load(sys.stdin); t=d['tasks'][0]; print(json.dumps({'status':t['status'],'next_action':t['next_action']}, indent=2))"
```
```
Exit code 1
Traceback (most recent call last):
  File "<string>", line 1, in <module>
  File "/usr/lib/python3.11/json/__init__.py", line 293, in load
    return loads(fp.read(),
           ^^^^^^^^^^^^^^^^
  File "/usr/lib/python3.11/json/__init__.py", line 346, in loads
    return _default_decoder.decode(s)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/usr/lib/python3.11/json/decoder.py", line 340, in decode
    raise JSONDecodeError("Extra data", s, end)
json.decoder.JSONDecodeError: Extra data: line 123 column 1 (char 5067)
```

## call 99
```
tallyback settle --task-id tsk_01a0d74d-645d-7283-8607-716318f220b7 2>&1
```
```
Exit code 1
error: missing required --decision
```

## call 100
```
tallyback settle --task-id tsk_01a0d74d-645d-7283-8607-716318f220b7 --decision accept 2>&1
```
```
Exit code 1
error: missing required --attempt-id
```

## call 101
```
tallyback settle --task-id tsk_01a0d74d-645d-7283-8607-716318f220b7 --decision accept --attempt-id att_01a0d751-4b17-70b0-9d9a-33540be39b38 2>&1
```
```
Exit code 1
error: missing required --rationale
```

## call 102
```
tallyback settle --task-id tsk_01a0d74d-645d-7283-8607-716318f220b7 --decision accept --attempt-id att_01a0d751-4b17-70b0-9d9a-33540be39b38 --rationale "All 5 acceptance criteria verified: expired entries are recomputed, the refreshed entry's stored_at is now updated so it stays cached for a full new TTL window, existing hit/miss behavior is unchanged, a regression test was added (confirmed to fail pre-fix and pass post-fix), and the public API is untouched. Full suite: 11/11 tests pass." 2>&1
```
```
Exit code 1
{
  "ok": false,
  "code": "invariant.settlement_basis_matrix",
  "message": "accept requires exactly one of basis.verdict_id or verification_exception"
}
invariant.settlement_basis_matrix: accept requires exactly one of basis.verdict_id or verification_exception
```
