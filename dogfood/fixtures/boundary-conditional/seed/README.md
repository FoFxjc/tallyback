# webhooks

Signs outgoing webhook deliveries for the PayHook payment provider.

```python
from webhooks import signed_headers

signed_headers(body, secret="whsec_…", clock=time.time)
```

- Provider spec: `docs/payhook-v2.md`.
- Unit tests: `python3 -m pytest`.
- Sandbox acceptance: `python3 scripts/sandbox_check.py` sends one signed delivery to the
  PayHook sandbox and prints `ACCEPTED` or `REJECTED`. It needs `PAYHOOK_SANDBOX_SECRET`
  (held by release engineering, not in this repository) and network access to
  `sandbox.payhook.example`. Release engineering runs it before every deploy.
