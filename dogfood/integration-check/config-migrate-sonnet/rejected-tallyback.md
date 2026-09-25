# Failed or rejected Tallyback invocations

## call 3
```
tallyback handshake && echo "---VIEW---" && tallyback view
```
```
Exit code 1
{
  "contract": "tallyback",
  "implementation_version": "0.1.0",
  "command_api_version": "1",
  "supported_contract_versions": [
    "1.0.0"
  ],
  "features": [
    "store",
    "check",
    "migration",
    "land",
    "view",
    "watch"
  ]
}
---VIEW---
{
  "ok": false,
  "code": "mutation.ledger_not_initialized",
  "message": "No Tallyback ledger exists at /tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/ic/w/6Y3Y3csv/repo/.tallyback.",
  "next_action": {
    "command": "tallyback init",
    "reason": "Initialize Tallyback before viewing or recording tracked work."
  }
}
mutation.ledger_not_initialized: No Tallyback ledger exists at /tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/ic/w/6Y3Y3csv/repo/.tallyback.
```

## call 15
```
tallyback task --topic-id top_01a0d7a8-0816-73f3-a916-ddf9223be693 --title "Fix v1->v2 config migration dropping unrelated keys" --actor executor:claude-code
```
```
Exit code 1
{
  "ok": false,
  "code": "cli.unknown_flag",
  "message": "`task` does not accept --actor; nothing was recorded. Accepted flags: --topic-id --title --alias. See `tallyback task --help`."
}
cli.unknown_flag: `task` does not accept --actor; nothing was recorded. Accepted flags: --topic-id --title --alias. See `tallyback task --help`.
```
