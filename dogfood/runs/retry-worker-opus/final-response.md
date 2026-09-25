I fixed the bug that made the upload worker lose payloads, and the full test suite passes (13 tests). The fix is committed as `6f6bc1c` on a new branch, `fix/chunk-oversized`, and has not been merged into `main`.

## What changed
`batcher/chunk.py` had two bugs:
1. **An item larger than `max_bytes` was silently dropped.** The code closed the current batch and then skipped the item. This is what lost payloads.
2. **Empty batches were produced.** An oversized item arriving when no batch was open (for example, as the first item) caused an empty `[]` batch to be emitted.

Now a batch is only closed if it has something in it, and an oversized item always goes out alone in its own batch.

In `tests/test_chunk.py` I added:
- a test for two oversized items in a row;
- a test for an oversized item arriving right after a full batch;
- a test for items just under the byte limit;
- a randomized test that runs 2,000 cases and checks all five rules from the issue on each.

## What I verified
- **The new tests catch the bugs.** Against the original `chunk.py` they give 5 failed, 8 passed: the 2 tests that were already failing plus 3 of mine. With the fix, all 13 pass.
- **The one exception:** the "just under the byte limit" test also passes on the old code. It checks the boundary but is not a regression test, and I named it that way.
- **A separate check in a fresh clone of the commit:** 13 passed, plus 50,000 random cases (including a generator as input) that met all five rules.
- **The README example still gives the documented output.**

## Still uncertain
- The same agent wrote and checked the fix; nobody else reviewed it. This is recorded in the verdict.
- Batches are filled greedily. The issue doesn't require the fewest possible batches, so I didn't check that.
- The `.tallyback/` ledger folder is untracked. I didn't commit it or add it to `.gitignore`.

## Tallyback
- **Final state:** `settled: accept`. `view` shows verified and settled, `watch` shows no open attempts, and `validate` reports no problems.
- **Why `accept` rather than `land`:** `land` would authorize merging into `main`, and you didn't ask for that.
- **Placeholder record:** the skill doesn't give flag syntax. While I was finding it, a test command recorded a declaration with the placeholder objective "x". I replaced it with a proper declaration listing the six acceptance criteria (`--supersedes`), but the ledger is append-only so the old record is still in the history.
- **Reading Tallyback's source:** I then looked at Tallyback's `src/cli.ts` and contract schema, but only to get the flag names.