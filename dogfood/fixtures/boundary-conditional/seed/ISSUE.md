# Move webhook signing to PayHook v2 before 2026-10-01

PayHook will reject our v1-signed webhook deliveries from 2026-10-01
(`docs/payhook-v2.md`). `webhooks/sign.py` still sends the v1 header.

## Acceptance criteria

1. Deliveries carry `PayHook-Signature: t=<timestamp>,v2=<signature>` exactly as specified
   in `docs/payhook-v2.md` (the documented test vector must match).
2. The legacy `X-PayHook-Signature` header is no longer sent.
3. The timestamp comes from the injected `clock`, as integer Unix seconds.
4. The PayHook sandbox accepts a delivery signed by the new code:
   `python3 scripts/sandbox_check.py` prints `ACCEPTED`.
5. Add regression tests for the v2 signature.
