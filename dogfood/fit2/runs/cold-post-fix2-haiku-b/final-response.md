## Summary

I have successfully fixed the config migration bug where user-defined keys were lost during v1→v2 migration.

### What Changed

**cfgmigrate/migrate.py** - Fixed the `_v1_to_v2()` function:
- Changed from creating a hardcoded dict with only known keys to using `dict(old)` to preserve all existing keys
- Renames `timeout` to `request_timeout` using `.pop()`
- Sets `version` to 2
- Ensures `plugins` defaults to an empty list if missing

**tests/test_migrate.py** - Added 2 new regression tests:
- `test_preserves_unknown_keys()`: Verifies the specific issue from ISSUE.md where `custom` and other unknown keys are preserved
- `test_does_not_mutate_input()`: Verifies the input object is not mutated by the migration

### What Was Verified

✅ **All 5 acceptance criteria verified by test suite (12 tests pass):**
1. **rename_timeout** - `test_renames_timeout_to_request_timeout` confirms timeout is renamed to request_timeout
2. **set_version** - `test_sets_current_version` confirms version is set to 2
3. **preserve_keys** - `test_preserves_unknown_keys` confirms unknown keys like `custom` and `other_field` are preserved
4. **no_mutation** - `test_does_not_mutate_input` confirms input object is unchanged after migration
5. **test_coverage** - 2 new regression tests added for unknown key preservation and input immutability

### Anything Uncertain

None. All acceptance criteria are fully met and verified by the comprehensive test suite. The implementation uses a shallow copy via `dict(old)`, which preserves all top-level keys and their references without mutating the original input.

### Tallyback Final State

- **Task ID**: tsk_01a0d881-b95e-7176-9148-368ddf93c29c
- **Status**: ✅ **SETTLED** with decision: **LAND**
- **Verification**: ✅ **SUPPORTED** (high confidence)
- **Ready to Land**: Yes

All evidence, claims, and verdicts have been recorded in the Tallyback ledger and the task is ready for landing.