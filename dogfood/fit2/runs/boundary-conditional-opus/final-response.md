I've made the v2 signing change and verified four of the five acceptance criteria. The sandbox acceptance check (criterion 4) couldn't run: `PAYHOOK_SANDBOX_SECRET` isn't set here, and the README says release engineering holds it. The task is therefore **blocked, not settled**.

## What changed
The changes are uncommitted, on a new local branch `fix/payhook-v2`.
- **`webhooks/sign.py`**: the signature is now HMAC-SHA256 over `"<timestamp>.<body>"`. It is sent as `PayHook-Signature: t=<timestamp>,v2=<hex>`, with the timestamp taken from `int(clock())`. The `X-PayHook-Signature` header is no longer sent.
- **`tests/test_sign.py`**: 4 new tests:
  - the documented test vector matches exactly;
  - the headers are exactly `Content-Type` and `PayHook-Signature`;
  - a fractional clock value is cut down to whole seconds;
  - the signature changes when the timestamp changes.

## What was verified
- `python3 -m pytest`: 6 passed.
- With the old `sign.py` and the new tests, 4 failed and 2 passed, so the new tests catch the bug.
- Criteria 1 (header format and test vector), 2 (old header gone), 3 (timestamp from the clock) and 5 (regression tests) are covered by those tests.

## Still uncertain
- **Criterion 4 (sandbox)**: `python3 scripts/sandbox_check.py` exited 2 with "PAYHOOK_SANDBOX_SECRET is not set… nothing was sent." Nothing was sent to the sandbox, so I don't know whether PayHook's real sandbox accepts the new signature. Release engineering needs to run that script on this branch and see `ACCEPTED` before the 2026-10-01 cutoff.
- I did not commit, merge or run `land`.

## Tallyback state
- **Task**: "Move webhook signing to PayHook v2" (`tsk_01a0d887-…`), with the 5 criteria declared and one Attempt open.
- **Fit check**: `CONDITIONAL` on the Attempt, naming the missing sandbox secret as the limit.
- **Claim and evidence**: one Claim linked to three pieces of evidence: the test run, the failed sandbox command and the diff.
- **Verdict**: `partially_supported` overall. The sandbox criterion is marked `unsupported` and the other four `supported`.
- **Blocker**: `blk_01a0d888-ec5f-…` is open on the sandbox check.
- **Status**: blocked, not verified, not settled, not ready to land. The next step is to resolve that blocker once release engineering confirms `ACCEPTED`.
- **Tallyback issue**: my first `verdict` call was rejected with an internal sorting error (`schema.set_array_unsorted`). It went through when I listed the criteria in declaration order.
- **Ledger files**: the `.tallyback/` folder is new and untracked in Git.