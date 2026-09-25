# Failed or rejected Tallyback invocations

## call 24
```
tallyback evidence --description "All tests passing" --note "16/16 tests pass including 6 new regression tests:
- test_preserves_unknown_keys_in_v1_to_v2
- test_does_not_mutate_input_object
- test_does_not_share_nested_objects_after_migration
- test_preserves_nested_structures_recursively
- test_v2_config_returns_new_object
- test_v2_config_does_not_mutate_input"
```
```
Exit code 1
{
  "ok": false,
  "code": "cli.unknown_flag",
  "message": "`evidence` does not accept --description; nothing was recorded. Accepted flags: --kind --payload --note --actor. See `tallyback evidence --help`."
}
cli.unknown_flag: `evidence` does not accept --description; nothing was recorded. Accepted flags: --kind --payload --note --actor. See `tallyback evidence --help`.
```

## call 29
```
tallyback verdict --task-id tsk_01a0d875-2c05-742d-ad6a-bfc6960d5a7e --attempt-id att_01a0d875-718e-713b-a3f1-7ff8ad2021da --declaration-id dcl_01a0d875-41f6-709b-b163-f6be6e541d2a --criterion "timeout_renamed=PASS" --criterion "version_set=PASS" --criterion "keys_preserved=PASS" --criterion "no_mutation=PASS" --criterion "test_coverage=PASS" --finding "timeout_renamed=Existing test_renames_timeout_to_request_timeout confirms timeout is renamed and removed" --finding "version_set=Existing test_sets_current_version confirms version is set to 2" --finding "keys_preserved=New test_preserves_unknown_keys_in_v1_to_v2 and test_preserves_nested_structures_recursively pass" --finding "no_mutation=New test_does_not_mutate_input_object and test_v2_config_does_not_mutate_input pass" --finding "test_coverage=Added 6 regression tests covering all edge cases"
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
