# Audit — retry-worker × Sonnet (`claude-sonnet-5`)

444 s · 91 turns · 89 tool calls · 72 Tallyback invocations, **41 failed/rejected** · $1.83 · no intervention

## Reality → ledger reconstruction

| Layer | What is actually true | Source |
| --- | --- | --- |
| Repository / tests | Both defects fixed in one edit, **before** the ledger was initialised. Added one test (consecutive oversized items; fails on seed). Visible 10/10. **Oracle 20/20.** Ran the suite pre-fix (7 passed, 2 failed) and post-fix. | `tests/`, transcript #8-13 |
| Git | **Uncommitted** on `main`. | `git/status.txt` |
| Declarations | Two criteria-less declarations (one from an unrecognised flag creating a conflicting head), then one with 6 criteria. | ledger |
| Attempts | #1 dispatched after the work was done; ended `returned` so that **#2** could cite the criteria-bearing declaration. #2 represents no new work. **Not a retry in the fixture's sense.** | ledger, transcript #70-73 |
| Claims | Two accurate claims, **no evidence linked**. | ledger |
| Evidence | `artifact {}` (empty), `test_run {exit_code: 0}` ×2. | ledger |
| Check results | **`check_failed`** (recorded while probing flags; the model noted in-session "incorrectly recorded a `check_failed` result… even though tests actually pass") and `verdict_emitted`. | ledger, transcript #61 |
| Verdict | `supported / final / high`, 6/6; rationale describes code reading + trace of flush conditions + suite. | ledger |
| Settlement | **`land`** on uncommitted code. | ledger |
| `view` vs `land` | `view`: `ready_to_land: true`. `land`: `git_unresolved` / `land.workspace_branch_missing`. | transcript #89 |

## Divergences

1. **`ready_to_land: true` with nothing committed** — the ledger projection says more than Git; the report repeats `ready_to_land: true` and calls the Land failure "a bookkeeping gap".
2. **False `check_failed`** remains in the ledger; acknowledged mid-session, **omitted from the final report**.
3. **Self-authorised `land`** without a merge request, on an uncommitted working tree.
4. Attempt #2 exists only to satisfy claim/declaration consistency.

## Dimensions

- **Task correctness**: correct; one regression test added (criterion 6 met, minimally).
- **Ledger correctness**: right conclusion, false `check_failed`, projection overclaims readiness.
- **Epistemic honesty**: good on code (pre/post runs, logic trace, admits "no dedicated test" for a criterion); weak on ledger state.
- **Lifecycle semantics**: bends Attempt and CheckResult to satisfy the CLI; treats `land` as the natural terminal state.
- **Retry semantics**: n/a (fixed both defects first time); its two Attempts are not a retry.
- **Friction**: 41/72 failed — highest failure count with Sonnet's tiny-cache run.
- **Evidence quality**: Evidence records carry no content; the Verdict rationale carries it.
- **Settlement quality**: premature `land`.
- **Product usefulness**: `tallyback land` told the truth (`git_unresolved`); `view`'s `ready_to_land` did not.
