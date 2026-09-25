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
