## Summary

**What changed:**

1. **Fixed `cfgmigrate/migrate.py`:**
   - Added `import copy` for deep copying
   - Modified `_v1_to_v2()` to use `copy.deepcopy(old)` instead of hardcoding specific keys, which preserves all unknown keys like `custom`
   - Used `result.pop("timeout")` to rename the key and `setdefault("plugins", [])` to maintain the plugins default behavior
   - Modified `migrate()` to do a deep copy of the input config at the start, ensuring the input object is never mutated

2. **Added regression tests in `tests/test_migrate.py`:**
   - `test_preserves_unknown_keys()`: Verifies the exact scenario from ISSUE.md (custom.owner preserved)
   - `test_preserves_nested_unknown_keys()`: Verifies recursive preservation of nested unknown structures
   - `test_does_not_mutate_input()`: Verifies the input object is not mutated

**What was verified:**

✓ All 13 tests pass (10 existing + 3 new regression tests)  
✓ timeout renamed to request_timeout  
✓ version set to 2  
✓ custom section and all unknown keys preserved recursively  
✓ Input config object not mutated  
✓ Exact scenario from ISSUE.md works correctly (verified with manual test)

**Uncertainty:** None - all acceptance criteria confirmed passing

**Tallyback task state:** `ready_to_land: true`, `verified: true`, `settled: true` with decision: `land`