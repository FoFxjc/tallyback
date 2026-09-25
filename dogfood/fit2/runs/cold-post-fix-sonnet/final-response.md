## Summary

**What changed:** `cfgmigrate/migrate.py`'s `_v1_to_v2` was rewritten to `copy.deepcopy(old)`, then mutate the copy (rename `timeout`→`request_timeout` via `pop`, set `version=2`, `setdefault("plugins", [])`) instead of building a fresh dict from just `timeout`/`plugins`/`version`. This preserves every other key (e.g. `custom`) recursively and independently, and never touches the caller's original object. `tests/test_migrate.py` gained three regression tests: unknown-key preservation, independent nested-copy behavior, and non-mutation of input.

Note: this working-tree diff already existed when I picked up the task (from a prior attempt on the same Tallyback Task). Per the workflow, I didn't take that on faith — I re-verified it myself from scratch as a fresh executor before accepting it.

**What was actually verified:**
- Full test suite: 13/13 passed (`python3 -m pytest tests/ -v`), including the 3 new regression tests.
- Manual repro of the exact YAML example from ISSUE.md: output matched the issue's expected result exactly, and the input dict was byte-for-byte unchanged (`deepcopy` equality check) after migration.
- All 5 acceptance criteria (rename, version bump, recursive preservation, no mutation, regression coverage) individually assessed `supported` with high confidence in a Tallyback Verdict.

**Uncertain / not done:** The fix is still uncommitted in the working tree — I did not `git commit`, push, or run `tallyback land`, since integration wasn't requested. Only a single migration step (v1→v2) exists in this codebase, so multi-hop migration mutation behavior is untested (not applicable here, but worth noting if the schema grows).

**Final Tallyback state:** Task `tsk_01a0d87d-5608-75b8-b738-175efd24f60b` is **settled: accept** (verified: true, settled: true, ready_to_land: false — land was intentionally not authorized).