The bug is fixed: an expired value is now recomputed and then stays cached for a full new TTL. All five acceptance criteria were checked, and Tallyback shows the task as `settled: accept`.

## What changed
- **`tinycache/cache.py`** (one line): when an expired entry was recomputed, its new value was saved but its timestamp wasn't. Every later call still looked expired and recomputed again. The fix adds `entry.stored_at = now` in that branch.
- **`tests/test_cache.py`**: a new regression test, `test_refreshed_entry_stays_cached_for_a_new_ttl`. It checks that the refreshed value is still served 1s and 29s after the refresh, that hit/miss counts are right, and that it recomputes at 30s.

## What was verified
- **The test catches the bug:** with the fix removed, the new test fails (1 failed, 10 passed), because the call 1s after the refresh recomputed.
- **The suite passes:** with the fix, all 11 tests pass, including the 10 existing ones.
- **The production pattern from the issue:** a script calling once per second for 120s with a 30s TTL computes the value 4 times, once per window, with 116 cache hits. Before the fix it recomputed on almost every call after the first expiry.
- **Public API unchanged:** the diff is limited to that one line plus the test. `ttl_cache`'s signature, `CacheInfo`, `cache_info`/`cache_clear` and `__all__` are untouched.
- **Ledger is consistent:** `tallyback validate` reports no problems.

## Still uncertain or left open
- **Nothing is committed.** The changes are only in the working tree on a new local branch, `fix/ttl-refresh-stored-at`. So `tallyback watch` flags "claim without branch advance", and the task isn't ready to land.
- **I settled as `accept`, not `land`.** Committing and authorizing integration are your decisions. If you want to land it: commit, then run `tallyback settle --decision land --supersedes set_01a0d74e-ddc4-75e8-96c7-2dec309db6a4 …`, then `tallyback land`.
- **One junk record in the ledger.** While looking for the right flag, a test command wrote a replacement task description with the objective "x" and no criteria. I replaced it with the correct one, which names it as the mistake. The history keeps both, but only the correct one is in effect.
- **Attempt left open.** I didn't run `tallyback end` on the attempt; the ledger didn't require it before settling.
- **Ledger not in git.** The new `.tallyback/` folder is untracked; commit it or ignore it as you prefer.
- **Minor design choice.** The refreshed entry is timestamped from the moment the call started, before the recompute runs, the same as a first-time cache miss. With a slow `load_user`, the new window is effectively shortened by the recompute time.

## Final Tallyback state
Task `tsk_01a0d74d-279e…` is `settled: accept`. Its verdict found all five criteria supported, with high confidence. Status is verified, not blocked and not ready to land.