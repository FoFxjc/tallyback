# Tallyback Watch — design (v1, on-demand, read-only)

> Historical v1 design record. The implementation described here now exists under
> `src/watch/`; this document is retained as the design record of the component, not as
> work-in-progress planning.

## 1. What Watch is for

README's ecosystem table: *"Optional external detection of stale, lost, or drifting
execution."* Of those three:

- **stale** already has a full, tested implementation: `staleTaskIds`/`isTaskStale`
  (`src/ledger/projections.ts`), surfaced today through `computeProjectionValues(...).stale`
  and, per-task, through View's `status.stale`. Watch does not reimplement this — it is
  purely ledger-time-based (last record timestamp vs. now) and needs no external I/O, so
  there is nothing left for a "host-layer" component to add here. Watch **surfaces** it,
  it does not recompute it.
- **lost** and **claim_without_branch_advance** are new: both require cross-referencing the ledger against
  the outside world (Git + filesystem), the same "host-layer" gap `src/land/report.ts`
  already fills for `ready_to_land`. Nothing in `src/ledger/` or `src/check/` currently
  detects either, because a pure `Snapshot` function cannot perform live I/O (the same
  argument SPEC §7.2 makes for `ready_to_land`'s Git half).

So Watch v1's actual new work is narrow: for **open** work (an Attempt with no
`AttemptEnd` and no effective Settlement — i.e., not yet at rest), detect two things nothing
else currently detects:

1. **Lost** — the Attempt's bound workspace no longer resolves: the worktree was deleted,
   the binding is missing, or the path is no longer a Git repository. The ledger still
   thinks the work is in progress; the physical place it was supposed to be happening
   doesn't exist anymore.
2. **`claim_without_branch_advance`** — the Attempt has at least one Claim (the executor asserted progress),
   but the bound branch shows zero commits since the Attempt was dispatched. The name
   names the observation (a claim exists, the branch has not advanced); it does not
   conclude the claim is wrong — a claim can describe investigation, tests, analysis,
   no-op outcomes, or uncommitted work, all of which the executor's own Evidence may
   legitimately support. Watch names what the ledger and Git disagree about; whether the
   claim is correct is left to Check + Verdict (README: *"An agent saying 'done' is a claim,
   not a fact"*).

## 2. Bounded scope for v1

Per `docs/implementation-plan.md` §2 and the project's non-goals, Watch v1 is
**on-demand, read-only, and advisory only** — the same posture as Land and View:

- **No daemon, no scheduler, no polling loop, no cron.** `docs/implementation-plan.md`
  §2 rules out a workflow engine and telemetry; a background watcher process is exactly
  that. Watch is a single CLI invocation (`tallyback watch`) that reports the current
  state of the world *right now* — same as `tallyback land`/`tallyback view`. A host that
  wants periodic checking runs this command from its own scheduler (a CI cron job, a
  systemd timer) — Tallyback does not provide or manage that scheduler itself.
- **No automatic action.** Detecting a lost or `claim_without_branch_advance` Attempt never raises a
  Blocker, never writes to the ledger, never mutates anything. `docs/branch-workflow.md`'s
  and Land's precedent both hold: a report names what a human/PM agent should look at;
  raising an actual Blocker is a separate, explicit `tallyback block` call by whoever acts
  on the report (SPEC §7: "The runtime does not infer or write semantic conclusions").
- **No remote fetch.** Same as Land: operates on the local worktree's current state only.
- **Reuses, never re-derives.** `stale` comes straight from `computeProjectionValues`;
  workspace resolution reuses `resolveWorkspace`/`runGit` from `src/check/resolution.ts` —
  the same helpers Land already built on. Watch introduces no second Git/bindings
  mechanism.
- **No new schema, no new record type.**

## 3. Inputs

Watch evaluates every task with at least one **open** Attempt: an Attempt with no
`AttemptEnd` record and no effective (non-superseded) Settlement for that
`(task_id, attempt_id)` pair — the same "not yet at rest" condition `ready_to_land`'s
absence already implies, expressed directly over Attempts/AttemptEnds/Settlements rather
than inferred from `ready_to_land`'s presence (a task can be open without ever having a
`land`-decision Settlement, e.g. it's mid-flight or was `retry`d).

For each open Attempt:

- **Stale** — pulled directly from `computeProjectionValues(snapshot, policy).stale`
  (same `StalePolicy`/48h-default convention as View's `--stale-after-ms`).
- **Lost** — resolve the Attempt's `repository_id`/`workspace_id` via
  `resolveWorkspace` (`src/check/resolution.ts`). Any non-ok `ResolutionCode` (including
  `repository_unbound`, `workspace_unbound`, `path_unavailable`, `not_a_git_repository`)
  means "lost" — report the code/reason verbatim, the same way Land reports
  `git_unresolved`.
- **`claim_without_branch_advance`** — only checked when resolution succeeds (an Attempt can't be both
  "lost" and `claim_without_branch_advance` — lost is a strict precondition failure). Resolve the
  Workspace's `branch` field (as Land does); if present, run
  `git log --since=<dispatched_at> --oneline <branch>` (read-only) in the resolved root.
  Zero lines back **and** at least one Claim exists on this Attempt → `claim_without_branch_advance`:
  a claim exists but the branch shows no activity since dispatch. No `branch` field on the
  Workspace → not evaluable, reported as `unresolved` (same posture as Land's
  `git_unresolved` for a missing branch), not silently skipped.

## 4. Output shape

```jsonc
{
  "generated_from_revision": 42,
  "policy": { "stale_after_ms": 172800000 },
  "findings": [
    {
      "task_id": "tsk_...",
      "attempt_id": "att_...",
      "kind": "lost", // "stale" | "lost" | "claim_without_branch_advance" | "unresolved"
      "code": "resolution.path_unavailable", // present for lost/unresolved
      "reason": "worktree root does not exist",
      "detail": { "last_activity_at": "...", "claim_count": 1 } // kind-specific, informational only
    }
  ],
  "summary": { "open_attempts": 3, "stale": 1, "lost": 1, "claim_without_branch_advance": 0, "unresolved": 0 }
}
```

One Attempt can appear more than once (e.g. both `stale` and `lost`) — `findings` is a
flat list of independent observations, not a single verdict per Attempt; Watch does not
rank or prioritize them into one conclusion (that synthesis is left to whoever consumes
the report, per the same "no rich export profile" restraint View already applies to its
own output).

## 5. Non-goals (v1)

- No scheduler/daemon/cron (§2).
- No automatic Blocker creation or any other ledger write.
- No remote fetch; local worktree state only.
- No notification/alerting integration (Slack, email, webhooks) — that is exactly the
  "telemetry, remote service" surface `docs/implementation-plan.md` §2 rules out. A host
  wanting alerts pipes this command's JSON output into its own notifier.
- No new "lost" / `claim_without_branch_advance` classification beyond §3 — no attempt to detect, say,
  force-pushed history, rewritten commits, or executor crash signals; those would need
  information this ledger + a local worktree cannot provide.

## 6. Shape

- `src/watch/report.ts` — pure core except for one injected Git-and-clock capability
  (mirrors `src/land/report.ts`'s injected `GitResolver`): `buildWatchReport(snapshot,
  resolve: WatchResolver, policy: StalePolicy): WatchReport`. `WatchResolver` wraps both
  the workspace resolution and the `git log --since` check behind one interface so the
  module is unit-testable without shelling out, exactly like Land.
- `src/watch/git.ts` — the real resolver, built on `resolveWorkspace`/`runGit`
  (`src/check/resolution.ts`) — no second exec wrapper, no second bindings mechanism
  (same reuse principle as `src/land/git.ts`).
- CLI: `tallyback watch [--stale-after-ms <n>]` — read-only, dispatched alongside
  `show`/`list`/`land`/`view` (after `Store.open`, before the mutating preflight), JSON to
  stdout via `print()`, one-line human summary to stderr, matching
  `runLand`/`runView`'s convention exactly.
