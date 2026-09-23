<div align="center">

# Tallyback

**Delegate work. Know what came back.**

Local, Git-native accountability for delegated agent work.

[Quick Start](docs/quick-start-walkthrough.md) · [Contract](contract/SPEC.md) · [Docs](docs/) · [Changelog](CHANGELOG.md)

[![CI](https://github.com/FoFxjc/tallyback/actions/workflows/ci.yml/badge.svg)](https://github.com/FoFxjc/tallyback/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
![Contract](https://img.shields.io/badge/contract-v1%20frozen-6f42c1)
![Status](https://img.shields.io/badge/status-0.1.0%20pre--release-orange)

</div>

---

Subagents already solve delegation. Agent teams already solve coordination. Tallyback starts where coordination stops: the return path.

```text
Human
  ↓ intent / oversight
Primary / Coordinating Agent
  ↓ Declare + Dispatch
Worker / Subagent
  ↓ Claim + Evidence
Tallyback
  ↓ Reconciliation + Verdict
Primary / Coordinating Agent
  ↓ explicit Settlement
Tallyback ledger
```

The coordinating agent is Tallyback's primary operational user. Human oversight stays upstream; Tallyback models one delegated-work accountability boundary, not a recursive agent hierarchy.

A worker saying **"done"** is a Claim, not a fact:

```text
Claim
  ≠
Evidence
  ≠
Reconciliation
  ≠
Verdict
  ≠
Settlement
  ≠
Git reality
```

The stable identity is the **Task**. Agents, sessions, models, branches, and worktrees are replaceable execution underneath it.

## Highlights

- **Durable delegated-work state** — keep the accountability trail in a local, Git-friendly `.tallyback/` ledger.
- **Explicit acceptance criteria** — declare what would count as done before execution starts.
- **Attempt ownership** — associate each run with an executor, repository, workspace, and branch.
- **Claim ≠ Evidence ≠ Reconciliation ≠ Verdict** — keep worker assertions, inspectable evidence, factual reconciliation, and semantic judgment separate.
- **Explicit settlements** — `accept`, `retry`, `abandon`, or `land`; nothing silently completes itself.
- **Cold-session recovery** — reconstruct task state without replaying the original conversation.
- **Git-aware Land** — report live integration readiness, overlap, and already-integrated work without mutating Git.
- **Machine-readable validation** — validate ledger consistency in CI or automation.
- **Host-neutral core** — coordinating agents can use the CLI directly or integrate through a thin host bridge without changing the accountability model.

## Coordination vs accountability

Tallyback does not replace subagents, agent teams, or orchestration. Those systems answer **who is doing what**. Tallyback answers **what you actually know when the work comes back**.

| Coordination layer        | Tallyback accountability layer                                           |
| ------------------------- | ------------------------------------------------------------------------ |
| delegate work             | record the Claim                                                         |
| parallelize execution     | bind inspectable Evidence                                                 |
| share progress            | reconcile Evidence against repository / Git facts                        |
| return results            | issue a Verdict against declared criteria                                |
| manage worker activity    | record an explicit Settlement: `accept`, `retry`, `abandon`, or `land` |
| keep the workflow moving  | reconstruct ledger state and current Git integration reality             |

If delegation and coordination are enough for your workflow, you may not need Tallyback. It becomes useful when **"the worker said it was done"** is no longer sufficient as the durable return record.

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

- **Declare** — the Task objective and acceptance criteria.
- **Dispatch** — the Attempt, executor, repository, workspace, and branch.
- **Observe** — Claims, Evidence, blockers, and attempt outcomes.
- **Verify** — reconcile Evidence against inspectable reality, then record per-criterion Verdicts with confidence and rationale.
- **Settle** — the explicit decision: `accept`, `retry`, `abandon`, or `land`.

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

**View** reads ledger reality: what was declared, attempted, claimed, verified,
and settled. It does not read live Git.

**Land** adds live Git reality: what is currently actionable for integration.
Both are read-only; neither mutates Git.

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

- **Store** — durable ledger, locking, supersession, projections, reconciliation.
- **Check** — Claim → Verdict verification boundary.
- **Watch** — on-demand execution drift / loss observation.
- **Land** — read-only Git integration readiness and overlap reporting.
- **View** — compact ledger projection.
- **Bridge** — host-neutral adapter boundary.

## Project status

Tallyback is currently **0.1.0 pre-release**.

- The **v1 wire-format contract is frozen and implemented**.
- The current implementation supports the **Primary Agent → Worker/Subagent** lifecycle end to end, including typed Git Evidence, factual Reconciliation, Verdict, Settlement, and Land.
- CLI ergonomics and read-only report shapes may still evolve before 1.0.
- `package.json` is intentionally `private`; there is **no npm release yet**.
- The current supported install path is a source clone.

Known limitations and behavior details live in the component docs rather than being hidden behind the README.

## Roadmap

Tallyback's core accountability model is intentionally small. The roadmap focuses on making that model easier to adopt across agent environments without turning Tallyback into an orchestration framework.

### Now

- Keep the **Primary Agent → Worker/Subagent** usage path explicit across the CLI, Bridge, and documentation.
- Improve installation, documentation, and release readiness for public use.
- Keep View, Watch, and Land small, read-only, and consistent with the frozen v1 contract.

### Next

- Add a thin **Pi** integration built on the existing host-neutral Bridge.
- Add **OMP / Oh My Pi** support while reusing the same semantic workflow where possible.
- Publish an installable package for supported agent hosts.
- Keep the accountability model portable across hosts without introducing host-specific state models.

### Later

Potential additions, driven by demonstrated user needs:

- Additional agent-host adapters.
- Simpler installation and distribution.
- Richer read-only views and reporting.
- Evidence retention and archival ergonomics.
- Additional checker and evidence-provider integrations.

Tallyback does **not** aim to become an agent orchestrator, scheduler, workflow engine, autonomous merger, model-routing system, or recursive agent-topology model.

The **Task** remains the stable unit of responsibility; agents remain replaceable executors.

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
