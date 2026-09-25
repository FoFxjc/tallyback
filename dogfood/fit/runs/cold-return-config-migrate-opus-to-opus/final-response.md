The bug is fixed: migrating a v1 config now keeps the `custom` section and every other user key. All 14 tests pass, and the 4 new tests fail on the old code. I settled the Tallyback task as **accept**, not land. Nothing is committed yet.

**How I found it:** a Tallyback task and an open attempt were already in progress, and the fix plus new tests were already in the working tree, uncommitted. Rather than trust that, I checked the changes myself, did my own fit check (recorded as replacing the earlier one) and re-verified everything.

## What changed
- **`cfgmigrate/migrate.py`**
  - The v1→v2 step now copies the config key by key. It renames `timeout` to `request_timeout`, keeps every other key in its original order, sets `version: 2`, and still defaults `plugins` to `[]` when it's missing.
  - `migrate()` works on a deep copy, so it never changes the caller's config and the result doesn't share any nested lists or dicts with it.
- **`tests/test_migrate.py`**: 4 new tests:
  - unknown and nested keys are preserved;
  - the exact example from `ISSUE.md`;
  - the input isn't changed and the result doesn't share nested containers with it;
  - the same for a config that's already v2.

## What was verified
- **With the fix:** `python3 -m pytest -v` gives 14 passed.
- **Against the old code** (old `migrate.py`, new tests kept): 4 failed, 10 passed. All 4 new tests fail, so they really catch this bug.
- **Direct check:** I ran `migrate()` on a config with deeply nested user data.
  - `timeout` is gone, `request_timeout` is 30 and `version` is 2.
  - The nested data comes through unchanged.
  - The input is unchanged after the call, and the result shares no nested containers with it.
- All five acceptance criteria are marked as met, each tied to the test runs and the direct check.

## Still uncertain
- **Missing `timeout`:** a v1 config without `timeout` used to crash with a `KeyError`; now it migrates without a `request_timeout`. The issue doesn't cover this, so I left it.
- **Both keys present:** if a v1 config has both `timeout` and `request_timeout`, whichever comes later in the file wins.
- **Self-check:** I verified my own work (well, the previous session's, re-checked by me). No second reviewer has looked at it.

## Final Tallyback state
- Task `tsk_01a0d84f-…` is settled as **accept** (`set_01a0d851-3eae-…`). It is not ready to land.
- The attempt ended with outcome "returned", and `tallyback watch` shows no open or stale attempts.
- I chose accept over land because the change is only in the working tree on `fix/migrate-preserve-keys`, and deciding to merge is up to you.
- To land it: commit the change, record a `tallyback settle --decision land` that replaces the accept, then run `tallyback land` to check it against Git.