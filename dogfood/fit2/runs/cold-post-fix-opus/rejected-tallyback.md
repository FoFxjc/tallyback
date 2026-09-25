# Failed or rejected Tallyback invocations

## call 11
```
E1=evi_01a0d87d-6937-7671-9d7d-f710b71b6997; E2=evi_01a0d87d-6ae9-76fc-b95e-775f68b129fb
tallyback verdict --actor executor:claude-code --claim clm_01a0d87d-7bfd-74be-a9a8-bf903705003d \
 --criterion rename=supported --criterion version=supported --criterion preserve=supported --criterion no-mutate=supported --criterion tests=supported \
 --finding rename=test_renames_timeout_to_request_timeout passes --finding-basis rename=$E1 \
 --finding version=test_sets_current_version passes --finding-basis version=$E1 \
 --finding "preserve=issue example + nested dict/list/None test pass; fail on original code" --finding-basis preserve=$E1 --finding-basis preserve=$E2 \
 --finding "no-mutate=deepcopy; snapshot-equality and non-aliasing tests pass" --finding-basis no-mutate=$E1 --finding-basis no-mutate=$E2 \
 --finding "tests=4 new tests in tests/test_migrate.py; 3 fail on the unfixed code" --finding-basis tests=$E2 \
 --evidence $E1 --evidence $E2 --confidence high \
 --rationale "Full pytest suite 14/14 on the fixed tree; the new tests reproduce the reported bug against HEAD's migrate.py." \
 --limitation "Self-verified by the same executor that wrote the fix; no independent reviewer" \
 --limitation "Changes are uncommitted; evidence is from a dirty working tree, not a commit" \
 --uncertainty "A v1 doc without 'timeout' still raises KeyError (same as before; not in scope of the issue)" \
 --uncertainty "Top-level key order changes (request_timeout moves to the end); dict equality and YAML semantics are unaffected" | grep -E '"ok"|verdict_id|code|message'
tallyback view | python3 -c "import json,sys;t=json.load(sys.stdin)['tasks'][0];print(t['status'],t['next_action'],t['next_command'])"
```
```
cli.unexpected_argument: `verdict` takes no positional arguments (got "passes", "passes"); pass values with flags. See `tallyback verdict --help`.
  "ok": false,
  "code": "cli.unexpected_argument",
  "message": "`verdict` takes no positional arguments (got \"passes\", \"passes\"); pass values with flags. See `tallyback verdict --help`."
view: 1 task(s), 0 blocked, 0 ready_to_land, 0 stale, 0 settled
{'blocked': False, 'verified': False, 'settled': False, 'dispatched': True, 'ready_to_land': False, 'stale': False} verify (begin-check) {'command': 'tallyback verdict --claim clm_01a0d87d-7bfd-74be-a9a8-bf903705003d --criterion rename=<assessment> --criterion version=<assessment> --criterion preserve=<assessment> --criterion no-mutate=<assessment> --criterion tests=<assessment> --confidence <low|medium|high> --rationale <text>', 'reason': 'Judge the claim criterion by criterion (assessment: supported|partially_supported|unsupported|contradicted); --finding/--finding-basis say what supports each one.', 'requires': ['--criterion rename', '--criterion version', '--criterion preserve', '--criterion no-mutate', '--criterion tests', '--confidence', '--rationale']}
```
