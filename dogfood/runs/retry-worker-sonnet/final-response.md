## Summary

**What changed:**
`batcher/chunk.py` — `chunk()` had a bug in its oversized-item handling. When an item's size exceeded `max_bytes`, the code flushed the current batch and then `continue`d without ever appending the oversized item to any batch — silently dropping it. This matches the issue exactly ("upload worker occasionally reports fewer uploaded payloads than it received").

Fix: an oversized item now flushes the current batch (if non-empty), then is appended as its own single-item batch, before moving on to the next item. Also added `tests/test_chunk.py::test_consecutive_oversized_items_each_emitted_alone` as an additional regression test (two back-to-back oversized items, each must land in its own batch — a case the original two failing tests didn't cover).

**What was actually verified:**
- Ran the full suite before the fix: 7 passed, 2 failed (`test_oversized_item_is_emitted_alone`, `test_oversized_first_item`), confirming the reported defect.
- After the fix: `python -m pytest -v` → **10/10 passed**, including the new regression test.
- Manually traced the flush logic to confirm no branch can append an empty list to `batches` (both flush sites require `current` non-empty or size validation `max_items/max_bytes >= 1`), satisfying the "no empty batches" criterion, which has no single dedicated test but is covered analytically and by all existing tests never producing one.
- Cross-checked all 6 acceptance criteria from ISSUE.md individually against code + test evidence before issuing the Tallyback verdict.

**Anything still uncertain:**
- Nothing about the fix itself — it's small, fully covered by tests, and I checked the logic by hand.
- Tallyback's `land` report flags `land.workspace_branch_missing` (the registered workspace has no git branch bound) — this is a bookkeeping gap in how I registered the workspace in the ledger, not a defect in the code fix. The working tree has the uncommitted edits on `main` as normal (no branch/commit was made, since you didn't ask me to commit).

**Final Tallyback state:**
Task `tsk_01a0d757-93cb-768a-9c51-2a9a1df412d9` ("Fix chunk() dropping oversized items") — `verified: true`, `settled: true`, `ready_to_land: true`, settlement decision **`land`**, backed by a high-confidence Verdict (`ver_01a0d75c-bbb9-...`) with all 6 declared criteria assessed `supported`. `next_action: "settled: land"`.

I have not committed or pushed anything — the fix and tests are in the working tree, ready for you to review/commit.