# Failed or rejected Tallyback invocations

## call 7
```
tallyback view
```
```
Exit code 1
{
  "ok": false,
  "code": "mutation.ledger_not_initialized",
  "message": "No Tallyback ledger exists at /tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/fit2/w/efoKINNl/repo/.tallyback.",
  "next_action": {
    "command": "tallyback init",
    "reason": "Initialize Tallyback before viewing or recording tracked work."
  }
}
mutation.ledger_not_initialized: No Tallyback ledger exists at /tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/fit2/w/efoKINNl/repo/.tallyback.
```

## call 39
```
tallyback evidence --attempt-id att_01a0d88b-b9fa-72a9-baae-eda3505a1242 \
  --note "All 14 tests pass:
- 3 tests for priority field acceptance (low, normal, high)
- 1 test for invalid priority rejection
- 1 test for priority type validation
- 9 existing tests still pass
Test output confirms event validation now accepts priority field values (low/normal/high) and rejects invalid values."
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

## call 40
```
tallyback evidence --kind test-run \
  --note "All 14 tests pass:
- 3 tests for priority field acceptance (low, normal, high)
- 1 test for invalid priority rejection
- 1 test for priority type validation
- 9 existing tests still pass
Manual verification confirms:
- Event with priority='high' accepted
- Event with priority='low' accepted
- Event with priority='normal' accepted
- Event with priority='urgent' rejected with InvalidEvent
- Event without priority still accepted
Schema updated with priority field (enum: low|normal|high)
Tests updated with new schema digest" \
  --actor executor:claude-code
```
```
Exit code 1
{
  "ok": false,
  "code": "cli.missing_flag",
  "message": "missing required --payload. See `tallyback evidence --help`."
}
cli.missing_flag: missing required --payload. See `tallyback evidence --help`.
```

## call 43
```
tallyback claim --task-id tsk_01a0d88b-80ea-74bb-94f6-c99a5a8d1fc1 \
  --declaration-id dcl_01a0d88b-9683-74c9-b732-d8a30110a9fd \
  --criterion accept_priority \
  --text "Events with priority=low, normal, or high are accepted" \
  --evidence evi_01a0d88c-d92b-703a-b3e1-98998508b569 \
  --actor executor:claude-code
```
```
Exit code 1
{
  "ok": false,
  "code": "cli.unknown_flag",
  "message": "`claim` does not accept --criterion; nothing was recorded. Accepted flags: --task-id --attempt-id --declaration-id --statement --evidence --actor. See `tallyback claim --help`."
}
cli.unknown_flag: `claim` does not accept --criterion; nothing was recorded. Accepted flags: --task-id --attempt-id --declaration-id --statement --evidence --actor. See `tallyback claim --help`.
```

## call 46
```
tallyback verdict --task-id tsk_01a0d88b-80ea-74bb-94f6-c99a5a8d1fc1 \
  --attempt-id att_01a0d88b-b9fa-72a9-baae-eda3505a1242 \
  --declaration-id dcl_01a0d88b-9683-74c9-b732-d8a30110a9fd \
  --criterion accept_priority=supported \
  --criterion reject_invalid_priority=supported \
  --criterion unchanged_validation=supported \
  --criterion regression_tests=supported \
  --finding accept_priority="3 passing tests for priority=low/normal/high" \
  --finding reject_invalid_priority="1 passing test for priority=urgent rejection" \
  --finding unchanged_validation="All 9 existing tests still pass" \
  --finding regression_tests="5 new priority-related tests added and passing" \
  --evidence evi_01a0d88c-d92b-703a-b3e1-98998508b569 \
  --actor executor:claude-code
```
```
Exit code 1
{
  "ok": false,
  "code": "cli.unknown_flag",
  "message": "`verdict` does not accept --task-id; nothing was recorded. Accepted flags: --claim --criterion --confidence --rationale --finding --finding-basis --attempt --allow-partial --evidence --reconciliation --finality --confidence-rationale --conclusion --uncertainty --limitation --checker-id --checker-version --actor. See `tallyback verdict --help`."
}
cli.unknown_flag: `verdict` does not accept --task-id; nothing was recorded. Accepted flags: --claim --criterion --confidence --rationale --finding --finding-basis --attempt --allow-partial --evidence --reconciliation --finality --confidence-rationale --conclusion --uncertainty --limitation --checker-id --checker-version --actor. See `tallyback verdict --help`.
```
