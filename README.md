<div align="center">

# Tallyback

**Delegate work. Know what came back.**

Local, Git-native accountability for delegated agent work.

[Quick Start](docs/quick-start-walkthrough.md) · [Contract](contract/SPEC.md) · [Docs](docs/) · [Changelog](CHANGELOG.md)

[![CI](https://github.com/FoFxjc/tallyback/actions/workflows/ci.yml/badge.svg)](https://github.com/FoFxjc/tallyback/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
![Contract](https://img.shields.io/badge/contract-v1%20frozen-6f42c1)
![Status](https://img.shields.io/badge/status-0.1.x%20pre--release-orange)

</div>

---

Agent systems are good at sending work out. Tallyback gives delegated work a durable return path.

An agent saying **"done"** is a claim, not a fact. Tallyback keeps the important boundaries separate:

```text
what you asked for
        ↓
   Declaration

who tried it
        ↓
     Attempt

what came back
        ↓
      Claim

what supports it
        ↓
    Evidence

what an independent check concludes
        ↓
    Verdict

what you decide next
        ↓
   Settlement
```

The stable identity is the **Task**. Agents, sessions, models, branches, and worktrees are replaceable execution underneath it.

## Highlights

- **Durable delegated-work state** — keep the accountability trail in a local, Git-friendly `.tallyback/` ledger.
- **Explicit acceptance criteria** — declare what would count as done before execution starts.
- **Attempt ownership** — associate each run with an executor, repository, workspace, and branch.
- **Claim ≠ Evidence ≠ Verdict** — record what was said, what can be inspected, and what an independent check concluded as separate objects.
- **Explicit settlements** — `accept`, `retry`, `abandon`, or `land`; nothing silently completes itself.
- **Cold-session recovery** — reconstruct task state without replaying the original conversation.
- **Git-aware Land** — report live integration readiness, overlap, and already-integrated work without mutating Git.
- **Machine-readable validation** — validate ledger consistency in CI or automation.
- **Host-neutral core** — use the CLI directly or integrate through a host bridge; one Claude Code bridge is included.

## Quick start

Tallyback currently ships as a source pre-release. It requires **Node.js 20+** and **Git**.

```bash
git clone https://github.com/FoFxjc/tallyback.git
cd tallyback
npm ci
npm run build
npm link

tallyback --help
tallyback handshake
```

Create a demo ledger:

```bash
PROJ=/tmp/tallyback-demo
mkdir -p "$PROJ"
cd "$PROJ"

tallyback init \
  --topic "Demo" \
  --goal "try the accountability loop" \
  --repository demo
```

Then walk a Task through:

```text
Declare → Dispatch → Observe → Verify → Settle
```

The complete copy-pasteable flow — including Workspace binding, Claims, Evidence, Verdicts, Settlements, View, Watch, and Land — is in the **[Quick Start walkthrough](docs/quick-start-walkthrough.md)**.

## The accountability loop

| Stage | What it records |
| --- | --- |
| **Declare** | the Task objective and acceptance criteria |
| **Dispatch** | the Attempt, executor, repository, workspace, and branch |
| **Observe** | Claims, Evidence, blockers, and attempt outcomes |
| **Verify** | per-criterion Verdicts with confidence and rationale |
| **Settle** | the explicit decision: `accept`, `retry`, `abandon`, or `land` |

This is not a mandatory linear state machine. A Task can have several Attempts, and records can arrive over time. The loop defines **accountability boundaries**, not an orchestrator.

## Task survives the executor

```text
Task
 ├─ Attempt 1 → executor A → workspace A
 │      └─ blocked
 │
 ├─ Attempt 2 → executor B → workspace B
 │      └─ Claim + Evidence
 │
 └─ Verdict → Settlement
```

Sessions can end. Models can change. Worktrees can disappear. The Task remains the durable unit of responsibility.

## View and Land answer different questions

| | **View** | **Land** |
| --- | --- | --- |
| Source | ledger | ledger + live Git |
| Question | What was declared, attempted, claimed, verified, and settled? | What is currently actionable for integration? |
| Live Git | no | yes |
| Mutates Git | never | never |

A `land` Settlement is authorization to integrate; it is **not** proof that integration happened.

```text
Verdict
   ≠
acceptance
   ≠
landing authorization
   ≠
actual Git integration
```

`tallyback land` reports live Git reality such as:

- `git_ready` — currently actionable for integration.
- `git_behind` — branch resolves, but there is nothing ahead of the current target to land yet.
- `git_unresolved` — Git reality could not be resolved from the available workspace, binding, or ref.
- `git_integrated` — Git already proves the candidate is in the target history.

Land is read-only. It never merges, rebases, pushes, fetches, or writes to the ledger.

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

Tallyback preserves declarations, claims, evidence, judgments, and decisions. It does not become truth merely because something was written into the ledger.

## What Tallyback does not do

Tallyback deliberately does **not**:

- run or choose your agents;
- orchestrate or schedule execution;
- merge, rebase, or push branches;
- replace tests, CI, or code review;
- store conversation transcripts as the source of truth;
- turn model claims into facts;
- require a cloud service or database server.

It sits beside your execution system and records the accountability trail coming back from it.

## CLI surface

Start with:

```bash
tallyback --help
```

The main read/report commands are:

```text
view       ledger-derived task/project state
watch      execution drift / loss observations
land       live Git integration-readiness report
validate   ledger and lineage validation
```

The mutation side records the loop:

```text
task · declare · dispatch · claim · evidence · verdict · settle
```

For the exact current flag surface, use `tallyback --help` and the source-pre-release walkthrough.

## Components

| Component | Responsibility |
| --- | --- |
| **Store** | durable ledger, locking, supersession, projections, reconciliation |
| **Check** | Claim → Verdict verification boundary |
| **Watch** | on-demand execution drift / loss observation |
| **Land** | read-only Git integration readiness and overlap reporting |
| **View** | compact ledger projection |
| **Bridge** | host-neutral adapter boundary |

## Project status

Tallyback is a **0.1.x pre-release**.

- The **v1 wire-format contract is frozen and implemented**.
- CLI ergonomics and read-only report shapes may still evolve before 1.0.
- `package.json` is intentionally `private`; there is **no npm release yet**.
- The current supported install path is a source clone.
- The project is suitable for real dogfood, but does not claim production-hardening for every environment.

Known limitations and behavior details live in the component docs rather than being hidden behind the README.

## Documentation

- **[Quick Start](docs/quick-start-walkthrough.md)** — end-to-end CLI walkthrough
- **[Contract specification](contract/SPEC.md)** — normative accountability model
- **[Contract bundle](docs/contract-bundle.md)** — schemas, invariants, fixtures, manifest
- **[Land](docs/land-design.md)** — Git-aware integration-readiness behavior
- **[View](docs/view-design.md)** — ledger projection behavior
- **[Watch](docs/watch-design.md)** — observation behavior
- **[Bridge](docs/bridge-design.md)** — host integration boundary
- **[Branch workflow](docs/branch-workflow.md)** — branch / reconciliation model
- **[Migration](docs/migration.md)** — migration mapping
- **[Security](SECURITY.md)**
- **[Changelog](CHANGELOG.md)**

## License

Tallyback is licensed under the **[Apache License 2.0](LICENSE)**.
