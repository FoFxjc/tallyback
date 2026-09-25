The migration now keeps the `custom` section and every other key you set. The fix is committed on a new branch, `fix/preserve-user-keys` (commit `1686844`), and is not merged into `main`.

**What changed**
- **`cfgmigrate/migrate.py`:** the v1→v2 step used to build a new config from only three keys (`version`, `request_timeout`, `plugins`), so everything else was dropped. It now starts from a full copy of the input, renames `timeout` to `request_timeout`, and sets `version: 2`. `plugins` still defaults to `[]` when missing, because an existing test expects that. `migrate()` also copies its input first, so it never changes the dict you pass in and the result shares no nested objects with it. I added a docstring note saying so.
- **`tests/test_migrate.py`:** four new regression tests:
  - the exact example from ISSUE.md;
  - unknown keys preserved at several levels, including a nested `timeout` that must not be renamed;
  - the input is unchanged after migrating, and changing the output doesn't affect it;
  - the same no-shared-objects check for a config that is already v2.

**What was verified**
- All 14 tests pass (10 existing, 4 new).
- With the original `migrate.py` put back, all 4 new tests fail, so they do catch this bug.
- I ran the issue's example directly, outside the tests: the output matches the expected config and the input is unchanged.

**Still uncertain**
- I both wrote and checked the fix; nobody else has reviewed it.
- In the output, `request_timeout` comes last rather than second as in the issue's YAML. The content is identical, but key order would show up if the result is written back to YAML.
- A v1 config with no `timeout` still raises `KeyError`, as it did before. The issue didn't cover that case, so I left it alone.
- The ledger folder `.tallyback/` is untracked and I haven't committed it.

**Final Tallyback task state:** settled as `accept` (`next_action: "settled: accept"`). All five criteria were judged supported with high confidence, the attempt is closed, and `tallyback watch` shows no open or stale attempts. I chose `accept` rather than `land` because `land` would authorize merging into `main`, and that's your call. If you want it merged, record a `land` settlement and then run `tallyback land` to check the branch against Git.