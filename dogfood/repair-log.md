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
