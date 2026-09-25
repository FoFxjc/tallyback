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
