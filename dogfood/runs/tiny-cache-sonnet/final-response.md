## Summary

**What changed:**
- `tinycache/cache.py`: one-line fix — on cache-entry expiry, `entry.stored_at = now` is now set alongside the recomputed `entry.value`. Previously, the refresh path updated the value but left the old `stored_at` timestamp in place, so the entry was still treated as expired on the very next call, causing `load_user` to be recomputed on nearly every request instead of once per TTL window.
- `tests/test_cache.py`: added `test_refreshed_entry_stays_cached_until_new_ttl_expires`, which loads, lets the entry expire and refresh, then checks it's served as a cache hit for another 29s and only expires again after the full new 30s TTL.

**What was actually verified:**
- Full test suite: 11/11 passing (`python -m pytest tests/ -v`).
- Confirmed the new regression test fails on the pre-fix code (via `git stash` on just `cache.py`) and passes after the fix — it genuinely detects the bug rather than being vacuous.
- Confirmed no public API changes: `ttl_cache`'s signature, `cache_info()`, and `cache_clear()` are untouched; the diff to `cache.py` is a single added line inside the existing expiry branch.
- All 5 acceptance criteria from ISSUE.md were individually reconciled against evidence (test run + code diff) and recorded in a Tallyback Verdict.

**Anything uncertain:** None — this was a small, self-contained fix and all stated acceptance criteria are directly testable, which the added test does.

**Final Tallyback state:** Task `tsk_01a0d74d-645d-7283-8607-716318f220b7` ("Fix expired ttl_cache entries not staying cached after refresh") is fully closed: verified (Verdict `ver_524e1920...`, conclusion `supported`, all 5 criteria assessed as supported) and settled with decision **`accept`**. `tallyback view` reports `next_action: "settled: accept"`, 1/1 tasks settled, 0 blocked, 0 stale.

One process note: the CLI's `--criterion` flag (`code:statement`) and the `record-check`/`verdict` JSON schemas required several rounds of error-driven discovery, including one detour where I superseded the initial (criteria-less) declaration and had to re-dispatch a fresh attempt/claim under the corrected declaration — that's reflected in the ledger as two attempts, the first ended with outcome `returned`.