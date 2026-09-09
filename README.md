# Tallyback

> **Delegate work. Know what came back.**

Tallyback is local, Git-native accountability infrastructure for delegated agent work.

It keeps a durable account of what was assigned, what an executor claims happened, what the repository can prove, and whether the result is ready to land.

> [!IMPORTANT]
> Tallyback is currently in the architecture and design phase. This repository defines the ecosystem that will bring [claude-task-store](https://github.com/FoFxjc/claude-task-store) and [done-or-not](https://github.com/FoFxjc/done-or-not) together. There is no Tallyback release yet.

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

| Component            | Responsibility                                                                | Status                                                                                  |
| -------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Tallyback Store**  | Tasks, attempts, checkpoints, decisions, blockers, and compact resume context | Existing foundation in [claude-task-store](https://github.com/FoFxjc/claude-task-store) |
| **Tallyback Check**  | Semantic verification of implementation and merge-readiness claims            | Existing foundation in [done-or-not](https://github.com/FoFxjc/done-or-not)             |
| **Tallyback Watch**  | Optional external detection of stale, lost, or inconsistent execution         | Planned                                                                                 |
| **Tallyback Land**   | Integration readiness, ordering, conflict awareness, and merge settlement     | v1 implemented — read-only readiness/conflict report over `ready_to_land` (`src/land/`) |
| **Tallyback View**   | Local project status, reports, evidence trails, and visualization             | v1 implemented — one compact per-task report (`src/view/`)                             |
| **Tallyback Bridge** | Adapters for agent hosts, stores, and worktree managers                       | Planned                                                                                 |

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

## Initial direction

The first milestone is to define a shared execution-accountability model that can unify the existing Store and Check foundations without turning either into a workflow engine.

The model must support:

- durable topics and tasks;
- multiple attempts per task;
- executor, session, worktree, and branch references;
- explicit claims and evidence;
- independent verification verdicts;
- blockers and next actions;
- compact PM-agent projections;
- explicit integration settlement.

Watchdog behavior, visualization, and third-party adapters should build on that model rather than create parallel sources of state.

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
and Check boundary described below all exist and pass 300+ tests.

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
