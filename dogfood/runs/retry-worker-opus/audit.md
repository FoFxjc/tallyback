# Audit — retry-worker × Opus (`claude-opus-5-5`)

163 s · 43 turns · 41 tool calls · 17 Tallyback invocations, **1 failed/rejected** · $1.01 · no intervention

## Reality → ledger reconstruction

| Layer | What is actually true | Source |
| --- | --- | --- |
| Repository / tests | Identified **both** defects before editing; fixed in one edit. Added 3 regression tests + a 2000-case property test; **all fail on the seed** (5 failed incl. the 2 originals). Visible 13/13. **Oracle 20/20.** Independent 50,000-case property check in a fresh clone. | `tests/`, transcript #22-36 |
| Git | Committed `6f6bc1c` on `fix/chunk-oversized`; not merged. | `git/log.txt` |
| Declarations | A probe `--objective "x"` created a junk declaration (the same probe pattern as tiny-cache-opus; 2 of 3 Opus runs); superseded by one with 6 criteria. Disclosed in-session. | ledger |
| Attempt | One Attempt on a branch-bound workspace; ended `returned` with reason "Fix committed at 6f6bc1c on fix/chunk-oversized". | ledger |
| Evidence | **`git_commit`** (repo + object id — inspectable), `test_run` with repository/workspace context, two `observation`s (pre/post counts naming the failing tests; the fresh-clone property check). | ledger |
| Claim | Accurate; 3 evidence ids. | ledger |
| Verdict | `supported / final / high` 6/6; basis = 4 evidence records; rationale names the pre-fix failures and the independent check. | ledger |
| Settlement | `accept` with basis Verdict **and** AttemptEnd — "Merge to main left to the maintainer". | ledger |
| Source access | Read the pinned README, `src/cli.ts`, and the records schema to learn flags and evidence payload shapes. | transcript #11-35 |

## Divergences

1. Junk `objective: x` declaration (probe) in the lineage.
2. All records attributed to `tool:tallyback` (no `--actor`).
3. Nothing else material: Git, tests, evidence, Verdict, and Settlement agree.

## Dimensions

- **Task correctness**: correct, strongest tests.
- **Ledger correctness**: matches reality; best evidence of the benchmark (a Git object id).
- **Epistemic honesty**: high; proved tests fail on the seed; independent clone check.
- **Lifecycle semantics**: correct; Settlement cites both Verdict and AttemptEnd.
- **Retry semantics**: n/a — no incomplete first fix, so one Attempt was the honest record.
- **Friction**: lowest Tallyback call count of all nine runs (17) — but only after reading Tallyback's source.
- **Evidence quality**: excellent.
- **Settlement quality**: justified, conservative.
- **Product usefulness**: the ledger is a faithful, reusable accountability trail; the cost was source-level discovery.
