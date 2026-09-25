The minutes bug is fixed and the new tests confirm it: `"30m"` now gives 1800 seconds instead of 108000. The changes are not committed.

**What changed** (on a new branch, `fix/duration-minutes`)
- **Cause:** in `durations/parse.py:13`, `_UNIT_SECONDS` mapped `"m"` to 3600 instead of 60, so every minute counted as an hour. That one number is the only change to the parser. The pattern, unit order and validation are untouched.
- **Tests:** `tests/test_parse.py` now has `test_minutes` (`30m`, `1m`, `1h30m`, `2h15m30s`, `5m10s`) and `test_rejects_invalid_minutes` (`30m1h`, `1m1m`, `5s1m`, `1m 5s`).

**What I verified**
- `python -m pytest -q`: all 20 tests pass with the fix. That covers the three values in the issue (1800, 5400, 8130), the existing hours-only and seconds-only tests, and all invalid inputs, old and new, still raising `InvalidDuration`.
- With the old `parse.py` temporarily restored, all 5 new minutes tests fail and the other 15 pass. So the new tests do catch this bug.
- `git diff` confirms the change to `parse.py` is only that one value.

**Still uncertain / not done**
- I wrote the fix and checked it myself; nobody else has reviewed it. The Tallyback verdict records this as a limitation.
- I didn't commit, merge or push anything. `.tallyback/`, where Tallyback keeps its records, is a new untracked folder in the repo, so you may want to commit it or add it to `.gitignore`.
- I didn't check the job-runner code that reads `timeout: 30m`, because it isn't in this repo. The fix is only verified at the `parse_duration` level.

**Final Tallyback state**
- The task is settled as **`accept`**.
- The verdict marks all four acceptance criteria as supported, with high confidence, based on three pieces of evidence: the two test runs and the diff.
- Status: verified and settled, but not `ready_to_land`. I didn't choose `land` because nothing is committed and nobody asked me to integrate the change. After you commit, a `land` settlement would authorize merging it.