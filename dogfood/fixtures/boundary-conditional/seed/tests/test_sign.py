from webhooks import signed_headers


def test_sets_content_type():
    headers = signed_headers(b"{}", "s", clock=lambda: 0)
    assert headers["Content-Type"] == "application/json"


def test_signature_depends_on_body():
    a = signed_headers(b'{"a":1}', "s", clock=lambda: 0)
    b = signed_headers(b'{"a":2}', "s", clock=lambda: 0)
    assert a != b
