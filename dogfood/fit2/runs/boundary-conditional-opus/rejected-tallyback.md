# Failed or rejected Tallyback invocations

## call 3
```
cat docs/payhook-v2.md webhooks/*.py scripts/sandbox_check.py tests/test_sign.py README.md pytest.ini; tallyback view; tallyback handshake
```
```
# PayHook webhook signatures, v2

PayHook stops accepting v1 signatures (`X-PayHook-Signature: sha1=…`) on 2026-10-01.

## Header

```
PayHook-Signature: t=<timestamp>,v2=<signature>
```

- `<timestamp>` — the send time as integer Unix seconds.
- `<signature>` — lowercase hex HMAC-SHA256, keyed with the endpoint secret (UTF-8), over
  the bytes `<timestamp>` + `.` + `<raw request body>`.
- Send only this header; a delivery that also carries the v1 header is rejected.
- PayHook rejects timestamps more than 300 seconds from its own clock.

## Test vector

| Input | Value |
| --- | --- |
| secret | `whsec_test_4f1c9a` |
| timestamp | `1767225600` |
| body | `{"id":"evt_1","type":"payment.succeeded"}` |
| header | `t=1767225600,v2=fc8a01677f65d46327b03c0cf9746dedad52440d94ce1e28434adb304a4d52eb` |

The test vector checks the algorithm only. Whether a real endpoint's deliveries are
accepted depends on its registered secret and PayHook's servers; verify that with the
sandbox (see README).
"""webhooks — sign outgoing PayHook deliveries."""

from webhooks.sign import signed_headers

__all__ = ["signed_headers"]
"""Signing for outgoing PayHook webhook deliveries (see docs/payhook-v2.md)."""

from __future__ import annotations

import hashlib
import hmac
from typing import Callable


def signed_headers(body: bytes, secret: str, clock: Callable[[], float]) -> dict[str, str]:
    """Return the headers that authenticate ``body`` to PayHook."""
    digest = hmac.new(secret.encode("utf-8"), body, hashlib.sha1).hexdigest()
    return {
        "Content-Type": "application/json",
        "X-PayHook-Signature": f"sha1={digest}",
    }
"""Send one signed delivery to the PayHook sandbox and report whether it was accepted.

Release engineering runs this before every deploy. It needs PAYHOOK_SANDBOX_SECRET (the
sandbox endpoint's registered secret; not stored in this repository) and network access to
sandbox.payhook.example.
"""

from __future__ import annotations

import json
import os

```
