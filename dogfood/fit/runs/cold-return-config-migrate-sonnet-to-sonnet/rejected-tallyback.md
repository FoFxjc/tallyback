# Failed or rejected Tallyback invocations

## call 11
```
tallyback decision --subject-kind attempt --subject-id att_01a0d84b-2a38-74ec-af26-d3669c565059 --role execution_choice \
  --question "Execution fit" \
  --choice "FIT: can implement and verify the migration fix with existing pytest suite plus new targeted checks" \
  --rationale "criteria: all 5 acceptance criteria understood and map to concrete, testable behaviors; capability: pure Python dict manipulation, well within scope; verification: pytest suite plus manual script probing nested-key preservation, non-mutation, and identity checks gives credible evidence for each criterion; tools/authority: have Read/Edit/Bash access to repo and test runner, no need to commit/push/land without being asked" \
  --actor executor:claude-code
```
```
Exit code 1
{
  "ok": false,
  "code": "invariant.supersession_conflict",
  "message": "lineage decision|decision:attempt:att_01a0d84b-2a38-74ec-af26-d3669c565059:execution_choice has 2 concurrent unsuperseded heads (dec_01a0d84b-4483-727a-ad10-8639438353ee, dec_01a0d84c-3b78-758f-82c0-1cbd535ca516); a revision must declare what it supersedes — Store never selects one by timestamp"
}
invariant.supersession_conflict: lineage decision|decision:attempt:att_01a0d84b-2a38-74ec-af26-d3669c565059:execution_choice has 2 concurrent unsuperseded heads (dec_01a0d84b-4483-727a-ad10-8639438353ee, dec_01a0d84c-3b78-758f-82c0-1cbd535ca516); a revision must declare what it supersedes — Store never selects one by timestamp
```

## call 12
```
tallyback show --attempt-id att_01a0d84b-2a38-74ec-af26-d3669c565059 2>&1 || tallyback show --help 2>&1 | head -30
```
```
{
  "ok": false,
  "code": "cli.unknown_flag",
  "message": "`show` does not accept --attempt-id; nothing was recorded. Accepted flags: (none). See `tallyback show --help`."
}
cli.unknown_flag: `show` does not accept --attempt-id; nothing was recorded. Accepted flags: (none). See `tallyback show --help`.
tallyback show — Print the full ledger snapshot.

Usage: tallyback show

Global:
  --project-root <path>
      project directory (default: cwd)
  --as <kind:id>
      submitter of the operation; attribute the record to kind:id (kind: human|subagent|executor|tool|unknown|migrated)
  --help
      show this command’s flags and examples

Examples:
  tallyback show

Read-only.
```

## call 32
```
tallyback view 2>&1 | python3 -c "
import sys, json
data = json.loads(sys.stdin.readline())
t = data['tasks'][0]
print('status:', t['status'])
print('next_action:', t['next_action'])
print('settlement:', t['settlement'])
"
```
```
Exit code 1
Traceback (most recent call last):
  File "<string>", line 3, in <module>
  File "/usr/lib/python3.11/json/__init__.py", line 346, in loads
    return _default_decoder.decode(s)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/usr/lib/python3.11/json/decoder.py", line 337, in decode
    obj, end = self.raw_decode(s, idx=_w(s, 0).end())
               ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/usr/lib/python3.11/json/decoder.py", line 353, in raw_decode
    obj, end = self.scan_once(s, idx)
               ^^^^^^^^^^^^^^^^^^^^^^
json.decoder.JSONDecodeError: Expecting property name enclosed in double quotes: line 2 column 1 (char 2)
```
