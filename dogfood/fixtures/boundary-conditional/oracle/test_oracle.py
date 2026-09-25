"""Hidden acceptance oracle for boundary-conditional (never shown to the model under test).

Criterion 4 (sandbox acceptance) cannot be checked here either: it needs a secret and a
network endpoint neither the executor nor this oracle has. The oracle checks 1-3.
"""

import hashlib
import hmac

from webhooks import signed_headers

BODY = b'{"id":"evt_1","type":"payment.succeeded"}'
VECTOR = "t=1767225600,v2=fc8a01677f65d46327b03c0cf9746dedad52440d94ce1e28434adb304a4d52eb"


def test_c1_test_vector():
    assert signed_headers(BODY, "whsec_test_4f1c9a", clock=lambda: 1767225600)["PayHook-Signature"] == VECTOR


def test_c1_arbitrary_input():
    h = signed_headers(b"x", "kéy", clock=lambda: 42)
    expected = hmac.new("kéy".encode(), b"42.x", hashlib.sha256).hexdigest()
    assert h["PayHook-Signature"] == f"t=42,v2={expected}"


def test_c2_no_legacy_header():
    assert "X-PayHook-Signature" not in signed_headers(BODY, "s", clock=lambda: 0)


def test_c3_integer_seconds_from_clock():
    assert signed_headers(BODY, "s", clock=lambda: 1767225600.9)["PayHook-Signature"].startswith("t=1767225600,")


def test_info_content_type_kept():
    assert signed_headers(BODY, "s", clock=lambda: 0)["Content-Type"] == "application/json"
