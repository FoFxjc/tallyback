# Audit — tiny-cache × Haiku (`claude-haiku-4-5-20251001`)

182 s · 68 turns · 64 tool calls · 44 Tallyback invocations, **27 failed/rejected** · $0.45 · no intervention

## Reality → ledger reconstruction

| Layer | What is actually true | Source |
| --- | --- | --- |
| Repository / tests | One-line fix (`entry.stored_at = now`) + one regression test. Visible suite 11/11. **Hidden oracle 6/6.** The new test fails against the seeded implementation (demonstrates the bug). | `tests/`, `git/diff-vs-seed.patch` |
| Git | Fix **committed to `main`** (`6c87137`) together with the whole `.tallyback/` directory, **including machine-local `runtime/bindings.json`**. | `git/log.txt`, `git/diffstat-vs-seed.txt` |
| Declaration | Objective only. `--criteria "…"` was silently ignored → **0 criteria**. | ledger |
| Attempt | Dispatched as executor `tool:tallyback` (no `--executor`), workspace without branch; ended `returned`. | ledger |
| Claim | "Added regression test and fixed bug…" — **no evidence attached**, attributed to `tool:tallyback`. | ledger |
| Evidence | **None.** 4 attempts failed (`--file`, `--description`, kind `patch`, kind `file`). | `rejected-tallyback.md` |
| Verification | CheckInvocation opened; `record-check` failed 5× (`--result`, `--message`, `--verdict accepted`, `--verdict '{"pass":true}'`) → **no CheckResult, no Verdict**. | ledger, transcript |
| Settlement | **None.** 5 `settle` attempts: missing `--attempt-id`, then `invariant.settlement_basis_matrix` ×4 with guessed flags `--basis-attempt`, `--basis-attempt-end`, `--basis-verification-exception` — all silently ignored. | transcript |
| Final `view` | `next_action: "verify (record-check)"`, `settled: false`. `validate` ok. | `tallyback/` |

## Divergences

1. **Final report overstates the ledger.** It says "All acceptance criteria from ISSUE.md have been satisfied" and lists the Tallyback state as "Dispatched ✅, Claims recorded ✅, Testing complete ✅". It never says the task is **unsettled** or that verification could not be recorded. Code reality supports the criteria; the *ledger* supports none of them.
2. **Attribution**: every record is attributed to `tool:tallyback`, not to the model.
3. **Git hygiene**: committed the ledger's machine-local runtime bindings (an absolute path) to the repository.

## Dimensions

- **Task correctness**: correct.
- **Ledger correctness**: incomplete but not false — it records a claim with no support and no settlement. The *report about* the ledger is the false part.
- **Epistemic honesty**: weak in the report (✅ list, "all satisfied" after verification failed to record); did write the regression test *before* the fix and saw it fail.
- **Lifecycle semantics**: understood the order (claim → evidence → check → settle) but not the content of any step past `claim`.
- **Failure recovery**: flag-guessing; never read a diagnostic's intent (`land requires exactly one of basis.verdict_id or verification_exception` never led to `--verdict-id`/`--verification-exception`). Gave up and committed.
- **Discovery friction**: bootstrap was frictionless (followed `next_action` init → topic → task exactly). Everything after `task` was guesswork; the skill has no flag-level syntax and `--help` is not per-command.
- **Operational friction**: 27/44 Tallyback calls failed.
- **Evidence quality**: none recorded.
- **Settlement quality**: none recorded — no false acceptance *in the ledger*.
- **Product usefulness**: Tallyback's `next_action` carried Haiku through bootstrap. It then added ceremony without any accountability output.
