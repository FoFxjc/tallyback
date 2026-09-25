Task settled (`next_action: "settled: accept"`). Here's the summary:

**What changed**

`batcher/chunk.py` had a bug where an item larger than `max_bytes` was silently dropped: the code flushed the current batch and then `continue`d without ever appending the oversized item to any batch. Fixed by emitting the oversized item as its own single-item batch before continuing, and guarded the batch-flush with `if current:` so a *leading* oversized item doesn't also produce a spurious empty batch (a latent second defect on the same code path, uncovered while fixing the first).

`tests/test_chunk.py` gained 3 regression tests: `test_leading_oversized_item_does_not_produce_empty_batch`, `test_consecutive_oversized_items_each_get_own_batch`, and `test_no_batch_is_ever_empty`, alongside the pre-existing `test_oversized_item_is_emitted_alone`.

**What was actually verified**

Ran the full local suite (`python -m pytest -v`, only test file in the repo, per `pytest.ini`'s `testpaths = tests`): 11 passed, 0 failed — including the previously-failing test and all new ones. Each of the 6 acceptance criteria from ISSUE.md was individually mapped to a specific passing test and recorded in a Tallyback Verdict (`supported`, high confidence).

**Uncertain / out of scope**

- No CI or integration test against the actual upload worker was run — verification is at the `chunk()` unit level only, since that's the scope ISSUE.md defines.
- Work sits on a new local branch `fix/chunk-oversized-item`, uncommitted. I did not commit, push, or merge — that wasn't requested, so I settled the Tallyback task as `accept` rather than `land` (landing/merging is beyond an executor's authority without an explicit ask). Let me know if you'd like me to commit and/or open a PR.

**Final Tallyback state**: Task `tsk_01a0d843-7fa4-76a8-ba97-38f819bd711c` is settled with decision `accept`, backed by a `supported`/high-confidence Verdict covering all 6 declared criteria — `next_action: "settled: accept"`.