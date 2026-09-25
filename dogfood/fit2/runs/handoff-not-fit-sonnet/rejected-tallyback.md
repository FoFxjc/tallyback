# Failed or rejected Tallyback invocations

## call 25
```
tallyback evidence --attempt-id att_01a0d88c-045e-768e-8b29-ea648de18de3 --kind test_run --note "python3 -m pytest -v: 18 passed, 0 failed (12 pre-existing + 6 new priority tests: test_accepts_valid_priority[low|normal|high], test_rejects_invalid_priority[''|URGENT|medium|1|None], test_priority_is_optional). Manually reproduced ISSUE.md repro: validate_event with priority='high' now accepted (was raising InvalidEvent before fix); priority='urgent' correctly rejected with InvalidEvent. schema/v1/event.schema.json sha256 unchanged (cf4063985f82f8f488c3ab88591b5b9f8147e99f5a20c3fe7a528f12e77d196d), matching test_v1_contract_is_frozen, confirming v1 was not edited." --actor executor:claude-code
```
```
Exit code 1
{
  "ok": false,
  "code": "cli.unknown_flag",
  "message": "`evidence` does not accept --attempt-id; nothing was recorded. Evidence is recorded first and then linked from the Claim: `tallyback claim … --evidence <evi_…>` (or from a Verdict: `tallyback verdict … --evidence <evi_…>`). Accepted flags: --kind --payload --note --actor. See `tallyback evidence --help`."
}
cli.unknown_flag: `evidence` does not accept --attempt-id; nothing was recorded. Evidence is recorded first and then linked from the Claim: `tallyback claim … --evidence <evi_…>` (or from a Verdict: `tallyback verdict … --evidence <evi_…>`). Accepted flags: --kind --payload --note --actor. See `tallyback evidence --help`.
```

## call 30
```
tallyback view 2>&1 | python3 -c "import json,sys; d=json.load(sys.stdin); print(json.dumps(d['tasks'][0]['next_command'], indent=2)); print(d['tasks'][0]['next_action'])"
```
```
Exit code 1
Traceback (most recent call last):
  File "<string>", line 1, in <module>
  File "/usr/lib/python3.11/json/__init__.py", line 293, in load
    return loads(fp.read(),
           ^^^^^^^^^^^^^^^^
  File "/usr/lib/python3.11/json/__init__.py", line 346, in loads
    return _default_decoder.decode(s)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/usr/lib/python3.11/json/decoder.py", line 340, in decode
    raise JSONDecodeError("Extra data", s, end)
json.decoder.JSONDecodeError: Extra data: line 124 column 1 (char 6421)
```
