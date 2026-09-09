# Tallyback

Local, Git-native accountability infrastructure for delegated agent work. See
[README.md](README.md) for the product framing and [contract/SPEC.md](contract/SPEC.md)
for the normative wire-format contract this implementation exists to satisfy.

## Layout

- `contract/` — the versioned contract bundle. `SPEC.md`, `schemas/*.json`,
  `canonicalization.json`, and `invariants.json` are **normative**; `manifest.json`
  pins one version and digests every artifact. `fixtures/` holds positive/negative
  snapshot fixtures and accepted/rejected mutation vectors. `validator/` documents the
  reference validator but is not itself a source of truth — `src/contract/validator.ts`
  is.
- `src/contract/` — types, ID validation, JCS canonicalization, digesting, and the
  reference validator (`validate_snapshot`, `validate_append`) implementing
  `contract/invariants.json`.
- `src/ledger/` — the Store: sole ledger writer, append, supersession, projections,
  snapshot persistence, cross-process locking, merge reconciliation (forked-lineage
  repair).
- `src/check/` — the Check boundary: invocation, resolution, reconciliation, flow, and
  migration workflow between Store and an external checker.
- `src/cli.ts` — the `tallyback` CLI, built on the public barrel in `src/index.ts`. Not
  re-exported from the barrel itself.
- `scripts/regen-manifest.ts` — regenerates `contract/manifest.json` digests
  (`npm run manifest:regen`) after any change to a normative contract artifact.
- `test/` — vitest suite, including targeted regression tests per review round
  (`codex-regressions-*.test.ts`, `review-regressions.test.ts`).
- `docs/` — planning/design docs (`implementation-plan.md`, `contract-bundle.md`,
  `schema-outline.md`, `invariants-outline.md`, `fixture-matrix.md`, `migration.md`,
  `branch-workflow.md`).

## Commands

```
npm run build          # tsc -p tsconfig.build.json -> dist/
npm run typecheck      # tsc -p tsconfig.json --noEmit (src + test)
npm test               # vitest run
npm run lint           # eslint .
npm run format         # prettier --write .
npm run manifest:regen # regenerate contract/manifest.json digests
```

## Working on this codebase

- **The contract is layered by authority.** `contract/SPEC.md` + `schemas/*.json` +
  `canonicalization.json` + `invariants.json` are normative. `src/contract/validator.ts`
  is a reference implementation of them, not a second source of truth — if the two
  disagree, the contract files win and the validator is the bug.
- **Claims are not facts.** Per the trust model in the README
  (`repository/tests > Git facts > Tallyback records > model memory`), never add code
  paths that infer task completion solely from agent-reported activity.
- **`TaskDeclaration` (and every supersession-capable record type) is immutable.**
  Revisions append a new record with `supersedes` set; see
  [docs/branch-workflow.md](docs/branch-workflow.md) for why forked lineages must be
  refused rather than resolved by timestamp, and why `reconcile` chains losing heads
  instead of dropping them.
- **Bounded scope** — see `docs/implementation-plan.md` §2. In particular: no workflow
  engine, no automatic status progression, no remote clone/fetch, no telemetry, no
  execution/replay derived from repository text or checker output. Don't add these even
  if a task seems to call for them; flag the tension with the contract instead.
- **The governing test**: deleting `history.jsonl` may reduce recovery/forensic detail
  but must never make any record or reference in `state.json` semantically
  unintelligible. Keep this invariant in mind for any change to snapshot/append
  handling.
- After changing anything under `contract/` (schemas, canonicalization, invariants,
  SPEC), run `npm run manifest:regen` so `contract/manifest.json` digests stay correct,
  and add/update fixtures under `contract/fixtures/` to exercise the change.
- Record types are 3-4 letter prefixes on UUIDv7 ids (`dcl_`, `att_`, `ate_`, `clm_`,
  `evi_`, `ver_`, `rec_`, `set_`, `blk_`, `brs_`, `dec_`, `chk_`, `ckr_`, `cri_`, `top_`,
  `tsk_`, `wsp_`, `repo_`, `prj_`) — see `src/contract/ids.ts`.
