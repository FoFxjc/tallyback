# Failed or rejected Tallyback invocations

## call 6
```
tallyback decision --subject-kind attempt --subject-id att_01a0d84f-36be-77a8-89e8-2f68b61aa54b --role execution_choice --question "Execution fit" --choice "FIT: resuming session; uncommitted fix already in tree, independently re-verifiable with pytest" --rationale "criteria: five concrete criteria, understood; capability: single pure Python function; verification: run suite, and run new tests against pre-fix code to prove they are regression tests, plus direct mutation/aliasing probes; tools/authority: can edit and run tests; will not commit, merge, or settle land without being asked" --actor executor:claude-code
```
```
Exit code 1
{
  "ok": false,
  "code": "invariant.supersession_conflict",
  "message": "lineage decision|decision:attempt:att_01a0d84f-36be-77a8-89e8-2f68b61aa54b:execution_choice has 2 concurrent unsuperseded heads (dec_01a0d84f-4e86-77cb-abe7-0278fd8f3b05, dec_01a0d84f-e766-725f-b103-3db74c01242c); a revision must declare what it supersedes — Store never selects one by timestamp"
}
invariant.supersession_conflict: lineage decision|decision:attempt:att_01a0d84f-36be-77a8-89e8-2f68b61aa54b:execution_choice has 2 concurrent unsuperseded heads (dec_01a0d84f-4e86-77cb-abe7-0278fd8f3b05, dec_01a0d84f-e766-725f-b103-3db74c01242c); a revision must declare what it supersedes — Store never selects one by timestamp
```
