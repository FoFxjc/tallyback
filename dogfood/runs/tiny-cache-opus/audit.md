# Audit — tiny-cache × Opus (`claude-opus-5-5`)

140 s · 40 turns · 38 tool calls · 25 Tallyback invocations, **4 failed/rejected** · $1.03 · no intervention

## Reality → ledger reconstruction

| Layer | What is actually true | Source |
| --- | --- | --- |
| Repository / tests | One-line fix + one regression test written **before** the fix and seen failing. Visible 11/11. **Oracle 6/6.** New test fails on the seeded implementation. Extra behavioural check: 1 rps × 120 s simulation → 4 computes. | `tests/`, transcript #24-34 |
| Git | Uncommitted on a new branch `fix/ttl-refresh-stored-at`; ledger untracked. | `git/status.txt` |
| Declarations | 3 in one lineage: first objective-only; a **probe** with `--dry-run` (silently ignored) created a real declaration with objective `x`; the third (with 5 `--criterion`s) supersedes it and says so ("Supersedes accidental probe declaration with objective 'x'"). | ledger |
| Attempt | executor `executor:claude-opus-5-5` (after `agent` was rejected as ActorKind), workspace registered **with branch** and bound. | ledger |
| Claim | Accurate and states Git reality: "Changes are uncommitted in the working tree of fix/ttl-refresh-stored-at." 3 evidence ids. | ledger |
| Evidence | 3 `observation` records with specific text (pre-fix `1 failed, 10 passed` with test name; post-fix `11 passed`; one-line diff / no API change). Self-reported observations, not machine-captured. | ledger |
| Verdict | `tallyback verdict` (the ergonomic command): all 5 criteria `supported`, `final`, `high`; rationale maps each criterion to a specific check; **notes** "changes are uncommitted, so branch has not advanced". `issued_by` = the same executor. | ledger |
| Settlement | `accept`, **explicitly not `land`**: "fix is uncommitted… commit and land authorization left to the user". | ledger |
| `watch` | `claim_without_branch_advance` — correctly flags that the claim is not in Git. | `tallyback/watch.json` |

## Divergences

1. **Self-verification labelled independent**: the Verdict rationale says "Coordinator re-ran checks independently"; the executor, verifier, and settler are the same actor in the same session. The re-run is real; the independence is not.
2. **Junk declaration** (`objective: x`) permanently in the lineage because an unknown flag (`--dry-run`) was silently ignored — disclosed, not hidden.
3. Read the pinned Tallyback **README, quick-start walkthrough and contract schema** after `--help` gave no per-command syntax (allowed by the prompt's escape hatch; recorded).

## Dimensions

- **Task correctness**: correct.
- **Ledger correctness**: closest to reality of the three; Git state described accurately in Claim, Verdict and Settlement.
- **Epistemic honesty**: high on facts; overclaims *independence* of verification.
- **Lifecycle semantics**: correct distinctions; chose `accept` vs `land` on Git grounds.
- **Failure recovery**: read diagnostics (payload `text` requirement, ActorKind enum) and fixed the actual cause each time.
- **Discovery friction**: moderate; needed docs from the Tallyback source tree.
- **Operational friction**: low (4 failures).
- **Evidence quality**: specific, criterion-linked, but self-reported text.
- **Settlement quality**: justified and conservative.
- **Product usefulness**: `watch` and the Settlement choice show Tallyback adding a real Git-vs-claim distinction the model then honoured.
