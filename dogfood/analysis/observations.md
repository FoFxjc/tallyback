# Observations and answers

Batch: 3 fixtures × 3 models, Tallyback pinned at `c2ff5eb`, benchmark design frozen at
`fa9d847`, no Tallyback change and no human intervention during the batch. Evidence:
`runs/*/`; per-run audits: `runs/*/audit.md`; cross-run tables:
[`model-comparison.md`](model-comparison.md), [`reality-ledger-divergence.md`](reality-ledger-divergence.md),
[`product-findings.md`](product-findings.md).

## Headline

All nine runs produced correct code by the hidden oracles (one missed the "add regression
tests" criterion). The accountability trails differed far more than the code did:

- **Haiku** could not get past the first step without a runnable command. Its ledgers are
  thin but mostly not false. Its reports claimed more than its ledgers (3/3).
- **Sonnet** reached every lifecycle stage. Getting there produced false or forged records
  (3/3): `check_failed` when nothing failed, tool provenance on model-written verdicts,
  placeholder Attempts, and self-authorised `land`.
- **Opus** produced ledgers that match reality (3/3), but only after reading Tallyback's
  docs or source (3/3).

## Answers

### 1. Mistakes that occur regardless of model capability

- The first declaration had **no criteria** (9/9, F1).
- Models relied on **silently ignored flags** (9/9; 8/9 got a wrong or junk record from it, F2).
- Required flags were discovered **by error** (9/9, F3).
- **Default `tool:tallyback` attribution** for the model's own records (8/9, F7).
- **Self-verification**: every Verdict was issued by the agent that did the work (6/6 Verdicts, F12).

### 2. The Tallyback concepts easiest to misuse

1. **Attempt**, used as a declaration re-binding device (Sonnet 3/3) and opened after the work (3/9).
2. **CheckResult outcome**, picked to close an invocation rather than to describe the check (false `check_failed` 2/9; `verdict_withheld` 2/9).
3. **Evidence**: exit codes and empty payloads stood in for criterion-level facts (8/9 hit schema limits).
4. **Settlement `land`**, treated as the natural terminal state rather than as an integration authorisation (Sonnet 2/3; Haiku attempted it 3/3).
5. **Provenance / actor**, left defaulted or forged (8/9).

### 3. Problems that disappear as capability increases

- Hundreds of blind flag guesses (61% → 42% → 15% failed Tallyback calls).
- Never mapping `basis.verdict_id` to `--verdict-id`: Haiku 3/3 unsettled; Sonnet and Opus 0/3.
- Reports that claim more than the ledger (Haiku 3/3, Sonnet 3/3, Opus 0/3).
- Weak regression tests (Haiku) and "green suite ⇒ all criteria" (Haiku only, config-migrate).

### 4. Problems that remain even for Opus

- Criteria-less first declarations (3/3) and junk probe declarations (2/3). Both follow from F1 and F2.
- Needing Tallyback's own docs or source to learn syntax (3/3).
- Default attribution (2/3).
- Self-verification presented as independent (tiny-cache).
- Ignored flags losing data: `--branch` on `dispatch` (config-migrate).

### 5. Does a stronger model use Tallyback more correctly, or merely need it less?

Both, with a caveat. Opus used it more correctly, with the fewest false records and the best
evidence. It also needed it least: it already proved pre-fix failures, checked Git state, and
separated `accept` from `land` in its reasoning. Sonnet is the counter-example to "stronger
means more correct". It pushed hardest to satisfy the ledger and wrote the most false records
doing so. Effort spent on Tallyback did not track accuracy.

### 6. Does Tallyback disproportionately help Haiku, Sonnet, or Opus?

- **Haiku**: helped only at bootstrap. It also _protected_ the ledger: the basis matrix
  blocked two unjustified settlements, and referential integrity blocked a forged id. It
  never helped Haiku produce an accountability trail.
- **Sonnet**: the most visible behavioural change (criterion-by-criterion Verdicts,
  pre/post runs), but also the most induced damage. Net value ambiguous.
- **Opus**: a faithful, reusable trail at low marginal cost. The discipline was largely
  Opus's own, and Tallyback recorded it well.

On this evidence Tallyback's _marginal_ value is highest for **Sonnet-level** agents, and
also the most two-sided there. Their behaviour changes, in both directions. It is lowest
for Haiku until F1-F3 and F8 are fixed.

### 7. Where Tallyback creates useful external discipline

- **Settlement basis matrix**: no Settlement without a Verdict or an explicit exception. It
  blocked "tests confirm all criteria" twice.
- **`land` / `watch` Git cross-checks**: `git_unresolved` and
  `claim_without_branch_advance` told the truth when the model and the projections did not.
- **Declared criteria → per-criterion Verdict**: once criteria existed, every Verdict
  assessed each declared criterion and named concrete checks in its rationale — but only in
  prose: `tallyback verdict` records content-free per-criterion findings (F15).
- **Bootstrap `next_action`**: 9/9 reached a tracked Task without error.

### 8. Where it creates unnecessary ceremony

- The whole `begin-check` → `record-check` path when `tallyback verdict` exists (F5).
- Re-dispatching Attempts after a declaration fix (F4).
- `end` before `settle` when the Attempt ended trivially.
- Sonnet spent 68-82% of its tool calls on Tallyback.

### 9. Product changes supported by repeated evidence (≥ 4/9, ≥ 2 models)

1. **Reject unknown flags** on every command, especially mutating ones (F2, 9/9).
2. **Per-command help/usage** listing required and optional flags and enums (F3, 9/9).
3. **Make criteria-less declarations visible at declare time**: a warning, a
   `next_action`, or require `--criterion` (F1, 9/9). Scope is a contract question; see Q12.
4. **Phase `next_action` → runnable command template** past bootstrap, in the same
   `{command, reason, requires}` shape (F10, 9/9).
5. **Settlement-basis diagnostic names the CLI flags** (`--verdict-id` /
   `--verification-exception`) (F8, 6/9).
6. **`record-check` errors: report the real first failure** (no "after 5 retries" on
   non-conflict errors) and point to `tallyback verdict` (F5, 6/9).
7. **Evidence kinds and payload shapes discoverable from the CLI**, and room in `test_run`
   for a result summary (F6, 8/9). The payload change is a contract question.
8. **Attribution**: require or strongly default the actor from the session instead of
   `tool:tallyback` (F7, 8/9).
9. **`tallyback verdict` per-criterion findings**: accept a per-criterion note and evidence
   refs instead of generating `"X: assessed as supported"` with empty basis (F15, 5/5 uses).

### 10. Is there evidence that Tallyback reduces reality/ledger divergence?

Not overall. Specific guards demonstrably prevented false records: the basis matrix,
referential integrity, `land`, and `watch`. But most false records in the batch were
_manufactured while satisfying the CLI_: false `check_failed`, forged tool provenance,
placeholder Attempts, junk declarations. Two overstatements were Tallyback's own
projections: `ready_to_land: true` on uncommitted work, and `next_action: "settle"` after a
withheld verdict. Detail in [`reality-ledger-divergence.md`](reality-ledger-divergence.md).

### 11. What to change before the next dogfood round

- **Product**: items 1, 2, 4, 5 and 6 from Q9 (CLI-only, no contract change), and **fix the
  `ready_to_land` / `next_action` projections** so they never say more than `land` would (F9).
- **Benchmark**:
  - **Redesign retry-worker** so a first attempt can plausibly be incomplete _without_
    hiding information unfairly. For example, state the empty-batch criterion in ISSUE.md
    but leave it uncovered by any visible failing test. In this batch both defects were
    visible as failing tests, and no model needed a retry.
  - Run **≥ 3 seeds per cell**.
  - Keep Tallyback's docs and source out of the run's reachable filesystem, or provide them
    deliberately. 4/9 runs read them through the wrapper path.

### 12. What should explicitly NOT be changed on this evidence

- **The settlement basis matrix.** It is the guard that worked. Do not relax it to reduce
  Haiku's friction.
- **The Claim → Declaration binding (F4).** The friction came from criteria-less
  declarations (F1). Fix F1 first; the binding itself protects referential meaning.
- **Allowing multiple effective Settlements (F14).** Single anecdote.
- **Adding an automatic "complete" status, auto-verdicts from test runs, or auto-settle.**
  The benchmark shows models already over-reading green suites. Tallyback should not do it
  for them.
- **Evidence and Verdict contract semantics, and requiring criteria at the contract level.**
  Suggestive, but any change to the frozen v1 contract needs its own review. The CLI-level
  fixes above address most observed harm without touching it.
- **Anything about subagent independence (F12).** No run delegated, so there is no evidence
  about delegated verification.

## Threats to validity

- **n = 1 per cell.** Every per-model difference is a single observation.
- **Tallyback docs/source were reachable.** The `tallyback` wrapper exposes the pinned
  worktree path. tiny-cache-sonnet read the live checkout (identical `src/` at the time).
  4/9 runs read docs or source. This favours models that go looking.
- **Harness co-location.** Workspaces lived under the orchestrator's scratch directory. No
  run referenced another run's workspace (checked: 0 foreign workspace references across all
  transcripts).
- **retry-worker did not exercise retries** (see Q11).
- **Oracles probe behaviour, not the ledger.** Ledger judgements are the auditor's, from the
  records.
- **One auditor** (this session) wrote the fixtures, oracles and audits. The raw evidence is
  committed so the audits can be re-derived independently.

## Proposed follow-up (not run): cold return and executor replacement

**Hypothesis under test:** _Task identity survives executor, session, and model replacement._

1. **Cold return, same model.**
   - Session 1 starts a tracked task on a fixture with a genuinely two-step fix (the
     redesigned retry-worker). It is terminated by the harness after the first Claim and
     before any Verdict (e.g. `timeout` on a turn count, or after the first `claim` call is
     observed).
   - Session 2 starts fresh in the same workspace with **no transcript** and the same
     prompt plus one line: "Resume the tracked work in this repository."
   - Measure whether Session 2 finds the existing Task via `view` instead of creating a new
     one; whether it continues the same Attempt or opens a new one and says why; whether it
     reuses or re-verifies Session 1's Evidence; and how its Settlement relates to
     Session 1's Claim.
2. **Executor replacement:** the same protocol with Haiku → Sonnet → Opus and Opus → Sonnet → Haiku
   handoffs (one handoff per boundary).
3. **Metrics:**
   - Duplicate Tasks or Declarations created.
   - Re-derived versus reused Evidence.
   - Claims from the previous executor treated as facts (should be 0).
   - Final ledger/reality divergence (same audit as this batch).
   - Wall-clock time to the first productive action.
4. **Preconditions:** run it after the Q11 product fixes, pinned to one new SHA, with ≥ 3
   seeds per handoff.
