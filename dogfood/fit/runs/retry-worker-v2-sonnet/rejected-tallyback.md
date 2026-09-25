# Failed or rejected Tallyback invocations

## call 3
```
tallyback view
```
```
Exit code 1
{
  "ok": false,
  "code": "mutation.ledger_not_initialized",
  "message": "No Tallyback ledger exists at /tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/fit/w/7k4x7myH/repo/.tallyback.",
  "next_action": {
    "command": "tallyback init",
    "reason": "Initialize Tallyback before viewing or recording tracked work."
  }
}
mutation.ledger_not_initialized: No Tallyback ledger exists at /tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/fit/w/7k4x7myH/repo/.tallyback.
```

## call 35
```
tallyback evidence --kind observation \
  --payload '{"text": "Root cause in batcher/chunk.py: when an oversized item (size > max_bytes) was encountered, the code flushed the current batch via batches.append(current) then executed continue WITHOUT ever appending the oversized item itself to any batch -- it was silently dropped. Fix: append the oversized item as its own single-item batch before continuing, and guard the batches.append(current) call with `if current:` so a leading oversized item does not also emit a spurious empty batch.", "observer": "executor:claude-code"}' \
  --note "Static analysis of the defect in batcher/chunk.py lines 28-32 (pre-fix) explaining why payloads were lost." \
  --actor executor:claude-code
```
```
Exit code 1
{
  "ok": false,
  "code": "schema.unknown_property",
  "message": "/records/0/payload/observer must be object",
  "hint": "--payload for kind observation: {text (required), observer, observed_at}. Put the human-readable result (counts, failing tests) in --note. See `tallyback evidence --help` for every kind."
}
schema.unknown_property: /records/0/payload/observer must be object
hint: --payload for kind observation: {text (required), observer, observed_at}. Put the human-readable result (counts, failing tests) in --note. See `tallyback evidence --help` for every kind.
```
