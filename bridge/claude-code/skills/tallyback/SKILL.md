---
description: Use when driving a Tallyback-tracked task through its lifecycle (declare, dispatch, observe, verify, settle) or when asked for a land, view, or watch report. Surfaces each loop phase's precondition and guardrail instead of forwarding raw `tallyback` commands.
---

# Tallyback loop

Tallyback externalizes the state of delegated work: what was promised, who attempted it,
what came back, what was verified, and what was settled. This skill is the semantic layer
over the `tallyback` CLI — it tells you which phase applies now and what must already be
true before you run it. It is not a passthrough: typing a raw `tallyback` command is always
still an option, but decide the phase and precondition first.

## Handshake first

Before anything else, run:

```
tallyback handshake
```

Check its output against what this skill was written for:

- `command_api_version` matches what this skill/plugin was written against
- `supported_contract_versions` includes the ledger's `schema_version` before any mutating command runs; an unknown contract major must fail closed and never mutate
- `features` lists the interfaces a workflow depends on (e.g. `land`, `view`, `watch`) before relying on them

If the handshake does not match, stop. Do not run a mutating command against a ledger this
skill's version was not written to understand. The CLI itself enforces this (`preflight()`
fails closed on an unsupported contract version) — this check is belt-and-suspenders, not
the real gate.

## The loop: declare → dispatch → observe → verify → settle

### Declare

- **Precondition**: a Task already exists (created via `topic`/`task`) to declare against; superseding an existing Declaration requires naming it explicitly with `--supersedes`.
- **Command**: `tallyback declare`
- **Guardrail**: rules validate explicit operations; they never advance state automatically. Declare only creates a TaskDeclaration — it does not dispatch or authorize anything else.

### Dispatch

- **Precondition**: a Declaration exists for the Task, and a Repository/Workspace are registered for the Attempt to run in.
- **Commands**: `tallyback dispatch`, `tallyback end`
- **Guardrail**: ending an Attempt does not declare the Task complete. `end` records how an Attempt stopped — it never authorizes settlement.

### Observe

- **Precondition**: an open Attempt exists to attribute the Claim, Evidence, or Blocker to.
- **Commands**: `tallyback claim`, `tallyback evidence`, `tallyback block`, `tallyback resolve`
- **Guardrail**: adding evidence does not create a positive Verdict. Observe records facts — it never renders a verdict.

### Verify

- **Precondition**: a Claim exists naming the Declaration and criteria being checked.
- **Commands**: `tallyback begin-check`, `tallyback record-check`
- **Guardrail**: a passing check does not automatically accept the Task. Verify records a CheckInvocation/CheckResult and, within it, Reconciliations and/or a Verdict — it never itself settles the Task.

### Settle

- **Precondition**: a semantically sufficient basis exists for the named decision — a Verdict, an AttemptEnd, and/or named Blockers.
- **Command**: `tallyback settle`
- **Guardrail**: a positive Verdict does not automatically authorize landing. Settle requires an explicit, attributed decision naming its basis.

## Read-only reports: land, view, watch

These never mutate the ledger. Reach for them like this:

- **`tallyback land`** — cross-checks the ledger's `ready_to_land` projection against live Git state. Use before proposing a Settle with `--decision land`, to confirm the branch is actually mergeable and see any file-level conflicts with other ready tasks.
- **`tallyback view`** — the compact per-task tallyback: declaration, attempts, claims, evidence pointers, blockers, verification, settlement, status, and next_action. Use this to resume or report on a task without rereading its whole history.
- **`tallyback watch`** — cross-checks every open Attempt against live workspace/Git state for lost / claim_without_branch_advance / unresolved conditions plus the ledger's own stale projection. Use this to sweep for attempts that have gone quiet or diverged before deciding what to do next.

## What this skill will not do

It will not forward `$ARGUMENTS` straight to `tallyback` as a subcommand passthrough, and
it will not skip the handshake check above. A rejected mutation (`{ ok: false }`) is an
ordinary outcome, not something to retry blindly — read the `code`/`message` it returns and
address the actual precondition that failed.
