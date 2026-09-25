---
name: tallyback
description: Use when driving a Tallyback-tracked task through its lifecycle (declare, dispatch, observe, verify, settle) or when asked for a land, view, or watch report. Surfaces each loop phase's precondition and guardrail instead of forwarding raw `tallyback` commands.
---

# Tallyback loop

## Start here

1. Run `tallyback view`.
2. Run the command it suggests: the top-level `next_action.command` while the ledger has
   no Task, then each task's `next_command.command`. Fill only the `<placeholder>` values
   listed in `requires` — assessments, decisions, and statements are yours to judge; never
   invent any other part of the command.
3. Repeat after each step.
4. After `dispatch`, before changing anything: do the **Execution Fit Check** (below).

Say who you are: Tallyback cannot know which agent is typing, so records you author are
`unknown:unattributed` unless you pass `--actor <kind>:<id>` (e.g. `--actor executor:claude-code`)
or the host sets `TALLYBACK_ACTOR` (see the plugin README).

For any command's required flags, accepted values, and examples, run
`tallyback <command> --help` — it never runs the command.

If `view` returns `"code": "mutation.ledger_not_initialized"`, this repository has no
ledger yet: run the `next_action.command` it gives (`tallyback init`), then `view` again.
Any other `{ "ok": false }` code is a real problem with an existing ledger — report it;
do not re-initialize over it.

Do not infer Tallyback state from filesystem errors, Git status, passing tests, or a
worker saying "done". Work is only settled when `view` shows a Settlement
(`next_action: "settled: <decision>"`). `status.ready_to_land` is the ledger half only;
`tallyback land` checks the Git half.

Tallyback externalizes the state of delegated work: what was promised, who attempted it,
what came back, what was verified, and what was settled. This skill is the semantic layer
over the `tallyback` CLI — it tells you which phase applies now and what must already be
true before you run it. It is not a passthrough: typing a raw `tallyback` command is always
still an option, but decide the phase and precondition first.

## Handshake before mutating

Before the first mutating command, run:

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

### Execution Fit Check (after dispatch, before work)

Ask: can I responsibly attempt **and verify** this Attempt without guessing, bypassing a
safeguard, exceeding my authority, or calling unverified work verified?

Check only:

1. **Criteria** — do I understand each declared acceptance criterion?
2. **Capability** — can I do the work?
3. **Verification** — is there a credible way to get evidence for the important criteria?
4. **Tools and authority** — do I have what I need, and am I allowed? (Committing, merging,
   or settling `land` without being asked is usually beyond an executor's authority.)

Answer these concretely — they are the evidence; the label is only a summary:

- **Hardest part** — what is most likely to go wrong or be missed?
- **Evidence** — what would demonstrate the important criteria, and can I get it here?
- **Not authorised / not equipped** — what will I explicitly not do (e.g. commit, merge,
  `land`, reach production, touch a frozen contract)?
- **Stop signal** — what observation would make me stop, retry, or escalate?

Then pick one:

- `FIT` — a credible path to do and verify it.
- `CONDITIONAL` — useful work is possible, but a named limit (capability, evidence,
  tooling, or authority) means some criterion cannot be fully verified or done here.
- `NOT_FIT` — it would need guessing, bypassing a guardrail, exceeding authority, or
  claiming verification I cannot get.

Record it on the Attempt (a Decision has no lifecycle effect):

```
tallyback decision --subject-kind attempt --subject-id <att_…> --role execution_choice \
  --question "Execution fit" --choice "<FIT|CONDITIONAL|NOT_FIT>: <one line>" \
  --rationale "criteria: …; capability: …; hardest: …; evidence: …; not authorised/equipped: …; stop if: …" \
  --actor <you>
```

- Fit is an assessment — not permission, Evidence, a Verdict, or a Settlement. `FIT` does
  not mean it will work.
- `CONDITIONAL`: do what can be done, then carry the named limit into your Claim, your
  Verdict (`--limitation`, `--uncertainty`, and not `supported` for a criterion you could
  not verify), and your final report. Never let "tested locally" become "verified".
- `NOT_FIT`: no speculative implementation, no Evidence for work not done.
  `tallyback end --attempt-id <att_…> --outcome returned --reason "NOT_FIT: …"`, raise
  `tallyback block` naming what is missing, and report what a person or later executor
  would need to supply.
- **Re-assess when reality disagrees** (e.g. a check fails after you believed you were
  done): record a new Decision with `--supersedes <dec_…>` instead of settling over it. If
  more work is needed, `end` the Attempt, `settle --decision retry --attempt-end-id <ate_…>`
  (add `--supersedes <set_…>` if the Attempt was already settled), and dispatch a new Attempt.

**A Fit belongs to the executor that made it.** A new executor or a fresh session resuming
this task never inherits another executor's Fit — not even a `FIT` on the same Attempt.
`tallyback view` shows the current one as `attempts[].execution_fit`. If it exists, record
your own over it: the same `tallyback decision …` with `--supersedes <that decision_id>`.
Without `--supersedes` the ledger refuses a second one; that refusal means "supersede it",
never "a Fit already exists, so skip mine". Also check `git status`/`git diff`: uncommitted
changes may be the earlier executor's unverified work.

### Observe

- **Precondition**: an open Attempt exists to attribute the Claim, Evidence, or Blocker to.
- **Commands**: `tallyback claim`, `tallyback evidence`, `tallyback block`, `tallyback resolve`
- **Guardrail**: adding evidence does not create a positive Verdict. Observe records facts — it never renders a verdict.
- **Order**: record `evidence` first (put the human-readable result, e.g. counts and failing tests, in `--note`), then `claim … --evidence <evi_…>` to link it.

### Verify

- **Precondition**: a Claim exists naming the Declaration and criteria being checked.
- **Commands**: `tallyback verdict` (per criterion: `--criterion <code>=<assessment>`, and say what supports it with `--finding <code>=<summary>` / `--finding-basis <code>=<evi_…>`); `begin-check` / `record-check` are the low-level form that takes raw records
- **Guardrail**: a passing check does not automatically accept the Task. Verify records a CheckInvocation/CheckResult and, within it, Reconciliations and/or a Verdict — it never itself settles the Task.

### Settle

- **Precondition**: a semantically sufficient basis exists for the named decision — a Verdict, an AttemptEnd, and/or named Blockers.
- **Command**: `tallyback settle`
- **Guardrail**: a positive Verdict does not automatically authorize landing. Settle requires an explicit, attributed decision naming its basis.

## Read-only reports: land, view, watch

These never mutate the ledger. Reach for them like this:

- **`tallyback land`** — cross-checks the ledger's `ready_to_land` projection against live Git state. A task only enters `ready_to_land` once an explicit `tallyback settle --decision land` has been recorded for it, so run `land` _after_ that Settle, not before — it reports on already-authorized work, confirming the branch is actually mergeable and surfacing any file-level conflicts with other ready tasks. Land itself never merges; the actual Git integration happens outside Tallyback.
- **`tallyback view`** — the compact per-task tallyback: declaration, attempts (with each one's current `execution_fit`), claims, evidence pointers, blockers, verification, settlement, status, and next_action. Use this to resume or report on a task without rereading its whole history.
- **`tallyback watch`** — cross-checks every open Attempt against live workspace/Git state for lost / claim_without_branch_advance / unresolved conditions plus the ledger's own stale projection. Use this to sweep for attempts that have gone quiet or diverged before deciding what to do next.

## What this skill will not do

It will not forward `$ARGUMENTS` straight to `tallyback` as a subcommand passthrough, and
it will not skip the handshake check above. A rejected mutation (`{ ok: false }`) is an
ordinary outcome, not something to retry blindly — read the `code`/`message` it returns and
address the actual precondition that failed.
