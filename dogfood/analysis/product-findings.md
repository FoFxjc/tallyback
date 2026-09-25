# Product findings

Tallyback defects, missing affordances, and semantic traps observed during the batch.
**None were fixed during the batch** (pinned `c2ff5eb` throughout). Each finding records how
many of the nine runs show it, so repeated evidence can be told apart from anecdote.

Strength: **Repeated** ≥ 4/9 runs across ≥ 2 models · **Recurring** 2-3/9 · **Single** 1/9.

## F1 — Declarations are accepted with zero criteria, and nothing says so — Repeated (9/9)

`declare` requires only `--objective`. **Every run's first declaration had no criteria.**
Criteria-less declarations make `tallyback verdict` impossible ("declaration … has no
criteria; nothing to assess") much later, after work is done. Consequences: Haiku never
recovered (3/3 runs ended with 0 criteria and no Verdict); Sonnet and Opus superseded the
declaration (6/6), which in Sonnet's case forced placeholder Attempts (F4).

## F2 — Unknown flags are silently ignored, and mutations still commit — Repeated (9/9 used an ignored flag; 8/9 got a wrong or junk record from it)

Examples: `--criteria`, `--acceptance`, `--description` on `declare` (→ criteria-less
declarations; tiny-cache-haiku, tiny-cache-sonnet ×3, config-migrate-sonnet);
`--dry-run` (→ a _real_ declaration with objective `x`, tiny-cache-opus); `--branch`,
`--base-sha` on `dispatch` (→ Attempt without a branch, config-migrate-opus);
`--basis-attempt`, `--basis-verification-exception`, `--verdict-exception` on `settle`
(tiny-cache-haiku, config-migrate-haiku); `--file`, `--reference`, `--description`,
`--pointer` on `evidence`. Sonnet deliberately probed `--totallyfakeflag foo` to confirm the
behaviour. This is the single most damaging affordance: the model believes it recorded
something it did not.

## F3 — No per-command help; flags are discovered one error at a time — Repeated (9/9)

`tallyback <cmd> --help` returns `error: missing required --task-id`. Every run learned
required flags from sequential "missing required --x" errors. Tallyback failure rates:
Haiku 27/44, 30/52, 28/43; Sonnet 41/71, 15/87, 41/72; Opus 4/25, 7/39, 1/17.
**4/9 runs read Tallyback's README / quick-start / `src/cli.ts` / contract schema** to
proceed (all three Opus runs, tiny-cache-sonnet) — the prompt allowed it only if the
integration was insufficient, and every one of them stated it was. The skill documents
phases, not syntax.

## F4 — Attempt ↔ Declaration binding turns declaration fixes into fake Attempts — Recurring (3/9, all Sonnet)

A Claim must cite the declaration its Attempt was dispatched under. After superseding a
criteria-less declaration (F1), Sonnet ended the working Attempt as `returned` and dispatched
a new Attempt that did no work (tiny-cache, config-migrate ×2, retry-worker). Opus avoided it
by superseding _before_ dispatching. The ledger's Attempt count therefore stops meaning
"tries at the work".

## F5 — `record-check` is unusable without writing raw contract JSON, and its errors mislead — Repeated (6/9)

`--outcome verdict_emitted` needs a full Verdict/Reconciliation JSON record; every guess
fails with `"recording the check result failed after 5 retries"` even when the real cause is
a validation error on the first try (`schema.undefined_value`,
`invariant.check_result_outcome_mismatch`). Observed consequences:

- a **false `check_failed`** result recorded just to close an invocation (config-migrate-sonnet, retry-worker-sonnet);
- `verdict_withheld` recorded to close an invocation (config-migrate-haiku, config-migrate-opus — accurate, but chosen for syntax, not semantics);
- **hand-fabricated Reconciliation + Verdict JSON** with self-generated ids and a tool
  identity (tiny-cache-sonnet, after reading source).
  The ergonomic `tallyback verdict` command exists and worked when found (5 runs), but nothing
  points from `record-check` to it.

## F6 — Evidence payload schemas cannot hold what agents naturally record — Repeated (8/9)

`test_run` accepts `command`, `exit_code` (+ repository/workspace context) and rejects
`passed`, `failed`, `summary`, `output`, `tests`. Agents stripped their evidence down to
`{exit_code: 0}` (Sonnet ×3, Opus config-migrate), recorded `artifact {}` just to get
something accepted (config-migrate-haiku, retry-worker-sonnet), or smuggled the explanation
into `command` ("… # new tests vs seed code: 4 failed, 10 passed", config-migrate-opus). The
evidence kind enum is also undiscoverable (Haiku guessed `patch`, `file`, `test`,
`test_result`, `build_log`, `commit`). Result: the criterion-level facts live in Verdict
prose, not in inspectable Evidence. The one run that found `git_commit` and `observation`
(retry-worker-opus, the only run with no evidence rejection — after reading the schema) produced the best evidence of the batch.

## F7 — Model-authored records default to `tool:tallyback` — Repeated (8/9)

Without `--actor`, Claims, Evidence, Verdicts, and Settlements are attributed to the Tallyback
tool itself. Only tiny-cache-opus set `--actor`. Sonnet went further and wrote
`tool:tallyback-check` into a hand-made Verdict. The ledger therefore cannot distinguish
executor, verifier, and tool — undermining the Claim ≠ Verdict separation it exists for.

## F8 — Settlement basis is expressed in schema terms, not CLI terms — Repeated (6/9: every Haiku and Sonnet run; 0 Opus; 3/3 Haiku never resolved it)

`invariant.settlement_basis_matrix: land requires exactly one of basis.verdict_id or
verification_exception` names record fields; the flags are `--verdict-id` /
`--verification-exception`. Haiku guessed `--basis-*` variants in all three runs and never
settled. Sonnet and Opus mapped it after one failure.

## F9 — `view` projections overstate readiness — Recurring (3/9)

- `status.ready_to_land: true` with uncommitted work while `tallyback land` reports
  `git_unresolved` (retry-worker-sonnet; config-migrate-sonnet's first settlement). The
  model's report repeated `ready_to_land: true`.
- `next_action: "settle"` after the only CheckResult is `verdict_withheld`
  (config-migrate-haiku → "Settlement ready (awaiting formal closure)").

These are Tallyback's own statements, not model errors.

## F10 — Bootstrap guidance works; guidance stops exactly where syntax begins — Repeated (9/9)

Every run followed `mutation.ledger_not_initialized` → `init` → `topic` → `task` with zero
failed calls (the fix at `c2ff5eb`). From `declare` on, per-task `next_action` is a phase
name ("declare", "dispatch", "verify (record-check)") and failures begin immediately. Haiku,
which followed `next_action` most literally, stalled precisely at the first step without a
runnable command.

## F11 — Nothing marks the ledger's machine-local runtime as ignorable — Recurring (2/9, Haiku)

Haiku committed `.tallyback/` including `runtime/bindings.json` (an absolute path) with
`git add -A` in two runs. SPEC says runtime bindings are machine-local and never committed;
`init` does not write an ignore rule for them.

## F12 — Self-verification is indistinguishable from independent verification — Repeated (6/6 Verdicts)

Every Verdict was issued by the same agent that did the work, in the same session.
tiny-cache-opus labelled its own re-run "independent"; nothing in the ledger can say
otherwise. (Related to F7.)

## F13 — Attempts opened after the work — Recurring (3/9)

tiny-cache-haiku, retry-worker-haiku and retry-worker-sonnet wrote (and in one case
committed) the fix before any Attempt existed. Nothing flags an Attempt whose dispatch
post-dates the change it covers.

## F14 — Multiple effective `land` settlements for one task pass silently — Single (1/9)

config-migrate-sonnet recorded two effective `land` settlements (distinct Attempts) and
believed the first was superseded. Allowed by the contract; the belief mismatch is the
finding.

## F15 — `tallyback verdict` writes content-free per-criterion findings — Repeated (5/5 uses, Sonnet and Opus)

Every Verdict authored through the ergonomic `tallyback verdict` command (tiny-cache-opus,
config-migrate-sonnet, config-migrate-opus, retry-worker-sonnet, retry-worker-opus) has
findings of the form `"AC1: assessed as supported"` with **empty `basis_refs`**. The only
Verdict with criterion-specific findings is the one hand-written as raw JSON
(tiny-cache-sonnet). The per-criterion reasoning the models did perform survives only in the
single free-text `rationale`, so the ledger cannot answer "what supports criterion 3?" — the
exact question config-migrate was built to ask.

## Protective behaviour observed (keep)

- **Settlement basis matrix** blocked an unjustified `land` on "tests confirm all criteria"
  (config-migrate-haiku) and on "all 11 tests pass" (tiny-cache-haiku).
- **Referential integrity** rejected a fabricated workspace id (retry-worker-haiku).
- **`tallyback land`** reported `git_unresolved` truthfully when the projection did not.
- **`tallyback watch`** reported `claim_without_branch_advance` for uncommitted work.
- **`mutation.ledger_not_initialized` + ledger-level `next_action`** carried every model
  through bootstrap without error.
