## Summary

**What changed** (`cfgmigrate/migrate.py`): `_v1_to_v2` used to rebuild a fresh dict from a fixed key set (`version`, `request_timeout`, `plugins`), silently dropping everything else — including the `custom` block from the issue. It now shallow-copies the input (`new = dict(old)`), renames `timeout` → `request_timeout`, sets `version = 2`, and defaults `plugins` — so every other key, at any nesting depth, survives because it was never removed in the first place. The original dict is never touched (all mutation happens on `new`).

I found this fix already present as uncommitted changes from an earlier attempt on this same Tallyback task. Per the task instructions I didn't take that on faith — I independently re-verified it against each acceptance criterion, then added one more regression test (`test_preserves_deeply_nested_and_multiple_unknown_keys`) covering two-level nesting, a list, and multiple unrelated top-level keys, since the existing test only exercised one level of nesting against the "recursively" wording in criterion 3.

**What was verified**:
- Full test suite: 13/13 pass (`python3 -m pytest tests/ -v`).
- Manual script probe (outside pytest) with a deeply nested `custom.nested.deep` structure confirming: output is a distinct dict object, input dict compares equal to a pre-call snapshot (unmutated), and nested values survive intact.
- All 5 declared criteria (rename, version, preserve, immutable, test) individually assessed as `supported` with high confidence in a Tallyback verdict.

**Uncertain / left as-is**: nested containers (e.g. `custom`) are shared by reference between input and output rather than deep-copied. This satisfies the stated criteria (input isn't mutated by migration, and nothing is lost), but a caller that later mutates the migrated output's nested dicts in place would also affect the original input. Nothing in the issue or migration logic touches nested structures, so I didn't add deep-copying — flagging it in case stricter aliasing safety is wanted later.

**Not done**: changes remain uncommitted in the working tree — I didn't commit/push since that wasn't requested.

**Final Tallyback state**: Task `tsk_01a0d84a-…` is `settled: accept` (verified, not landed) — Declaration → Attempt → Decision (FIT, superseding an earlier session's decision) → Evidence (test run + manual observation) → Claim → Verdict (all 5 criteria `supported`, high confidence) → Settlement (`accept`). I stopped short of `land` since merging/integration wasn't asked for.