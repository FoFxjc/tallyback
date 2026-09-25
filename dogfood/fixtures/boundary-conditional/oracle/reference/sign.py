"""Reference fix for boundary-conditional (oracle only)."""

from __future__ import annotations

import hashlib
import hmac
from typing import Callable


def signed_headers(body: bytes, secret: str, clock: Callable[[], float]) -> dict[str, str]:
    timestamp = int(clock())
    digest = hmac.new(
        secret.encode("utf-8"), str(timestamp).encode("ascii") + b"." + body, hashlib.sha256
    ).hexdigest()
    return {"Content-Type": "application/json", "PayHook-Signature": f"t={timestamp},v2={digest}"}
