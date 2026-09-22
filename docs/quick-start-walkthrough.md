# Full Quick Start walkthrough

The [README](../README.md#quick-start) Quick Start gets you through `init`. This
walkthrough continues the loop end to end: **declare → dispatch → observe → verify →
settle**, plus the read-only reports (`view`, `validate`) and the Git-backed layer
(`land`, `watch`) that needs a bound Workspace.

Every command below has been run against this repository's CLI as written; there are
no phantom flags.

## Requirements

- **Node.js** `>= 20` (matches `engines.node` in `package.json`).
- **Git** available on `$PATH` for the live Git-backed `land` and `watch` operations.
  `view` is a pure ledger projection and does not require Git.
- **Local filesystem access** — the ledger is a `.tallyback/` directory under the
  project root.

No database server, cloud account, network round-trip, or remote clone/fetch is
required.

## Install

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

`npm link` creates the `tallyback` executable shim from `package.json#bin`. Merely
adding `dist/` to `PATH` is not sufficient because the build artifact is named
`dist/cli.js`, not `dist/tallyback`.

If you do not want to create an npm link, invoke the built CLI directly instead:

```bash
node /path/to/tallyback/dist/cli.js handshake
node /path/to/tallyback/dist/cli.js version
```

`tallyback --help` (or `tallyback help`) prints a compact top-level command list and
exits 0 without touching any project directory or ledger — safe to run from anywhere,
including before `init`.

An npm-distributable package is **not** part of this pre-release: `package.json` is
marked `private`, and CI's `package-smoke` job packs/installs a tarball only to prove
the packaging surface stays correct — not as a published-install path.

## The full loop

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

## `accept` versus `land`: two different Settlement decisions

`--decision accept` and `--decision land` are both valid `tallyback settle` decisions,
but they mean different things and are **not interchangeable**:

- `accept` records that the result was judged acceptable. It does not authorize
  integration.
- `land` records explicit authorization to integrate. Only an **effective**
  (non-superseded) `land` Settlement enters the `ready_to_land` projection that
  `tallyback land` reads.

If a task was settled with `accept` and later needs to be picked up by `tallyback
land`, supersede the `accept` Settlement with a new `land` Settlement (`tallyback
settle --decision land --supersedes <prior settlement id> ...`) — Settlements are
immutable, so this is a new record, not an edit.

A Verdict (`tallyback verdict`) is a separate concept from both: it is an assessment of
whether the Claim's evidence supports the declared criteria.
`Verdict != acceptance != landing authorization != actual Git integration`. Even after
a `land` Settlement, `tallyback land` remains read-only and advisory — it reports
integration readiness and never performs the merge itself; see
[Known limitations](../README.md#known-limitations) in the README.

Each command prints machine-readable JSON to stdout and a one-line human summary to
stderr, so the same commands work in a terminal and in a pipeline.

For the full command surface (every flag, every record type), see
[`src/cli.ts`](../src/cli.ts); for the underlying API, see [`src/index.ts`](../src/index.ts).
