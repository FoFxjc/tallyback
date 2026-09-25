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
