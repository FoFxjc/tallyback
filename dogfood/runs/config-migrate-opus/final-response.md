The migration now keeps the user's `custom` section and any other keys. The fix is committed as `06e0223` on a new branch, `fix/preserve-user-keys`, and I haven't merged it to `main`. The Tallyback task is settled as **`accept`** (verified, not ready to land).

**What changed**
- **The cause:** in `cfgmigrate/migrate.py`, the v1→v2 step built a brand-new dict with only `version`, `request_timeout` and `plugins`, so every other key was dropped.
- **The fix:** it now deep-copies the input and only changes what it has to. It renames the top-level `timeout` to `request_timeout`, sets `version` to 2, and adds an empty `plugins` list if there isn't one (the old behaviour).
- **Extra safety change:** for a config that's already v2, `migrate()` used to hand back the caller's own object, so editing the result would change the input. It now returns a copy.
- **Four new tests** in `tests/test_migrate.py`:
  - the exact example from `ISSUE.md`;
  - unknown keys kept at any depth, including a nested `timeout` that must not be renamed;
  - the input isn't changed, even when you edit the result afterwards;
  - a v2 config's result doesn't share objects with the input.

**What was verified**
- The full test suite passes: 14 tests.
- With the new tests run against the original code, all 4 of them fail and the other 10 pass. So they catch this bug.
- I separately parsed the issue's YAML with PyYAML and migrated it. The output exactly matches the expected YAML, and the input was unchanged and shared no objects with the result.

**Still uncertain**
- Criterion 3 says "recursively". I read that as keeping nested user data exactly as it is, with only the top-level `timeout` renamed. If a nested `timeout` was meant to be renamed too, that's a different spec.
- The copy step requires config values to be copyable. That holds for plain parsed YAML, which is what the module says it handles.

**Tallyback**
- **Final state:** `settled: accept`, and `tallyback validate` reports no conflicts.
- **Why `accept` and not `land`:** you didn't ask me to merge, so I haven't authorized integration.
- **Criteria:** a verdict marks all five as supported, with high confidence. It cites two recorded test runs (after the fix, and the new tests against the original code). The attempt is ended as `returned`.
- **Tracking gaps:**
  - My first declaration had no criteria and was superseded. My first claim cited no evidence, and I replaced it.
  - I closed one check without a verdict, because I couldn't work out its input format. The verdict came from the `tallyback verdict` command instead.
  - `tallyback watch` reported one unresolved item: I registered the workspace without a branch name, so Tallyback can't track branch movement for it.
- **Tallyback's docs:** the installed help doesn't list per-command flags and points to the package's README. I read only that README and its quick-start page, not the source code.
- **`.tallyback/` (the ledger folder):** left uncommitted in the repo, since committing it wasn't part of the fix.

If you want this merged, say so and I'll record a `land` decision that replaces the `accept` and run `tallyback land`. That only checks the branch is ready to merge; the merge itself happens outside Tallyback.