Task settled (1 settled, 0 blocked). I left the code changes uncommitted since committing wasn't requested.

**What changed:**
- `durations/parse.py`: fixed `_UNIT_SECONDS["m"]` from `3600` to `60` — the sole bug (minutes were multiplied by hour's factor, causing the reported 60× inflation). The regex grammar (`_PART`), unit order (`_ORDER`), and control flow are untouched.
- `tests/test_parse.py`: added `test_minutes` (`30m` → 1800), `test_hours_and_minutes` (`1h30m` → 5400), and `test_hours_minutes_and_seconds` (`2h15m30s` → 8130), covering the exact examples from the issue.

**What was actually verified:**
- Full test suite run: 14/14 passed, including the 3 new minute tests and all 8 existing invalid-input rejection cases (`test_rejects_invalid`).
- Direct interpreter checks of `parse_duration` against the exact issue examples plus hours-only/seconds-only cases.
- `git diff` review confirming the fix is a single-constant change — the parsing grammar/logic is unmodified, satisfying acceptance criterion 3.

**Uncertain / not done:**
- Nothing outstanding against the stated acceptance criteria. The fix isn't committed to git or pushed — I didn't do that since it wasn't requested and settling/landing isn't within an unprompted executor's authority.

**Final Tallyback state:** Task `tsk_01a0d885-e579-7707-a5bf-7d02489962d8` is fully tracked through declare → dispatch → observe → verify → settle. Verdict: all 4 criteria `supported`, confidence `high`. Settlement: `accept` (not `land`, since the change is still uncommitted working-tree state). Ledger summary: 1 task, 0 blocked, 1 settled, 0 stale.