# Failed or rejected Tallyback invocations

## call 12
```
tallyback decision --subject-kind attempt --subject-id att_01a0d844-1f41-7349-9284-77585a61ed4b --role execution_choice \
  --question "Execution fit" \
  --choice "FIT: can implement and verify via unit tests + manual repro" \
  --rationale "criteria: understood (rename, version bump, recursive preserve, immutability, regression test); capability: yes, pure Python dict logic; verification: pytest suite + manual repro script comparing input/output; tools/authority: have edit+bash, not asked to commit/land" \
  --actor executor:claude-code
```
```
Exit code 1
{
  "ok": false,
  "code": "invariant.supersession_conflict",
  "message": "lineage decision|decision:attempt:att_01a0d844-1f41-7349-9284-77585a61ed4b:execution_choice has 2 concurrent unsuperseded heads (dec_01a0d844-398f-730f-9021-461e4a1ed459, dec_01a0d845-679f-772b-b6f2-4f677c899a77); a revision must declare what it supersedes — Store never selects one by timestamp"
}
invariant.supersession_conflict: lineage decision|decision:attempt:att_01a0d844-1f41-7349-9284-77585a61ed4b:execution_choice has 2 concurrent unsuperseded heads (dec_01a0d844-398f-730f-9021-461e4a1ed459, dec_01a0d845-679f-772b-b6f2-4f677c899a77); a revision must declare what it supersedes — Store never selects one by timestamp
```

## call 13
```
tallyback show --id att_01a0d844-1f41-7349-9284-77585a61ed4b 2>&1 || tallyback show --help 2>&1 | head -30
```
```
{
  "ok": false,
  "code": "cli.unknown_flag",
  "message": "`show` does not accept --id; nothing was recorded. Accepted flags: (none). See `tallyback show --help`."
}
cli.unknown_flag: `show` does not accept --id; nothing was recorded. Accepted flags: (none). See `tallyback show --help`.
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
