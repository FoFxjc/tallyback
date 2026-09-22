# Tallyback View — behavior (v1, one report shape)

> Implemented behavior reference for the `tallyback view` command and the
> `src/view/` module. View is the second host-layer component built on the frozen
> v1 contract; the v1 scope below matches the running implementation.
> History: this file began life as a planning document before `src/view/` was
> written; the wording has been reconciled with the current behavior of
> `src/view/report.ts` and `src/cli.ts:runView` for the public pre-release.

## 1. What View is for

README's ecosystem table describes View's responsibility as "local project status,
reports, evidence trails, and visualization." The contract already names the exact data
shape View exists to produce, twice:

- README §"The stable identity is the task": *"A **tallyback** is the compact structured
  return from delegated work: current state, claims, evidence references, blockers, next
  action, verification status, and integration readiness. It is not a transcript and does
  not duplicate the repository."*
- SPEC §6: *"The compact tallyback returned to an agent is a derived resume/handoff
  projection of this ledger, not the ledger itself."*

View v1 is the CLI-level implementation of that projection: for one task (or every task),
assemble current state + claims + evidence references + blockers + next action +
verification status + integration readiness into the one compact shape those two
passages already describe, from the existing Store snapshot — no new record type, no new
persisted state.

## 2. Bounded scope for v1

`docs/implementation-plan.md` §2 lists **"no rich View/export profiles"** as an explicit
non-goal. That constrains the shape of this feature directly:

- **One report shape, not a template system.** No `--format html|markdown|csv` switch, no
  configurable field selection, no per-user report profiles. JSON to stdout (the
  compact, structured shape), one human-readable summary to stderr — the exact convention
  `validate`/`land` already use. If a richer rendering is wanted later (an HTML report,
  say — like the one a PM produced by hand for this repo), that consumes this JSON as
  input; it is not part of View v1 itself.
- **Read-only.** View computes projections over the existing snapshot; it writes nothing,
  same as `show`/`list`/`validate`/`land`.
- **No new persisted state.** The per-task shape is assembled on demand from
  `store.currentSnapshot()`; it is never written into `state.json` (SPEC §7.2: derived
  projections are never authoritative and never canonical).
- **Settlement is not a Task status.** A Settlement is a record (and a Verdict may rest
  on a `verification_exception` with no CheckInvocation at all — SPEC §5.11). View
  surfaces Settlements as a recorded decision; it does **not** invent an
  `active` / `archived` / `completed` Task lifecycle, and every Task remains surfaceable
  through View regardless of its Settlement decision. Active-vs-historical filtering
  on top of View is an open retention-design question, explicitly out of scope for v1.
- **Evidence pointers, not payload dumps.** SPEC §6's "compact" property is explicitly
  "evidence pointers rather than embedded blobs." View reports each Evidence record's
  `evidence_id`, `kind`, `submitted_by`, `submitted_at`, and `note` if present — never the
  full `payload`, which can be arbitrarily large and belongs to the ledger file, not a
  status report.
- **`next_action` is mechanical, not a judgment.** SPEC §7 is explicit: "The runtime does
  **not** infer or write semantic conclusions... a passing test does not automatically
  accept the Task... a positive Verdict does not automatically authorize landing." So
  `next_action` never says a task is "done," "good," or "safe to land" — it names which
  **documented command** in the Declare→Dispatch→Observe→Verify→Settle loop has not yet
  been called for this task, purely from record presence/absence (see §4). This is a
  structural fact about the graph, not a semantic verdict.

## 3. Inputs

For a target set of `task_id`s (default: every task in the project; `--task-id` narrows to
one):

- The task's Topic (`topic_id`, `title` → name/goal).
- Its current (non-superseded) `TaskDeclaration` head — `objective`, `criteria`. Use
  `effectiveRecords` from `src/ledger/supersession.ts`, the same helper `projections.ts`
  and `src/land/report.ts` already use; View does not re-implement head resolution.
- Its Attempts, each with `executor`, `repository_id`, `workspace_id`, `dispatched_at`,
  and whether an `AttemptEnd` exists for it.
- Its Claims (`statement`, `evidence_ids`, `claimed_by`, `claimed_at`).
- Evidence referenced by those claims — pointers only (§2).
- Its unresolved Blockers (no effective `BlockerResolution`) — reuse
  `computeProjectionValues(snapshot).blocked`, do not re-derive resolution status.
- Applicable Verdicts (via `computeProjectionValues(snapshot).verified`, mapping through
  each Claim's subject) — `conclusion`, `finality`, `confidence`.
- Its effective Settlement, if any (`decision`, `verification_exception`,
  `rationale`) — reuse `effectiveRecords`.
- `ready_to_land` / `stale` membership — both already computed by
  `computeProjectionValues`; View never recomputes them independently (staleness needs a
  `StalePolicy` — `--stale-after-ms` on the CLI, defaulting to the existing 48h policy
  documented in SPEC §7.2, passed straight through).

View reuses every one of these from `src/ledger/projections.ts` and
`src/ledger/supersession.ts` rather than re-deriving graph facts a second time — the same
principle `src/land/report.ts` already follows for `ready_to_land`.

## 4. `next_action` — the mechanical derivation

Checked in this order (first match wins), purely from record presence, not content
quality:

1. Unresolved blocker exists → `"resolve blocker"` (blocking regardless of loop position;
   a task can be blocked at any stage).
2. An effective Settlement exists → `"settled: <decision>"` (echoes the recorded decision
   verbatim — accept/retry/abandon/land — never upgrades it to "done"). Checked here,
   immediately after the blocker check and before declare/dispatch/observe/verify, because
   a Settlement can rest on a `verification_exception` with no Verdict — and no
   CheckInvocation — at all (SPEC §5.11). A settled task is a recorded decision; View
   treats it as a resting state for the documented loop regardless of whether the check
   chain ran — gating this behind steps 3-6 would leave such a task permanently
   reporting `"verify (begin-check)"`.
3. No effective `TaskDeclaration` → `"declare"`.
4. No Attempt exists → `"dispatch"`.
5. Latest Attempt has no Claim referencing it → `"observe (claim)"`.
6. Latest Claim has no CheckInvocation over it → `"verify (begin-check)"`.
7. Open CheckInvocation has no CheckResult → `"verify (record-check)"`.
8. A CheckResult/Verdict exists but no effective Settlement → `"settle"`.

This list is a fixed, closed set of the documented loop commands (`declare` / `dispatch` /
`observe` / `verify` / `settle`) — nothing here is invented beyond what SPEC §7 already
names as the loop's explicit commands.

## 5. Output shape

```jsonc
{
  "generated_from_revision": 42,
  "tasks": [
    {
      "task_id": "tsk_...",
      "title": "...",
      "topic_id": "top_...",
      "declaration": { "declaration_id": "dcl_...", "objective": "...", "criteria": [...] } ,
      "attempts": [{ "attempt_id": "...", "executor": {...}, "workspace_id": "...", "repository_id": "...", "dispatched_at": "...", "ended": false }],
      "claims": [{ "claim_id": "...", "statement": "...", "evidence_ids": [...], "claimed_by": {...}, "claimed_at": "..." }],
      "evidence": [{ "evidence_id": "...", "kind": "observation", "submitted_by": {...}, "submitted_at": "...", "note": "..." }],
      "blockers": [{ "blocker_id": "...", "description": "...", "raised_by": {...}, "raised_at": "..." }],
      "verification": [{ "verdict_id": "...", "conclusion": "supported", "finality": "final", "confidence": {...} }],
      "settlement": { "settlement_id": "...", "decision": "land", "verification_exception": null, "rationale": "..." },
      "status": { "blocked": false, "verified": true, "settled": true, "dispatched": true, "ready_to_land": true, "stale": false },
      "next_action": "settled: land"
    }
  ],
  "summary": { "task_count": 1, "blocked": 0, "ready_to_land": 1, "stale": 0, "settled": 1 }
}
```

`summary` is a small rollup over `tasks[].status`, not a second source of truth — it is
computed from the same array the caller already has.

## 6. Non-goals (v1)

- No HTML/Markdown/CSV rendering, no template selection (§2).
- No evidence payload inclusion.
- No new schema, no new record type, no ledger writes.
- No `active` / `archived` / `completed` Task lifecycle filter — every Task remains
  surfaceable regardless of Settlement decision; this is an open retention-design
  question for a future slice (§2).
- No cross-task "project health score" or similar synthesized judgment — `summary` is a
  literal count rollup, not an assessment.
- No live Git state (that's Land's job — View does not duplicate `src/land/`; a caller
  wanting both runs `tallyback land` and `tallyback view` and combines them itself).

## 7. Shape

- `src/view/report.ts` — pure: `buildTaskViews(snapshot, policy?: StalePolicy):
  TaskView[]` plus `summarize(views): ViewSummary`. No I/O, mirroring
  `src/land/report.ts`'s and `src/ledger/projections.ts`'s pure-function style.
- CLI: `tallyback view [--task-id <id>] [--stale-after-ms <n>]` — read-only, dispatched
  alongside `show`/`list`/`land` (after `Store.open`, before the mutating preflight),
  JSON to stdout via the existing `print()` helper, one-line human summary to stderr,
  matching `runValidate`/`runLand`'s convention exactly.
