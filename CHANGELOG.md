# Changelog

All notable changes to Tallyback are recorded here. Versions follow [Semantic
Versioning](https://semver.org/). The v1 contract (`contract/`) is **frozen**
and evolves independently under its own version.

## [Unreleased]

### Fixed

- **Bootstrap states are protocol-readable.** In a project with no ledger, every
  command that opens one (`view`, `show`, `list`, the mutating commands, …) now
  returns a structured `mutation.ledger_not_initialized` outcome whose
  `next_action.command` is `tallyback init`, and exits 1, instead of a raw
  `ENOENT` for `.tallyback/project.json`. Only proven absence (neither portable
  file exists) is classified this way; partial, corrupt, and contradictory
  ledgers keep their own failures.
- **`view` names the first missing records.** An initialized ledger with no Task
  now carries a ledger-level `next_action` (create a Topic, then a Task), naming
  any value the caller must supply instead of inventing it.

## [0.1.0] — 2026-09-23

Initial public release of Tallyback. The v1 wire-format contract is frozen and
implemented end to end; the CLI, Store, and host-layer components described
below ship in this release. Implementation ergonomics outside the frozen
contract may continue to evolve across 0.1.x releases.

### Added — public surface

- **Frozen v1 contract.** Versioned wire-format contract under
  [`contract/`](contract/): normative `SPEC.md`, JSON Schemas under
  `contract/schemas/`, canonicalization rules under
  `contract/canonicalization.json`, invariant catalog under
  `contract/invariants.json`, positive/negative fixtures, and a publishing
  manifest with content-addressed digests.
- **Reference validator.** A reference implementation of the contract
  (`src/contract/validator.ts`) that gates every Store mutation. The validator
  is not a second source of truth — the contract files win on disagreement.
- **Store.** The sole ledger writer (`src/ledger/`): append, supersession,
  projections, snapshot persistence, cross-process locking, and
  forked-lineage reconciliation (`tallyback reconcile`).
- **Check / Verdict flow.** `tallyback begin-check` / `record-check` and the
  ergonomic `tallyback verdict` author a `CheckInvocation` → `CheckResult` →
  `Verdict` chain against a Claim. Verdicts may be `final` or `preliminary`,
  with explicit confidence and rationale.
- **Watch.** On-demand `tallyback watch` cross-checks every open Attempt
  against its bound Workspace for `lost` and `claim_without_branch_advance`
  conditions, plus the Store's own stale projection.
- **Land.** Read-only `tallyback land [--target-branch <branch>] [--all]`
  cross-checks the ledger's `ready_to_land` projection against live Git
  state. Candidates are classified into `ready` (`git_ready`),
  `unresolved` (`git_behind` / `git_unresolved`), and — with `--all` —
  `historical` (`git_integrated`). Integrated candidates are **never** folded
  into `ready`; sibling-Workspace fallback is positive-proof only.
- **View.** `tallyback view [--task-id <id>…]` returns the compact per-task
  tallyback (declaration, attempts, claims, evidence pointers, blockers,
  verification, settlement, status, `next_action`). Pure projection; no
  ledger writes; every Task remains surfaceable regardless of Settlement
  decision.
- **Bridge / Claude Code adapter.** Host-neutral generic adapter
  (`src/bridge/adapter.ts`) plus a Claude Code plugin under
  [`bridge/claude-code/`](bridge/claude-code/) (`.claude-plugin/plugin.json`
  - a skill that walks a model through the declare → dispatch → observe →
    verify → settle loop). The plugin format is non-normative and tracks
    Claude Code's published format independently.
- **Migration.** `tallyback migrate --source <legacy.json> [--preview |
--apply]` upgrades a legacy Store snapshot to the v1 contract in one
  atomic Store transaction, preserving `Tn` aliases and producing a
  migration report.
- **Validation gate.** `tallyback validate` is the CI gate: it runs against a
  freshly opened ledger, reports problems and forked-lineage conflicts,
  and exits non-zero until the ledger is reconcile-able. The
  `.github/workflows/ci.yml` `validate-gate` job exercises this against a
  fresh ledger on every PR.

### Design invariants preserved

- The contract is layered by authority: `contract/` is normative, the
  reference implementation is the bug when they disagree.
- Records are immutable; revisions append a new record with `supersedes`
  set. Forked lineages are refused, not resolved by timestamp — see
  [`docs/branch-workflow.md`](docs/branch-workflow.md).
- Tallyback does not infer completion from agent activity. Claim, evidence,
  verdict, and settlement are explicit and separate stages.
- No remote fetch, no automatic merge / rebase / push, no orchestration,
  no telemetry.

### Known limitations

- `land` is advisory / read-only; it never mutates Git or the ledger.
- `view` does not provide active-vs-historical filtering — every Task is
  surfaceable regardless of Settlement decision.
- Deleted candidate branch refs can prevent historical integration proof
  (`git_unresolved`, fail-closed).
- Local-first: Workspace roots live in gitignored
  `runtime/bindings.json`. Multi-machine collaboration uses Git for the
  ledger and re-binds locally.
- Implementation ergonomics outside the contract may change between
  0.1.x releases.

See [Security](SECURITY.md) for the current dependency-audit posture; the
runtime dependency tree (`ajv`, `canonicalize`, `uuid`) currently reports
**0** advisories; transitive dev-only advisories through `vitest` are
documented and not runtime-reachable.
