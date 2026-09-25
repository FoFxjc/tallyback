## Summary

**What changed**

- `webhooks/sign.py`: `signed_headers` now builds `PayHook-Signature: t=<int unix seconds from clock()>,v2=<hmac-sha256 hex over "<ts>.<body>">` and no longer emits `X-PayHook-Signature`/sha1.
- `tests/test_sign.py`: added 3 regression tests — the exact documented test vector from `docs/payhook-v2.md`, absence of the legacy header, and integer-truncation of a fractional clock value.

**What was actually verified**

- `python3 -m pytest -v`: 5/5 passed, including the new tests.
- The new test vector test reproduces `docs/payhook-v2.md`'s table byte-for-byte (`t=1767225600,v2=fc8a01677f65d46327b03c0cf9746dedad52440d94ce1e28434adb304a4d52eb`) — confirmed independently by hand-computing the HMAC in a throwaway script before writing the fix.
- Confirmed the legacy header key is gone and the timestamp comes from `int(clock())`.

**What's still uncertain**

- Acceptance criterion #4 (`python3 scripts/sandbox_check.py` prints `ACCEPTED`) could **not** be executed here: `PAYHOOK_SANDBOX_SECRET` is unset in this environment (per the README, it's held only by release engineering) and I confirmed network egress to `sandbox.payhook.example` is blocked (403 at the proxy). The script exited 2 without sending anything. Whether the real PayHook sandbox accepts the new header can only be confirmed by release engineering running that script with the real secret before the 2026-10-01 deadline.

**Final Tallyback state**

Task `tsk_01a0d888-3dfe-753f-b810-d2e8240e3ff1` ("Switch webhooks/sign.py to PayHook-Signature v2 header"):
- Verdict: `partially_supported` (4/5 criteria `supported`: header_format, no_legacy_header, clock_source, regression_tests; `sandbox_accept` `unsupported`)
- 1 open Blocker (`blk_01a0d889-b32c-73da-a804-6d385cd14e12`) describing exactly what release engineering needs to do
- Attempt ended with outcome `returned` (work done, handed back rather than self-declared complete)
- **Not settled** — I deliberately did not settle `accept`/`land`: that decision belongs to whoever can actually close the sandbox blocker (release engineering) or to you, since it's beyond an executor's authority to assert an unmet, externally-gated acceptance criterion is done.

Next step is for someone with `PAYHOOK_SANDBOX_SECRET` and network access to run `scripts/sandbox_check.py`, then resolve the blocker and settle the task.