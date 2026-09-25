# Failed or rejected Tallyback invocations

## call 10
```
tallyback view
```
```
Exit code 1
{
  "ok": false,
  "code": "mutation.ledger_not_initialized",
  "message": "No Tallyback ledger exists at /tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/fit2/w/ilYJ4Rjr/repo/.tallyback.",
  "next_action": {
    "command": "tallyback init",
    "reason": "Initialize Tallyback before viewing or recording tracked work."
  }
}
mutation.ledger_not_initialized: No Tallyback ledger exists at /tmp/claude-0/-home-user-tallyback/01b763c0-69a7-5ad2-94c6-b173155321d2/scratchpad/fit2/w/ilYJ4Rjr/repo/.tallyback.
```

## call 12
```
tallyback topic --title "Fix config migration bug: preserve unknown keys during v1→v2 migration"
```
```
Exit code 1
{
  "ok": false,
  "code": "cli.unknown_flag",
  "message": "`topic` does not accept --title; nothing was recorded. Accepted flags: --name --goal --actor. See `tallyback topic --help`."
}
cli.unknown_flag: `topic` does not accept --title; nothing was recorded. Accepted flags: --name --goal --actor. See `tallyback topic --help`.
```

## call 21
```
tallyback dispatch --task-id tsk_01a0d881-b95e-7176-9148-368ddf93c29c --workspace-id wsp_01a0d881-e667-768e-ac21-0aa943b8e6cc
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

## call 22
```
tallyback dispatch --declaration-id dcl_01a0d881-cff8-73de-b7cb-609ab4b9a92c --workspace-id wsp_01a0d881-e667-768e-ac21-0aa943b8e6cc
```
```
Exit code 1
{
  "ok": false,
  "code": "cli.missing_flag",
  "message": "missing required --task-id. See `tallyback dispatch --help`."
}
cli.missing_flag: missing required --task-id. See `tallyback dispatch --help`.
```

## call 23
```
tallyback dispatch --task-id tsk_01a0d881-b95e-7176-9148-368ddf93c29c --declaration-id dcl_01a0d881-cff8-73de-b7cb-609ab4b9a92c --workspace-id wsp_01a0d881-e667-768e-ac21-0aa943b8e6cc
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
