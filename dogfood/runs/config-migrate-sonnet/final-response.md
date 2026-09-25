## Summary

**What changed** (`cfgmigrate/migrate.py`, `tests/test_migrate.py`, on branch `fix/config-migration-preserve-keys`, commit `1b0a027`):

The v1→v2 migration (`_v1_to_v2`) built a brand-new dict containing only `version`, `request_timeout`, and `plugins`, silently discarding any other key (e.g. `custom`). Fixed by deep-copying the input, renaming `timeout`→`request_timeout` on the copy, setting `version = 2`, and defaulting `plugins` to `[]` only if absent — everything else in the document, including nested structures, passes through untouched. Deep-copying also guarantees the original input object (and its nested containers) is never mutated.

Added three regression tests: unknown top-level key preservation, recursive/nested key preservation, and non-mutation of the input.

**What was actually verified**:
- Full test suite: 13/13 pass (`python -m pytest -v`), including the 3 new tests and all 10 pre-existing ones.
- Manually reproduced the exact example from `ISSUE.md` in a standalone script: migrating `{version:1, timeout:30, plugins:[foo], custom:{owner:peter}}` yields exactly `{version:2, request_timeout:30, plugins:[foo], custom:{owner:peter}}`, and confirmed the original input dict was byte-for-byte unchanged after the call.
- Each of the 5 acceptance criteria was mapped to a specific test and re-run in isolation to confirm it individually passes, before recording the Tallyback verdict.
- `tallyback land` independently cross-checked the settlement against live Git state and reports `git_ready`, confirming the branch diff touches exactly `cfgmigrate/migrate.py` and `tests/test_migrate.py`.

**Uncertain / minor housekeeping note**: while driving the Tallyback loop I made two early missteps — an accidental stray declaration (resolved via `--supersedes`) and a first attempt whose workspace was never bound to a Git branch, which left a dangling `unresolved`/`git_unresolved` entry in the `land` report for a superseded settlement. I dispatched a corrected attempt with a properly branch-bound workspace and re-settled against that; the *current* settlement for the task is `git_ready`, but the ledger still carries the earlier unresolved settlement as history. This doesn't affect code correctness (verified above) but is worth knowing if you inspect the raw ledger.

**Final Tallyback state**: Task `tsk_01a0d754-767f-7305-b41f-56bf31eb4aa0` — `verified: true`, `settled: true`, `ready_to_land: true`, verdict `supported` (high confidence, all 5 declared criteria: rename, version, preserve, immutable, coverage), settlement decision `land`, `next_action: "settled: land"`. Not pushed or merged — that step is outside Tallyback's scope and wasn't requested.