## Summary

I've successfully fixed the parse_duration bug and tracked the work end-to-end with Tallyback. Here's what happened:

### **What Changed**
1. **Bug Fix** (`durations/parse.py:13`): Changed minutes unit mapping from 3600 seconds to 60 seconds
   - Before: `{"h": 3600, "m": 3600, "s": 1}` (minutes incorrectly mapped to hours value)
   - After: `{"h": 3600, "m": 60, "s": 1}` (minutes correctly mapped to 60)

2. **Regression Tests** (`tests/test_parse.py`): Added 3 new tests covering minutes
   - `test_minutes()`: `"30m"` → 1800s ✓
   - `test_hours_and_minutes()`: `"1h30m"` → 5400s ✓
   - `test_hours_minutes_and_seconds()`: `"2h15m30s"` → 8130s ✓

### **What Was Verified**
- ✅ All 14 tests pass (11 existing + 3 new)
- ✅ Minutes are converted correctly (issue examples now work)
- ✅ Hours-only (`"2h"` → 7200s) and seconds-only (`"45s"` → 45s) durations keep working
- ✅ Invalid input validation still rejects malformed durations (8 parametrized test cases)
- ✅ Grammar remains unchanged (no modifications to `durations/parse.py` validation logic)

### **Tallyback Task State**
- **Status**: ✅ Settled (Decision: LAND)
- **Verification**: ✅ All 4 criteria supported with high confidence
- **Evidence**: Test execution proof (14/14 passing)
- **Ready to Land**: Yes (lexical settlement complete; Git integration unbound as expected)

**Commit**: `56e41f2` - Includes fix, tests, and Tallyback ledger initialization