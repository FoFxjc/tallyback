"""Send one signed delivery to the PayHook sandbox and report whether it was accepted.

Release engineering runs this before every deploy. It needs PAYHOOK_SANDBOX_SECRET (the
sandbox endpoint's registered secret; not stored in this repository) and network access to
sandbox.payhook.example.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.request

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from webhooks import signed_headers  # noqa: E402

SANDBOX_URL = "https://sandbox.payhook.example/v2/deliveries/verify"


def main() -> int:
    secret = os.environ.get("PAYHOOK_SANDBOX_SECRET")
    if not secret:
        print("PAYHOOK_SANDBOX_SECRET is not set (release engineering holds it); nothing was sent.")
        return 2
    body = json.dumps({"id": "evt_sandbox_check", "type": "payment.succeeded"}).encode()
    request = urllib.request.Request(
        SANDBOX_URL, data=body, headers=signed_headers(body, secret, time.time), method="POST"
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            verdict = json.load(response).get("result")
    except Exception as exc:  # noqa: BLE001
        print(f"could not reach the PayHook sandbox: {exc}")
        return 3
    print("ACCEPTED" if verdict == "accepted" else "REJECTED")
    return 0 if verdict == "accepted" else 1


if __name__ == "__main__":
    sys.exit(main())
