# Failed or rejected Tallyback invocations

## call 3
```
tallyback handshake && echo "---VIEW---" && tallyback view
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
---VIEW---
{
  "ok": false,
  "code": "mutation.ledger_not_initialized",
  "message": "No Tallyback ledger exists at /tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/fit2/w/pMR1MuD3/repo/.tallyback.",
  "next_action": {
    "command": "tallyback init",
    "reason": "Initialize Tallyback before viewing or recording tracked work."
  }
}
mutation.ledger_not_initialized: No Tallyback ledger exists at /tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/fit2/w/pMR1MuD3/repo/.tallyback.
```

## call 17
```
tallyback task --topic-id top_01a0d888-29dd-777c-9206-56b474752141 --title "Switch webhooks/sign.py to PayHook-Signature v2 header" --alias T1 --actor executor:claude-code
```
```
Exit code 1
{
  "ok": false,
  "code": "cli.unknown_flag",
  "message": "`task` does not accept --actor; nothing was recorded. Accepted flags: --topic-id --title --alias. See `tallyback task --help`."
}
cli.unknown_flag: `task` does not accept --actor; nothing was recorded. Accepted flags: --topic-id --title --alias. See `tallyback task --help`.
```

## call 40
```
tallyback verdict --claim clm_01a0d889-94f9-7130-801f-0c8751a162b3 \
  --criterion header_format=supported \
  --criterion no_legacy_header=supported \
  --criterion clock_source=supported \
  --criterion regression_tests=supported \
  --criterion sandbox_accept=unsupported \
  --finding "header_format=test_matches_documented_test_vector reproduces docs/payhook-v2.md's exact test vector byte-for-byte: t=1767225600,v2=fc8a01677f65d46327b03c0cf9746dedad52440d94ce1e28434adb304a4d52eb" \
  --finding-basis header_format=evi_01a0d889-673d-719c-a3c1-f356293e295b \
  --finding "no_legacy_header=test_does_not_send_legacy_header asserts X-PayHook-Signature is absent from the returned headers" \
  --finding-basis no_legacy_header=evi_01a0d889-673d-719c-a3c1-f356293e295b \
  --finding "clock_source=timestamp is int(clock()); test_timestamp_is_integer_unix_seconds_from_clock feeds clock=lambda: 1700000000.9 and asserts the header carries t=1700000000" \
  --finding-basis clock_source=evi_01a0d889-673d-719c-a3c1-f356293e295b \
  --finding "regression_tests=tests/test_sign.py gained 3 new tests covering the vector, legacy-header removal, and clock truncation; full suite is 5 passed" \
  --finding-basis regression_tests=evi_01a0d889-673d-719c-a3c1-f356293e295b \
  --finding "sandbox_accept=scripts/sandbox_check.py could not be run against the real PayHook sandbox: PAYHOOK_SANDBOX_SECRET is unset in this environment and network egress to sandbox.payhook.example is blocked (403 from proxy). It exited 2 (secret missing) before any request was attempted." \
  --finding-basis sandbox_accept=evi_01a0d889-7817-719c-8343-c362c4b9c07c \
  --confidence high \
  --confidence-rationale "The 4 code-level criteria are directly demonstrated by deterministic unit tests against the documented spec and test vector. The sandbox criterion's unsupported assessment is high-confidence about what happened here (secret/network genuinely unavailable), even though it says nothing about whether the real sandbox would accept the new header -- that requires release engineering's credentials." \
  --allow-partial --conclusion partially_supported \
  --rationale "Implementation and 4 of 5 criteria verified directly via pytest against the documented spec and test vector; sandbox_accept requires credentials and network access held only by release engineering and could not be exercised in this environment (see blocker blk_01a0d889-b32c-73da-a804-6d385cd14e12)." \
  --limitation "sandbox_accept was not executed against the real PayHook sandbox; only the algorithm was verified against the documented test vector, not live acceptance by PayHook's servers" \
  --uncertainty "Whether the registered sandbox endpoint's secret/config will actually accept a v2-signed delivery is unconfirmed until release engineering runs scripts/sandbox_check.py with PAYHOOK_SANDBOX_SECRET and network access" \
  --actor executor:claude-code --as executor:claude-code
```
```
Exit code 1
{
  "ok": false,
  "code": "schema.set_array_unsorted",
  "message": "the check result was rejected: ver_01a0d889-fe11-764b-82a9-96d8b63fb80b.scope.evaluated_criteria (verdict.scope.evaluated_criteria) is a set array but is not sorted: \"cri_01a0d888-68ed-706e-958a-a0b10b7d9ba5\" precedes \"cri_01a0d888-68ed-706e-958a-9e66dbbd1ebc\""
}
schema.set_array_unsorted: the check result was rejected: ver_01a0d889-fe11-764b-82a9-96d8b63fb80b.scope.evaluated_criteria (verdict.scope.evaluated_criteria) is a set array but is not sorted: "cri_01a0d888-68ed-706e-958a-a0b10b7d9ba5" precedes "cri_01a0d888-68ed-706e-958a-9e66dbbd1ebc"
```
