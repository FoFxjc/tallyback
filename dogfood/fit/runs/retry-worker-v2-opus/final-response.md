I fixed the bug in `batcher.chunk`: payloads larger than `max_bytes` were being dropped. The full test suite passes (13 of 13), and the Tallyback task is settled as **`settled: accept`**.

**What changed**
- **`batcher/chunk.py`** had two defects:
  1. When an item was larger than `max_bytes`, the loop skipped it with `continue`, so it was never uploaded. This is the lost-payload bug.
  2. It closed off the current batch without checking whether it was empty. When the first item was oversized, or two oversized items came in a row, that produced an empty batch `[]`.
  
  Now the current batch is closed only if it has items and adding the next item would break the item or byte limit. An oversized item is always sent in a batch of its own.
- **`tests/test_chunk.py`**: added 5 regression tests. They cover an oversized item at the start, at the end, and twice in a row, and the item limit being hit just before an oversized item. The fifth test runs 2,000 random cases (fixed seed) and checks all five acceptance criteria on each result.

**What was verified**
- I ran the new tests against the original `chunk.py`: 6 failed, 7 passed. The failures were the test that ISSUE.md said was failing plus all 5 new tests, so they do catch the bugs.
- With the fix, `python3 -m pytest` gives 13 passed.
- The example in the README still returns `[[b'aa'], [b'bbb', b'c']]`.

**Still uncertain**
- I wrote the fix and also checked it; nobody else has reviewed it.
- ISSUE.md doesn't say what should happen with zero-length items; the fix doesn't change how they're handled.
- Nothing is committed. The changes are uncommitted on a new local branch, `fix/chunk-drops`. The Tallyback ledger folder `.tallyback/` is also new and not tracked by Git.

**Tallyback state**
I set up the ledger, recorded the six acceptance criteria and one attempt, and noted before starting that I could do and check this work. I then recorded three pieces of evidence: the test run before the fix, the run after it, and the diff. On top of those are my summary of the change and a review that finds all six criteria met, with high confidence. The task is `settled: accept`. `watch` shows no open or stale attempts.

I chose `accept` rather than `land` because you didn't ask me to commit or merge. `land` would mark the task ready to integrate, so the task is not in the ready-to-land list. If you want it merged, I can commit on `fix/chunk-drops` and record a `land` decision.