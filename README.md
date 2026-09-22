# Tallyback

> **Delegate work. Know what came back.**

Tallyback is local, Git-native accountability infrastructure for delegated agent work.
It keeps a durable account of what was assigned, what an executor claims happened, what
the repository can prove, and whether the result is ready to land — as a plain
`.tallyback/` directory on your own machine, no server or cloud account required.

## Why Tallyback exists

A common agent-assisted development workflow looks like this:

```text
goal discussed in conversation
        ↓
task delegated to an agent/subagent/human
        ↓
worker edits a branch or worktree
        ↓
worker claims completion ("done")
        ↓
PM later has to reconstruct what actually happened
```

The expensive part is not dispatching the work — it's reconstructing its state.
Progress ends up scattered across chat threads, checkpoint files, working trees,
commits, test output, and agent-written summaries. Rebuilding a project report or
planning the final merge means rereading all of it, and one ambiguity remains no
matter how carefully you reread:

**An agent saying "done" is a claim, not a fact.**

Activity is not completion, and a claim is not evidence. Tallyback externalizes the
small amount of structured state needed to tell the two apart:

- What was promised?
- Who or what attempted it, and where?
- What does the executor claim?
- What evidence supports that claim?
- What did an independent check conclude?
- What is blocked, stale, ready to retry, or ready to land?

## The core loop

```text
Declare → Dispatch → Observe → Verify → Settle
```

| Stage        | Question                                                       |
| ------------ | -------------------------------------------------------------- |
| **Declare**  | What is the task, and what would count as done?                |
| **Dispatch** | Which attempt, executor, session, worktree, and branch own it? |
| **Observe**  | What progress, claims, blockers, and evidence came back?       |
| **Verify**   | Do repository reality, tests, and Git support those claims?    |
| **Settle**   | Should the result be accepted, retried, abandoned, or landed?  |

This defines record boundaries, not a mandatory linear state machine — a Task can have
multiple Attempts, and a Blocker or a Claim can arrive at any point. A task never
becomes complete merely because an executor stops, edits files, commits, or reports
success; completion is an explicit judgment recorded after the fact.

## What Tallyback records

```text
Topic
└── Task                          the stable unit of responsibility
    ├── Declaration + Criteria    what would count as done
    ├── Attempt                   one execution of the task
    │   ├── Executor               a replaceable agent, subagent, process, or human
    │   └── Workspace / Branch     the worktree an attempt owns
    ├── Claim                     a statement about progress or completion
    ├── Evidence                  a pointer to tests, commits, artifacts, observations
    ├── Verdict                   an independent per-criterion assessment
    └── Settlement                the explicit accept / retry / abandon / land decision
```

The Task is the stable identity. Agents, models, sessions, and worktrees are
replaceable executors underneath it — a Task can survive several Attempts across
several of them without losing continuity.

A **tallyback** (`tallyback view`) is the compact structured return from delegated
work: current state, claims, evidence pointers, blockers, verification status, next
action, and integration readiness. It is not a transcript and does not duplicate the
repository.

## What it can do today

Every item below is exercised by the in-tree test suite (440+ tests) against the
frozen v1 contract, not aspirational:

- **Durable delegated-work state** — a Git-friendly `.tallyback/` ledger (JSON +
  append log) that survives a cold session with no conversation replay.
- **Explicit acceptance criteria** — a `TaskDeclaration` states the objective and a set
  of named criteria before work starts.
- **Attempt / executor / workspace ownership** — each `Attempt` records who ran it,
  under which Declaration, and which repository/workspace/branch it owns.
- **Claims separated from evidence** — a `Claim` is a statement; `Evidence` is what
  backs it. Neither is treated as a fact on its own.
- **Per-criterion verification** — `tallyback verdict` records an independent
  `supported` / `partially_supported` / `unsupported` / `contradicted` judgment against
  each declared criterion, with confidence, rationale, uncertainty, and limitations.
- **Explicit settlements** — `accept`, `retry`, `abandon`, or `land`, each an
  attributed, immutable decision. Nothing settles itself.
- **Cold-session recovery** — a new session/agent can resume a Task from `tallyback
view` without replaying the original conversation.
- **Git-aware integration readiness** (`tallyback land`) — cross-checks the ledger's
  `ready_to_land` projection against live Git state: does the branch exist, is it ahead
  of the target, has it already been merged?
- **Conflict / overlap awareness** — `land` flags candidates whose ready branches touch
  an overlapping file set as a potential integration conflict, by heuristic file-path
  comparison (not merge simulation).
- **Stale/lost-work observation** (`tallyback watch`) — flags open Attempts whose
  workspace has disappeared, or whose Claim shows no branch advance since dispatch.
- **Machine-readable validation** (`tallyback validate`) — a CI gate that reports
  ledger problems and forked-lineage conflicts, and exits non-zero until resolved.
- **Host bridges** — a host-neutral adapter description (`src/bridge/`) plus one
  concrete Claude Code plugin (`bridge/claude-code/`) that walks a model through the
  loop via the same CLI.

## Trust model

```text
repository / tests
        ↓
     Git facts
        ↓
 Tallyback records
        ↓
   model memory
```

Tallyback records declarations and judgments; it does not become the source of truth
simply by storing them. Concretely:

- Agent-provided content is treated as untrusted data, never as fact.
- Completion is never inferred solely from activity (a commit, an edited file, elapsed
  time).
- Claims stay separate from Evidence and from Verdicts.
- Consequential claims are reconciled against repository/Git reality before they carry
  weight.
- Uncertainty is preserved rather than smoothed into false confidence.

## `land` versus `view`

Both are read-only, but they answer different questions:

|                   | **View**                                            | **Land**                                                 |
| ----------------- | --------------------------------------------------- | -------------------------------------------------------- |
| Reality checked   | Ledger only                                         | Ledger **and** live Git                                  |
| Question          | What has been declared, claimed, verified, settled? | What is currently actionable for integration, right now? |
| Live Git required | No                                                  | Yes                                                      |
| Writes anything   | Never                                               | Never — advisory only, never merges/rebases/pushes       |

And within Settlement, `accept` and `land` are two different decisions, not synonyms:

- `accept` records that a result was judged acceptable. It does **not** authorize
  integration.
- `land` records explicit authorization to integrate. Only an **effective**
  (non-superseded) `land` Settlement enters the `ready_to_land` projection that
  `tallyback land` reads.

`Verdict != acceptance != landing authorization != actual Git integration.` Even after
a `land` Settlement, `tallyback land` only reports readiness — a human or PM agent still
performs the actual Git integration outside Tallyback.

## Quick Start

Requires Node.js `>= 20` and `git` on `$PATH`.

```bash
git clone https://github.com/FoFxjc/tallyback.git
cd tallyback
npm ci && npm run build && npm link   # exposes the `tallyback` command

tallyback --help        # command list, no ledger required
tallyback handshake     # capability handshake, always safe

PROJ=/tmp/tallyback-demo && mkdir -p "$PROJ" && cd "$PROJ"
tallyback init --topic "Demo" --goal "try the loop" --repository demo
# capture topics[0].topic_id and repositories[0].repository_id from the output
```

From there, `declare` → `dispatch` → `evidence`/`claim` → `verdict` → `settle` walks
one Task through the full loop; `tallyback view` and `tallyback validate` are read-only
reports over it. The complete, copy-pasteable walkthrough — including binding a
Workspace for `land`/`watch` — lives in
[docs/quick-start-walkthrough.md](docs/quick-start-walkthrough.md).

Every command prints machine-readable JSON to stdout and a one-line human summary to
stderr, so the same commands work in a terminal and in a pipeline. For the full flag
surface, see [`src/cli.ts`](src/cli.ts); for the underlying API, see
[`src/index.ts`](src/index.ts).

## A real workflow

```text
Task A ── dispatched to worktree A (branch feature/a)
Task B ── dispatched to worktree B (branch feature/b)
             ↓
   both return Claims + Evidence
             ↓
        PM verifies each (tallyback verdict)
             ↓
        land authorization (settle --decision land)
             ↓
        tallyback land: both git_ready, but flags an
        overlapping-file conflict between A and B
             ↓
   a human/agent resolves the order and performs the
   ordinary Git merge — outside Tallyback
```

Tallyback never orchestrates the workers or performs the merge; it makes the
integration-readiness picture visible before Git integration happens.

## Components

| Component  | Responsibility                                                                                                                     | Status                                                |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **Store**  | Sole ledger writer: append, supersession, projections, snapshot persistence, cross-process locking, forked-lineage reconciliation  | v1 implemented (`src/ledger/`)                        |
| **Check**  | Claim → Verdict verification boundary: `begin-check`/`record-check`, the ergonomic `verdict` command                               | v1 implemented (`src/check/`)                         |
| **Watch**  | On-demand detection of `lost` and `claim_without_branch_advance` over open Attempts                                                | v1 implemented (`src/watch/`)                         |
| **Land**   | Read-only Git integration-readiness, ordering, and file-overlap conflict report over `ready_to_land`                               | v1 implemented (`src/land/`)                          |
| **View**   | One compact per-task projection: declaration, attempts, claims, evidence pointers, blockers, verification, settlement, next action | v1 implemented (`src/view/`)                          |
| **Bridge** | Host-neutral adapter description + one Claude Code plugin                                                                          | v1 implemented (`src/bridge/`, `bridge/claude-code/`) |

Store and Check unify the model first explored in two predecessor projects
([claude-task-store](https://github.com/FoFxjc/claude-task-store),
[done-or-not](https://github.com/FoFxjc/done-or-not)); the v1 contract and every
component above are now implemented and tested in this repository, not delegated to
those repos.

Possible adoption levels — no component requires the whole stack merely to be useful:

```text
Store                                    → compact execution continuity
Store + Check                            → continuity plus claim verification
Store + Check + Watch + Land + View      → full delegated-work accountability,
                                            dispatch through integration
```

## What Tallyback deliberately does not do

- It does not choose or run your agents — it is not an agent runtime or model router.
- It does not orchestrate execution or schedule work — no workflow engine, no automatic
  status progression.
- It does not merge, rebase, or push Git branches — `land` is read-only and advisory.
- It does not replace tests, CI, or code review.
- It does not turn a model's claim into a fact merely by recording it.
- It does not require a cloud account, database server, or network round-trip — it
  runs entirely on the local filesystem, with `git` for the live-Git checks.
- It is not a transcript archive or a generic memory/RAG system.

## Status / maturity

Tallyback is a **0.1.x public pre-release**:

- The v1 wire-format contract under [`contract/`](contract/) is **frozen and
  implemented** — schemas, canonicalization rules, invariant catalog, fixtures, and the
  reference validator all exist and pass the conformance suite.
- Everything outside the contract — CLI flag ergonomics, the JSON shape of read-only
  reports (`view`/`land`/`watch`), internal module layout — is pre-1.0 and may change
  between 0.1.x releases without a contract version bump.
- `package.json` is marked `private`; there is no npm-published tarball yet. The
  supported install path is a source clone (see Quick Start above).
- Suitable for experimentation and real delegated-work dogfood, including as the
  persistence layer for an agent host. Not claiming production-hardening for every
  environment — see [Known limitations](#known-limitations).

### Known limitations

- **Advisory only.** `tallyback land` never merges, rebases, pushes, or writes to the
  ledger.
- **No remote fetch.** `land`/`watch` operate on the local Workspace's current state
  only; there is no `git fetch` anywhere in the loop.
- **Deleted branch refs can block historical proof.** If every Workspace bound to a
  candidate's repository has lost the branch ref, `land` reports `git_unresolved`
  rather than inferring integration.
- **Sibling fallback is positive-proof only.** `land` may consult a sibling Workspace
  when the original worktree is gone, but only when that Workspace positively resolves
  the query — it never copies refs or assumes a shared object database.
- **View does not filter active vs. historical.** Every Task is surfaceable regardless
  of Settlement decision; there is no `--archived`/`--active` flag yet.
- **Local-first bindings.** Workspace roots live in `runtime/bindings.json`, which is
  gitignored on purpose; multi-machine collaboration re-binds locally after clone.

## Documentation map

- [Normative specification](contract/SPEC.md) — the accountability model, identity,
  record graph, state model, Store↔Check boundary, and conformance model.
- [`contract/schemas/`](contract/schemas/), [`contract/invariants.json`](contract/invariants.json),
  [`contract/fixtures/`](contract/fixtures/) — the machine-checkable contract bundle.
- [Contract bundle structure](docs/contract-bundle.md)
- [Land behavior](docs/land-design.md) · [View behavior](docs/view-design.md) ·
  [Watch behavior](docs/watch-design.md) · [Bridge design](docs/bridge-design.md)
- [Migration mapping](docs/migration.md) · [Branch workflow](docs/branch-workflow.md)
- [Full Quick Start walkthrough](docs/quick-start-walkthrough.md)
- [CHANGELOG.md](CHANGELOG.md) · [SECURITY.md](SECURITY.md)
