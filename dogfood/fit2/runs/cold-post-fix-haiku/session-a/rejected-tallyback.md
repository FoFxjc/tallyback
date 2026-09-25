# Failed or rejected Tallyback invocations

## call 8
```
tallyback view
```
```
Exit code 1
{
  "ok": false,
  "code": "mutation.ledger_not_initialized",
  "message": "No Tallyback ledger exists at /tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/fit2/w/k3obow89/repo/.tallyback.",
  "next_action": {
    "command": "tallyback init",
    "reason": "Initialize Tallyback before viewing or recording tracked work."
  }
}
mutation.ledger_not_initialized: No Tallyback ledger exists at /tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/fit2/w/k3obow89/repo/.tallyback.
```

## call 12
```
tallyback task --topic "Config migration fixes" --name "Fix v1 config migration to preserve custom fields"
```
```
Exit code 1
{
  "ok": false,
  "code": "cli.unknown_flag",
  "message": "`task` does not accept --topic; nothing was recorded. Did you mean --topic-id? Accepted flags: --topic-id --title --alias. See `tallyback task --help`."
}
cli.unknown_flag: `task` does not accept --topic; nothing was recorded. Did you mean --topic-id? Accepted flags: --topic-id --title --alias. See `tallyback task --help`.
```

## call 20
```
tallyback dispatch --task-id tsk_01a0d87c-d854-77a6-90df-f86a576426c8 --workspace-id wsp_01a0d87d-0eb7-750d-8d99-564fd2fd718d
```
```
Exit code 1
{
  "ok": false,
  "code": "cli.missing_flag",
  "message": "missing required --declaration-id. See `tallyback dispatch --help`."
}
cli.missing_flag: missing required --declaration-id. See `tallyback dispatch --help`.
```

## call 21
```
tallyback dispatch --task-id tsk_01a0d87c-d854-77a6-90df-f86a576426c8 --declaration-id dcl_01a0d87c-efdd-76b9-8be9-ec5527700fa8 --workspace-id wsp_01a0d87d-0eb7-750d-8d99-564fd2fd718d
```
```
Exit code 1
{
  "ok": false,
  "code": "cli.missing_flag",
  "message": "missing required --repository-id. See `tallyback dispatch --help`."
}
cli.missing_flag: missing required --repository-id. See `tallyback dispatch --help`.
```
