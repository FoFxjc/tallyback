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
