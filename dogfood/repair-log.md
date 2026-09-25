# Repair log — post-benchmark usability fixes

Fixes driven by `analysis/product-findings.md` (batch at Tallyback `c2ff5eb`). The batch's
evidence under `runs/` and `analysis/` is historical and is not edited by these repairs; a
future benchmark round measures their effect.

## R1 — Per-command `--help` (F3, 9/9 runs)

- **Reproduced**: `tallyback declare --help` → `error: missing required --task-id`;
  `tallyback help declare` → the generic top-level help. Worse: `tallyback task --topic-id
<top> --title probe --help` **created a Task** — `--help` was parsed as a boolean flag and
  then ignored.
- **Root cause**: no declared per-command surface; `--help` only handled as the command
  word itself.
- **Change**: `src/cli-spec.ts` declares every command's flags (required, repeatable,
  boolean, closed value sets, placeholders) with canonical examples. `tallyback <cmd>
--help` and `tallyback help <cmd>` render it and return before any ledger access. The
  skill's "Start here" points to it. The source-scan test also caught `migrate --preview
--apply` silently applying; the pair is now rejected.
- **Regression**: `test/cli-help.test.ts` — help content; `--help` with valid mutating
  flags leaves `state.json` byte-identical; help works without a ledger; the registry and
  the flags `src/cli.ts` actually reads are the same set, and every dispatched command has a
  spec.
- **Dogfood**: `declare --help` lists `--criterion <code:statement> (repeatable)` and an
  example with two criteria; `settle --help` names `--verdict-id` and
  `--verification-exception`; `task … --help` in an initialised ledger: 0 tasks after.
- **Uncertainty**: help text is hand-written data; the source-scan test guards drift of
  flag _names_, not the accuracy of descriptions.

## R2 — Unknown CLI input fails closed (F2, 9/9 runs)

- **Reproduced**: `declare --criteria "a:b"` → `ok: true`, `criteria: []`;
  `declare --objective o --objective p` → misleading `missing required --objective`;
  `task fix-bug --topic-id … --title y` → `ok: true`, token silently dropped.
- **Root cause**: the parser collected any `--key` and handlers read only the keys they
  knew; everything else (and every positional token) was discarded.
- **Change**: `checkUsage` runs before any ledger access: an undeclared flag
  (`cli.unknown_flag`, with a "did you mean" suggestion), a repeated single-value flag
  (`cli.repeated_flag`), or a positional token (`cli.unexpected_argument`) is rejected.
  Usage errors are now structured like every other rejection: `{ok:false, code, message}`
  on stdout, `code: message` on stderr, exit 1.
- **Regression**: `test/cli-fail-closed.test.ts` — six benchmark-derived misuses, each
  rejected with its code while `state.json` stays byte-identical; suggestion; rejection
  happens before ledger lookup.
- **Dogfood**: replayed `--criteria`, `--dry-run`, repeated `--objective`, positional
  `fix-bug`, `dispatch --branch`, `settle --basis-verification-exception`,
  `evidence --claim-id`, `--descr=zzz`: all exit 1 with a code; `state.json` hash
  unchanged; the correct `--criterion` form still records.
- **Uncertainty**: `evidence --claim-id` is now rejected, but nothing yet tells the caller
  that Evidence is linked from `claim --evidence` (addressed with evidence ergonomics).

## R3 — Rejections name CLI flags, not record fields (F8, 6/9 runs)

- **Reproduced**: `settle --decision land` without a basis →
  `land requires exactly one of basis.verdict_id or verification_exception`; the flags are
  `--verdict-id` / `--verification-exception`. Haiku guessed `--basis-*` in 3/3 runs and
  never settled. `dispatch --workspace-id <path>` → a raw UUIDv7 regex.
- **Root cause**: the CLI printed the validator's wire-format message verbatim.
- **Change**: a CLI-side `hint` (stdout field + `hint:` stderr line) for the settlement
  basis matrix (per decision) and for schema paths `/records/N/<field>` that map to a flag
  the command declares (id-shaped fields: "must be a `wsp_<UUIDv7>` id … find ids with
  `tallyback list`"). `code` and `message` are unchanged; the validator is untouched; the
  basis requirement is not relaxed. Missing / invalid flags get `cli.missing_flag` /
  `cli.invalid_value` and point to `<command> --help`.
- **Regression**: `test/cli-diagnostics.test.ts`.
- **Dogfood**: `settle land` without basis → still rejected (0 settlements), hint names both
  flags and says "Passing tests are not a Verdict"; a path as `--workspace-id` → hint names
  the id kind; `settle` without `--attempt-id` → `cli.missing_flag … See tallyback settle --help`.
- **Uncertainty**: the hint table covers the codes seen in the benchmark; other validator
  messages still surface in wire terms unless they carry a `/records/N/<field>` path.

## R4 — `record-check` reports the real rejection (F5, 6/9 runs)

- **Reproduced**: `record-check --outcome verdict_emitted` (no verdict) →
  `invariant.check_result_outcome_mismatch: recording the check result failed after 5
retries` — no retry happened; `--verdict '{"pass":true}'` → `schema.undefined_value …
failed after 5 retries`. Benchmark consequences: two false `check_failed` results,
  `verdict_withheld` chosen for syntax, one hand-fabricated Verdict.
- **Root cause**: `recordCheckOutput` dropped the validator's message; `recordCheckResult`
  substituted a fixed retry-exhaustion message for every failure, although it breaks out
  immediately on anything but a revision conflict.
- **Change**: the rejection message is carried through (`RecordCheckOutputResult.message`,
  optional, both interfaces); non-conflict failures say "the check result was rejected:
  <validator message>"; only real revision-conflict exhaustion mentions retries, with the
  actual count. The CLI rejects a `--verdict` JSON without `verdict_id` up front
  (`cli.invalid_value`), and every `record-check` rejection carries a hint pointing to
  `tallyback verdict` and to the honest use of `verdict_withheld` / `check_failed`.
- **Regression**: `test/cli-diagnostics.test.ts` (record-check block); existing
  `acceptance.test.ts` still proves the genuine conflict-retry path.
- **Dogfood**: both benchmark failure shapes now name the real cause, carry the hint, and
  leave `state.json` byte-identical; an honest `verdict_withheld` still records.
- **Uncertainty**: `record-check` still requires complete raw records by design (it is the
  Check boundary's low-level interface); the fix is diagnostics and redirection, not a new
  authoring path.

## N1 — Global flags before the command word (found while dogfooding R4)

- **Reproduced**: `tallyback --project-root <dir> view` → `unknown command "--project-root"`.
  Not a benchmark finding (runs used the cwd); found by this repair loop's own dogfooding.
- **Change**: leading `--key value` / `--key=value` pairs are collected before the command
  word and validated by the same fail-closed check.
- **Regression**: `test/cli-fail-closed.test.ts` (flags before the command word).
- **Dogfood**: `--project-root <dir> init`, `--project-root=<dir> view` work; a leading
  `--bogus x` is still `cli.unknown_flag`; bare `tallyback` and `tallyback --help` unchanged.

## R5 — Evidence authoring: say what a kind accepts, and where the result goes (F6, 8/9 runs)

- **Reproduced**: `evidence --kind test_run --payload '{…,"result":"11 passed"}'` →
  `payload must NOT have additional properties` (no list of accepted properties);
  `--kind test` → `unknown evidence kind "test"` (no list of kinds);
  `evidence … --claim-id` → (after R2) rejected, but nothing said how Evidence gets linked.
  Benchmark outcomes: `{exit_code: 0}`-only evidence, `artifact {}`, explanations smuggled
  into `command`.
- **Root cause**: the payload shapes are closed by the frozen contract, and the Evidence
  record's free-text `note` exists for exactly this — but neither was discoverable from the
  CLI. No contract defect: the gap is description, not capacity.
- **Change**: `EVIDENCE_PAYLOADS` (per-kind required/optional properties, drift-guarded
  against `records.schema.json`); `evidence --help` lists every kind's shape and says to put
  the human-readable result in `--note`; payload/kind rejections carry a hint with the
  kind's accepted properties (or the kind list) and `--note`; `--claim-id` / `--attempt-id`
  / `--task-id` on `evidence` explain that Evidence is linked from `claim --evidence`. The
  skill's Observe phase states the order.
- **Regression**: `test/cli-evidence.test.ts` — schema drift guard; hints; no mutation on
  rejection; `--note` round-trips.
- **Dogfood**: the three benchmark failure shapes each return an actionable hint with
  `state.json` unchanged; `test_run` + `--note "11 passed; new test fails on the unfixed
code"` records the result text.
- **Uncertainty**: `artifact {}` is still accepted — the contract allows an empty artifact
  payload; refusing it would be a contract change. Whether agents now use `--note` is for the
  next benchmark to show.

## R6 — Per-criterion findings in `tallyback verdict` (F15, 5/5 uses)

- **Reproduced**: `tallyback verdict --criterion <code>=supported …` records
  `summary: "<code>: assessed as supported"`, `basis_refs: []` for every criterion; the
  source said "This slice has no per-criterion evidence syntax". In the benchmark the
  criterion-level reasoning survived only in one free-text rationale.
- **Root cause**: missing authoring surface, not a contract gap — `Finding.summary` and
  `Finding.basis_refs` exist in the frozen schema.
- **Change**: optional repeatable `--finding <code|cri_…>=<summary>` and
  `--finding-basis <code|cri_…>=<evi_…|rec_…>`. References must exist in the ledger and name
  an assessed criterion; cited references are also added to the Verdict's basis. Absent
  flags keep today's behaviour (generic summary, empty `basis_refs`) — nothing is inferred.
  `verdict --help` shows an example; the skill's Verify phase names `verdict` as the normal
  path and `record-check` as the raw-record form.
- **Regression**: `test/cli-verdict-findings.test.ts`; existing `verdict-cli.test.ts`
  unchanged and passing.
- **Dogfood**: finding summary + per-criterion basis recorded and `validate` ok; four misuse
  shapes (unknown code, unknown evidence id, missing `=`, duplicate) rejected with
  `cli.invalid_value` and `state.json` unchanged.
- **Uncertainty**: findings remain optional. Requiring them would force authors to write
  something per criterion but risks boilerplate; the next benchmark should show whether
  agents use them once visible.

## R7 — Criteria-less `declare` must be deliberate (F1, 9/9 runs)

- **Reproduced**: `declare --task-id <tsk> --objective "fix it"` → `ok: true`,
  `criteria: []`; `tallyback verdict` later refuses ("declaration … has no criteria;
  nothing to assess"). Every benchmark run's first declaration looked like this.
- **Root cause**: `--criterion` is optional at the CLI; the omission (or, before R2, a
  misspelled flag) was indistinguishable from a choice.
- **Change**: the CLI requires ≥ 1 `--criterion` or an explicit `--no-criteria`
  (`cli.missing_flag` otherwise; `cli.invalid_value` for both). The Store and the frozen
  contract still accept criteria-less declarations — this is an authoring guard, not a
  contract change. Found while testing: the "did you mean" ranking preferred containment
  (`--criteria` → `--no-criteria`); it now ranks by edit distance first.
- **Regression**: `test/cli-declare.test.ts`; suggestion case in `cli-fail-closed.test.ts`.
- **Dogfood**: bare `declare` rejected with guidance and `state.json` unchanged;
  `--criterion` + `--no-criteria` rejected; `--no-criteria` records an empty declaration;
  superseding with `--criterion` still works.
- **Uncertainty**: `--no-criteria` remains available, so a determined caller can still
  declare an unjudgeable task; it now says so in the command line.

## R8 — Per-task `next_command`; `ready_to_land` / `settle` affordances (F10 9/9, F9 3/9)

- **Reproduced**: per-task `next_action` is a phase name (`"declare"`, `"dispatch"`,
  `"verify (record-check)"`, `"settle"`); the benchmark's first failures in every run came
  at exactly that step. `view` of an uncommitted `land` settlement: `ready_to_land: true`
  while `tallyback land` says `git_unresolved`; `next_action: "settle"` after
  `verdict_withheld`.
- **Investigation (F9)**: not a semantic defect. SPEC §7.2 and `docs/land-design.md` define
  the ledger projection as the ledger half of readiness; the Git half is `tallyback land`
  by design (no I/O in projections). `next_action: "settle"` after a withheld verdict
  follows view-design §4 step 8 — retry/abandon remain valid. Both are affordance problems:
  nothing said what the value meant or what to run. Behaviour of `status` and `next_action`
  is therefore **unchanged**.
- **Change**: `TaskView.next_command` (`{command, reason, requires}`), with ledger ids filled
  and `<placeholders>` for caller judgments: resolve / declare / workspace-or-dispatch /
  claim (with `--evidence`) / `verdict` per declared criterion / settle (with the positive
  `--verdict-id` when one exists, otherwise a reason stating the basis rule) /
  `tallyback land` for a ledger-ready task. Skill and view-design updated.
- **Regression**: `test/view-next-command.test.ts` — a follower that fills only
  placeholders goes from an empty Git repo to `settled: accept` with zero failed commands;
  the withheld-verdict settle reason; the land pointer.
- **Dogfood**: scripted follower (scratch `follow.py`): init → topic → task → declare →
  workspace → dispatch → evidence + claim → verdict → settle, 9 steps, 0 failures,
  `validate` ok. Its own harness bugs (double `--project-root`, unquoted multi-word value)
  were caught by R2's fail-closed parsing — before R2 the second would have silently
  truncated a title.
- **Uncertainty**: `next_command` covers the single latest Attempt/Claim; multi-attempt
  tasks still need judgment about which Attempt to settle. `next_action` naming is left as is.

## R9 — Honest default attribution (F7, 8/9 runs)

- **Reproduced**: `evidence …` / `claim …` / `settle …` without `--actor` →
  `submitted_by` / `claimed_by` / `decided_by` = `tool:tallyback`; `tallyback verdict`
  → `issued_by` = the submitter (`tool:tallyback`). In the benchmark this attributed agents'
  Claims, Verdicts, and Settlements to Tallyback itself (Sonnet also copied
  `tool:tallyback-check` into a hand-made Verdict).
- **Root cause**: the CLI filled the author with its own identity when none was given — a
  false provenance statement, not a neutral default.
- **Change**: author default = `--actor` › `--as` (if given) › `$TALLYBACK_ACTOR` (explicit
  host setting, validated) › `unknown:unattributed` (a contract ActorKind). The CLI still
  never infers an identity. Operation provenance (`--as`, default `tool:tallyback`) is
  unchanged — the tool does submit the append. The Claude Code bridge README shows the
  `.claude/settings.json` `env` setting; the skill says to pass `--actor`.
- **Regression**: `test/cli-attribution.test.ts`.
- **Dogfood**: default → `unknown:unattributed`; `TALLYBACK_ACTOR=executor:claude-code` →
  used; `--actor human:alice` overrides it; `TALLYBACK_ACTOR=robot` → `cli.invalid_value`,
  `state.json` unchanged.
- **Uncertainty**: `unknown:unattributed` is honest but not useful; the value comes only from
  hosts or agents actually passing an identity. Self-verification (F12) remains
  indistinguishable when one agent uses one id for everything — deliberately not addressed
  (no delegation evidence in the benchmark).

## R10 — Ledger carries its own `.gitignore` (F11, 2/9 runs; SPEC §6 gap)

- **Reproduced**: `init` + `bind` + `git add -A` staged `.tallyback/runtime/bindings.json`
  (an absolute path) and `history.jsonl`. Haiku committed both in 2/9 runs.
- **Root cause**: SPEC §6 marks `history.jsonl` "ignored" and `runtime/` "always ignored",
  but nothing implemented that — an implementation gap, not a contract change.
- **Change**: `ensureLedgerGitignore` writes `.tallyback/.gitignore` (`history.jsonl`,
  `runtime/`) when `init` or `migrate --apply` creates a ledger; an existing file is left
  untouched.
- **Regression**: `test/ledger-gitignore.test.ts`.
- **Dogfood**: in a fresh Git repo, `init` → `workspace` → `bind` → `git add -A` stages only
  `.gitignore`, `project.json`, `state.json`; `validate` ok; a pre-existing custom
  `.tallyback/.gitignore` is preserved.
- **Uncertainty**: ledgers created before this change get no `.gitignore` (only creation
  paths write it). Whether to commit `state.json` at all remains the user's choice.
