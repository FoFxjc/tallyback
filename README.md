# Tallyback

> **Delegate work. Know what came back.**

Tallyback is local, Git-native accountability infrastructure for delegated agent work.

It keeps a durable account of what was assigned, what an executor claims happened, what the repository can prove, and whether the result is ready to land.

## Status

Tallyback v1 is a **0.1.x public pre-release**:

- The v1 wire-format contract under [`contract/`](contract/) is **frozen and implemented**.
- The Store / Check / Watch / Land / View / Bridge v1 surface exists and is exercised by the in-tree test suite (400+ tests).
- Implementation is still **pre-1.0**: anything outside the contract (CLI ergonomics, JSON shapes of read-only reports, internal modules) may change between 0.1.x releases.
- Suitable for **experimentation and real delegated-work dogfood**, including as the persistence layer for an agent host.
- Not claiming production-hardening for every environment; see [Known limitations](#known-limitations) below.

## Requirements

Tallyback runs entirely on a single machine.

- **Node.js** `>= 20` (matches `engines.node` in `package.json`).
- **Git** available on `$PATH` for the live Git-backed `land` and `watch` operations. `view` is a pure ledger projection and does not require Git.
- **Local filesystem access** — the ledger is a `.tallyback/` directory under the project root.

No database server, cloud account, network round-trip, or remote clone/fetch is required.

## Install

Tallyback is currently a GitHub source pre-release. The recommended source-clone path is:

```bash
git clone https://github.com/FoFxjc/tallyback.git
cd tallyback
npm ci
npm run build

# Create an npm link so package.json#bin exposes the `tallyback` command.
npm link

tallyback handshake
tallyback version
```

`npm link` creates the `tallyback` executable shim from `package.json#bin`.
Merely adding `dist/` to `PATH` is not sufficient because the build artifact is named
`dist/cli.js`, not `dist/tallyback`.

If you do not want to create an npm link, invoke the built CLI directly instead:

```bash
node /path/to/tallyback/dist/cli.js handshake
node /path/to/tallyback/dist/cli.js version
```

There is no general top-level `--help` command in the current 0.1.x CLI; unknown commands
fail with the available command list.

An npm-distributable package is **not** part of this pre-release. The repository ships an
explicit package surface (see `package.json#files`) so a future npm release will be
reproducible, but the tarball is not yet announced for installation.

## Quick Start

Every Tallyback project starts with `init`, which materializes the `.tallyback/` ledger
under the chosen project root. From there the **declare → dispatch → observe → verify →
settle** loop runs entirely through the CLI; `land`, `view`, `watch`, and `validate` are
the read-only reports and gates around it.

```bash
# 0. Pick a project root (this directory will hold `.tallyback/`).
PROJ=/tmp/tallyback-demo
mkdir -p "$PROJ" && cd "$PROJ"

# 1. Capability handshake — runnable with no ledger; always safe.
tallyback handshake
# {
#   "contract": "tallyback",
#   "implementation_version": "0.1.0",
#   "command_api_version": "1",
#   "supported_contract_versions": ["1.0.0"],
#   "features": ["store", "check", "migration", "land", "view", "watch"]
# }

# 2. Initialize a project with one Topic and one Repository.
tallyback init --topic "Demo" --goal "try the loop" --repository demo

# Capture the IDs printed by `init` into shell variables — every subsequent step
# references at least one of them.
TOPIC=top_<…>   # from `topics[0].topic_id`
REPO=repo_<…>   # from `repositories[0].repository_id`

# 3. Create a Task under the Topic, then a Workspace under the Repository.
tallyback task --topic-id "$TOPIC" --title "Demo task"
TASK=tsk_<…>    # from `task.task_id`

tallyback workspace --repository-id "$REPO" --branch main
WS=wsp_<…>      # from `workspace.workspace_id`

# 4. Declare the work + acceptance criteria, then dispatch an Attempt.
tallyback declare \
  --task-id "$TASK" \
  --objective "Demonstrate Tallyback's core loop" \
  --criterion "ships:sends the work back" \
  --criterion "proof:reproducible evidence exists"
DECL=dcl_<…>    # from `declaration.declaration_id`

tallyback dispatch \
  --task-id "$TASK" \
  --declaration-id "$DECL" \
  --executor "tool:smoke-bot" \
  --repository-id "$REPO" \
  --workspace-id "$WS"
ATT=att_<…>     # from `attempt.attempt_id`

# 5. Observe: record Evidence, then a Claim that cites it.
tallyback evidence \
  --kind observation \
  --note "tests pass in CI" \
  --payload '{"text":"all checks green"}' \
  --actor tool:smoke-bot
EVID=evi_<…>    # from `evidence.evidence_id`

tallyback claim \
  --task-id "$TASK" \
  --attempt-id "$ATT" \
  --declaration-id "$DECL" \
  --statement "Implemented and verified" \
  --evidence "$EVID" \
  --actor tool:smoke-bot
CLAIM=clm_<…>   # from `claim.claim_id`

# 6. Verify: ergonomic Verdict authoring against each declared criterion.
tallyback verdict \
  --claim "$CLAIM" \
  --criterion "<cri_…>=supported" \
  --criterion "<cri_…>=supported" \
  --conclusion supported \
  --finality final \
  --confidence high \
  --rationale "All criteria evaluated as supported"
VER=ver_<…>     # from `bundle.verdict.verdict_id`

# 7. Settle: explicit, attributed decision.
tallyback settle \
  --task-id "$TASK" \
  --attempt-id "$ATT" \
  --decision accept \
  --verdict-id "$VER" \
  --rationale "All criteria supported at high confidence" \
  --actor tool:pm

# 8. Read-only ledger reports / gates.
tallyback view --task-id "$TASK"      # compact per-task tallyback
tallyback validate                    # CI gate; exits non-zero on ledger problems

# `land` and `watch` additionally require a machine-local Workspace binding to a real
# Git checkout. This minimal accept-flow intentionally stops before that Git-backed layer.
# For a real delegated coding task, bind the registered Workspace to its checkout:
#
# tallyback bind \
#   --repository-id "$REPO" \
#   --workspace-id "$WS" \
#   --root /absolute/path/to/the/git/worktree
#
# Then use `tallyback watch` while the Attempt is open, and `tallyback land` after an
# explicit `land` Settlement when you want live Git integration-readiness evidence.
```

Each command prints machine-readable JSON to stdout and a one-line human summary to
stderr, so the same commands work in a terminal and in a pipeline.

For the full command surface (every flag, every record type), see
[`src/cli.ts`](src/cli.ts); for the underlying API, see [`src/index.ts`](src/index.ts).

## Known limitations

These are real observed boundaries of the v1 implementation, not speculation.

- **Advisory only.** `tallyback land` reports readiness, ordering, and conflict groups; it
  **never merges, rebases, pushes, or writes to the ledger**. A human or PM agent makes
  the actual landing decision based on its output.
- **No remote fetch.** The live Git-backed `land` and `watch` commands operate on the
  local Workspace's current state only. There is no `git fetch` step anywhere in the loop.
  `view` is ledger-only and does not read live Git state.
- **Deleted candidate branch refs can prevent historical integration proof.** If every
  Workspace bound to a candidate's `repository_id` has lost the branch ref, `land`
  reports `git_unresolved` rather than inferring integration; there is no
  inferred/synthesized proof path in v1. See [Land documentation](docs/land-design.md).
- **Sibling fallback is positive-proof only.** `land` may consult another Workspace under
  the same `repository_id` when the Attempt's original worktree is gone — but only when
  that Workspace can positively answer the Git query. It does not copy refs between
  Workspaces and does not assume they share an object database.
- **View does not filter active vs historical.** Every Task is surfaceable through
  `tallyback view` regardless of Settlement decision; there is no `--archived` / `--active`
  flag in v1. See [View documentation](docs/view-design.md).
- **Local-first bindings.** Workspace roots live in `runtime/bindings.json`, which is
  gitignored on purpose (per SPEC §5.2). Multi-machine collaboration uses Git for the
  ledger and re-binds locally after clone.
- **Pre-1.0 ergonomics.** CLI flag names and read-only report shapes are stable for the
  v1 contract surface but may evolve between 0.1.x releases outside the contract.

## Why Tallyback exists

A common agent-assisted development workflow looks like this:

1. A user discusses a goal with a conversation or PM agent.
2. The PM turns that goal into delegated tasks.
3. Each task is handed to a subagent, external agent, or human executor.
4. The executor works in an isolated worktree and branch.
5. The PM later has to determine what finished, what failed, what is stale, and what can safely merge.

The expensive part is not dispatching the work. It is reconstructing its state.

Progress is scattered across chat threads, checkpoint files, working trees, commits, test output, and agent-written summaries. To produce a project report or plan the final merge, the PM agent often has to reread all of them. That consumes tokens and still leaves an important ambiguity:

**An agent saying “done” is a claim, not a fact.**

Tallyback externalizes the small amount of structured state needed to answer:

- What was promised?
- Who or what attempted it?
- Where did the attempt run?
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

A task does not become complete merely because an executor stops, edits files, creates a commit, or reports success. Completion is an explicit judgment made after reconciliation.

## The stable identity is the task

“Multi-agent” is not the primary abstraction.

Agents are replaceable executors. A task may survive multiple agents, models, sessions, failures, and worktrees.

```text
Topic
└── Task
    ├── Attempt 1 ── executor / session / worktree / branch
    ├── Attempt 2 ── executor / session / worktree / branch
    ├── Claims
    ├── Evidence
    ├── Verdict
    └── Settlement
```

| Object         | Meaning                                                                   |
| -------------- | ------------------------------------------------------------------------- |
| **Topic**      | A durable stream or area of work                                          |
| **Task**       | The stable unit of responsibility                                         |
| **Attempt**    | One execution of the task                                                 |
| **Executor**   | A replaceable agent, subagent, external process, or human                 |
| **Workspace**  | The worktree and branch owned by an attempt                               |
| **Claim**      | A statement made about progress or completion                             |
| **Evidence**   | A pointer to repository state, tests, commits, artifacts, or observations |
| **Verdict**    | A verification result, including uncertainty and limitations              |
| **Settlement** | The decision to accept, retry, abandon, or land the work                  |

A **tallyback** is the compact structured return from delegated work: current state, claims, evidence references, blockers, next action, verification status, and integration readiness. It is not a transcript and does not duplicate the repository.

## Trust model

```text
repository / tests
        >
     Git facts
        >
 Tallyback records
        >
   model memory
```

Tallyback records declarations and judgments; it does not become the source of truth simply by storing them.

Core rules:

- Treat agent-provided content as untrusted data.
- Never infer completion solely from activity.
- Keep claims separate from evidence and verdicts.
- Reconcile consequential claims against repository reality.
- Preserve uncertainty instead of manufacturing confidence.
- Keep execution state out of conversation summaries when it can be externalized.

## Ecosystem

Tallyback is modular. Users should be able to adopt only the parts they need.

| Component            | Responsibility                                                                | Status                                                                                                              |
| -------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Tallyback Store**  | Tasks, attempts, checkpoints, decisions, blockers, and compact resume context | Existing foundation in [claude-task-store](https://github.com/FoFxjc/claude-task-store)                             |
| **Tallyback Check**  | Semantic verification of implementation and merge-readiness claims            | Existing foundation in [done-or-not](https://github.com/FoFxjc/done-or-not)                                         |
| **Tallyback Watch**  | Optional external detection of stale, lost, or drifting execution             | v1 implemented — on-demand detection of `lost` and `claim_without_branch_advance` over open Attempts (`src/watch/`) |
| **Tallyback Land**   | Integration readiness, ordering, conflict awareness, and merge settlement     | v1 implemented — read-only readiness/conflict report over `ready_to_land` (`src/land/`)                             |
| **Tallyback View**   | Local project status, reports, evidence trails, and visualization             | v1 implemented — one compact per-task report (`src/view/`)                                                          |
| **Tallyback Bridge** | Adapters for agent hosts, stores, and worktree managers                       | v1 implemented — generic adapter description (`src/bridge/`) + one Claude Code plugin (`bridge/claude-code/`)       |

Possible adoption levels:

```text
Store
  compact execution continuity

Store + Check
  continuity plus claim verification

Store + Check + Watch + Land + View
  local delegated-work accountability from dispatch to integration
```

No component should require the whole stack merely to be useful.

## One open attempt per worktree

The intended default is:

> At most one open Attempt owns a given Worktree (Workspace) at a time. A Task may have
> multiple Attempts, each in its own Worktree.

This creates a clean accountability boundary:

- the task says what was promised;
- the attempt identifies who worked on it and where;
- the worktree isolates the change;
- Git preserves the factual change history;
- evidence connects claims to observable results;
- verification judges whether the implementation is legitimate;
- settlement determines whether and how it lands.

Tallyback may integrate with worktree lifecycle tools, but it is not itself an agent fleet manager.

## What Tallyback is not

Tallyback is not:

- a general task-management SaaS;
- an autonomous project manager;
- an agent runtime or model router;
- a scheduler or fleet orchestrator;
- a replacement for Git, tests, CI, or code review;
- a transcript archive;
- a generic memory, RAG, or vector-search system;
- a machine that can guarantee semantic truth.

Orchestrators answer **who should run next**.

Memory systems answer **what might be useful to recall**.

Task managers answer **who owns which item**.

Tallyback answers **what came back from delegated work, what supports it, and what can safely happen next**.

## Design principles

1. **Local first** — project state stays on the user's machine by default.
2. **Git native** — Git remains the durable factual history of code changes.
3. **Small and inspectable** — no mandatory cloud, database server, or hidden remote state.
4. **Modular** — Store, Check, Watch, Land, View, and Bridge evolve independently.
5. **Host neutral** — Claude Code, Codex, OpenCode, external agents, and humans share one execution model.
6. **Task stable, executor replaceable** — agent identity never becomes task identity.
7. **Claims are not facts** — persistence and verification remain separate concerns.
8. **No automatic done** — completion and settlement are explicit decisions.
9. **Compact by default** — PM agents consume bounded projections instead of rereading entire threads.
10. **Adapters at the edges** — integrations do not create competing state models.

## Intended use cases

- Long-running coding work that crosses context windows and sessions
- A PM agent delegating tasks to subagents or external agents
- Multiple topics active in one repository
- Isolated worktrees for parallel delegated tasks
- Switching executors without losing task continuity
- Project-wide progress reports without replaying worker conversations
- Evidence-aware review before merging independent branches
- Local or restricted environments where cloud orchestration is undesirable

## Name

In control systems, a _tally-back_ signal reports the observed state following a remote command.

That is the product idea:

```text
Work goes out.
State and evidence come back.
```

Tallyback does not ask you to trust the executor's final message. It keeps the return leg of delegated work visible, inspectable, and ready to reconcile.

## Contract specification

The v1 architecture is specified as a versioned wire-format contract. Status: **frozen
and implemented** — the schemas, invariant catalog, fixtures, reference validator, Store,
and Check boundary described below all exist and pass 434+ tests.

- [Normative specification](contract/SPEC.md) — the accountability model, identity,
  record graph, state model, Store↔Check boundary, and conformance model.
- [Contract bundle structure](docs/contract-bundle.md)
- [`contract/schemas/`](contract/schemas/) — the structural JSON Schemas (superseded
  `docs/schema-outline.md`)
- [`contract/invariants.json`](contract/invariants.json) — the invariant catalog
  (superseded `docs/invariants-outline.md`)
- [`contract/fixtures/`](contract/fixtures/) — the fixture & conformance vectors
  (superseded `docs/fixture-matrix.md`)
- [Migration mapping](docs/migration.md)
- [Implementation plan](docs/implementation-plan.md)
