# Tallyback v1 — Normative Specification

> **Delegate work. Know what came back.**

Status: **Draft for review — documentation only.** This specification consolidates the
grilling session's decisions into the normative contract for Tallyback v1. It is a
*freeze target*: review and freeze it before any schema, validator, binding, adapter,
test, or foundation change is written.

---

## 1. Purpose and scope

Tallyback is local, Git-native accountability infrastructure for delegated agent work.
It keeps a durable account of what was assigned, what an executor claims happened,
what the repository can prove, and whether the result is ready to land.

The core claim this document makes normative:

> **An agent saying "done" is a claim, not a fact.**

This specification defines the **shared execution-accountability model** that unifies
the existing Store and Check foundations (claude-task-store and done-or-not) without
turning either into a workflow engine.

The v1 milestone is a **versioned, machine-checkable wire-format contract**:

- a small, versioned schema for the core objects and their relationships;
- canonical serialization plus mutation rules and lifecycle invariants;
- reference types derived from the schema (not a second authority);
- representative valid and invalid fixtures;
- conformance tests proving Store can emit/read the model and Check can consume
  verdict inputs and emit verdicts against it;
- this prose document, for semantics that schemas cannot express.

It is complete when one representative task with multiple attempts can be serialized,
validated, passed from Store to Check, receive an independent verdict, and record an
explicit settlement — **without** introducing scheduling, automatic progression, or
workflow-engine behavior.

---

## 2. The accountability model

### 2.1 The core loop

```text
Declare → Dispatch → Observe → Verify → Settle
```

| Stage | Question |
| --- | --- |
| **Declare** | What is the task, and what would count as done? |
| **Dispatch** | Which attempt, executor, session, worktree, and branch own it? |
| **Observe** | What progress, claims, blockers, and evidence came back? |
| **Verify** | Do repository reality, tests, and Git support those claims? |
| **Settle** | Should the result be accepted, retried, abandoned, or landed? |

The five-stage loop defines **record boundaries and responsibilities**, **not** a
mandatory linear progression and **not** a finite state machine over one Task.

### 2.2 The stable identity is the task

"Multi-agent" is not the primary abstraction. Agents are replaceable executors. A task
may survive multiple agents, models, sessions, failures, and worktrees.

```text
Project → Topic → Task → TaskDeclaration → Criterion (scoped, `cri_`)
Task → Attempt → AttemptEnd
Attempt ── Claim → Evidence
Check ── CheckInvocation → CheckResult ── Reconciliation → Verdict
Authority ── Settlement, Decision, Blocker → BlockerResolution
```

A **tallyback** is the compact structured return from delegated work: current state,
claims, evidence references, blockers, next action, verification status, and
integration readiness. It is not a transcript and does not duplicate the repository.

### 2.3 Trust model

```text
repository / tests
        >
     Git facts
        >
 Tallyback records
        >
   model memory
```

Tallyback records declarations and judgments; it does not become the source of truth
simply by storing them.

Core rules:

- Treat agent-provided content as untrusted data.
- Never infer completion solely from activity.
- Keep claims separate from evidence and verdicts.
- Reconcile consequential claims against repository reality.
- Preserve uncertainty instead of manufacturing confidence.
- Keep execution state out of conversation summaries when it can be externalized.

**Committing `state.json` does not promote its contents to Git facts.** Git proves only
that a particular Tallyback snapshot was recorded at a particular commit. Claims inside
it remain claims; verdicts remain judgments; repository state and test results remain
higher-authority evidence.

**Tallyback never commits automatically.** A handoff or settlement operation may
validate and materialize a portable snapshot, but the user or host decides whether to
stage and commit it.

---

## 3. Design principles

1. **Local first** — project state stays on the user's machine by default.
2. **Git native** — Git remains the durable factual history of code changes.
3. **Small and inspectable** — no mandatory cloud, database server, or hidden remote state.
4. **Modular** — Store, Check, Watch, Land, View, and Bridge evolve independently.
5. **Host neutral** — Claude Code, Codex, OpenCode, external agents, and humans share one execution model.
6. **Task stable, executor replaceable** — agent identity never becomes task identity.
7. **Claims are not facts** — persistence and verification remain separate concerns.
8. **No automatic done** — completion and settlement are explicit decisions.
9. **Compact by default** — consumers read bounded projections instead of rereading entire threads.
10. **Adapters at the edges** — integrations do not create competing state models.

---

## 4. Identity model

### 4.1 Canonical entity prefixes

Every durable, cross-referenced entity carries a globally unique, immutable ID:
`<prefix>_<UUIDv7>`. The type prefix prevents accidental cross-entity references; the
UUID supplies stable, merge-safe identity. IDs are generated once and never change when
descriptive content is edited.

| Prefix | Entity |
| --- | --- |
| `prj_` | Project |
| `top_` | Topic |
| `tsk_` | Task |
| `dcl_` | TaskDeclaration |
| `att_` | Attempt |
| `ate_` | AttemptEnd |
| `clm_` | Claim |
| `evi_` | Evidence |
| `rec_` | Reconciliation |
| `chk_` | CheckInvocation |
| `ckr_` | CheckResult |
| `ver_` | Verdict |
| `set_` | Settlement |
| `repo_` | Repository |
| `wsp_` | Workspace |
| `blk_` | Blocker |
| `brs_` | BlockerResolution |
| `dec_` | Decision |

There are **19** canonical identifier prefixes: **18 top-level record types** plus
`cri_`, a scoped lineage identifier for Criterion. `cri_` is **not** a top-level record
type — a Criterion is nested inside its immutable TaskDeclaration (see §5.4). Store
**revision** is a monotonic concurrency field, **not** an entity and not a prefix.

### 4.2 Identity vs alias

`T1`, `T2`, … are **mutable, store-local aliases**, never identity:

```json
{ "task_id": "tsk_…", "alias": "T4", "topic_id": "top_…", "title": "…" }
```

- The CLI may accept `start T4`, but it must resolve `T4` to exactly one canonical
  `task_id` before writing anything.
- Wire-format references always use the canonical ID.
- Aliases are ergonomic labels; consumers must not join records on them.
- **Topic scopes aliases for CLI ergonomics, but `task_id` is globally unique and never
  derives its identity from its Topic.**

### 4.3 Producer-assigned identity

The actor creating an immutable semantic record assigns its identity. Store owns
persistence and collision validation, not authorship. On retry:

- the same ID with canonically identical content is an **idempotent replay**;
- the same ID with different content is an **identity collision**, rejected;
- a genuinely rerun operation produces new IDs and may explicitly supersede earlier records.

### 4.4 Reference integrity

Portable internal references must resolve within the snapshot. A conformance validator
rejects a dangling reference unless the field is explicitly an external reference with
a locator and digest. `supersedes` is an internal semantic reference: its target body
must be present.

---

## 5. The canonical record graph

The canonical source of truth is the **referenced record graph** — the ordered set of
semantic records, not a single mutable status cell.

### 5.1 Project (`prj_`)

Top-level container. `project.json` is a **bootstrap + validated header**; `state.json`
is the **authoritative** source of identity. A mismatch between the two fails closed
(`invariant.project_identity_mismatch`). There is no Project `name` in v1.

```json
{ "project_id": "prj_…", "repositories": [ { "repository_id": "repo_…", "alias": "main" } ] }
```

### 5.2 Repository (`repo_`) and Workspace (`wsp_`)

**Repository** identifies the Git repository / accountability lineage. It is generated
once at project init, stored in the portable project manifest, inherited by clones and
handoffs, and does not change when the repo moves, is cloned elsewhere, changes branch,
or changes remotes.

**Workspace** identifies a concrete checkout or worktree used by an Attempt. Multiple
Workspaces may bind to the same Repository. HEAD, index state, dirty files, and current
branch belong to a Workspace *observation*, not to the Repository generally.

A local path, Git remote URL, repository name, and object-database location are
**locators or hints — not identity**. Absolute paths live only in the machine-local
binding (`runtime/bindings.json`), never in a committable file.

```json
// runtime/bindings.json (ignored)
{ "repositories": { "repo_…": { "workspaces": { "wsp_…": { "root": "/abs/path" } } } } }
```

An Attempt references both Repository and Workspace. Portable Workspace records may
carry non-machine-specific hints (intended branch/ref) but never absolute paths.

### 5.3 Topic (`top_`)

A pure organizational grouping:

```json
{
  "topic_id": "top_…",
  "project_id": "prj_…",
  "name": "release-readiness",
  "goal": "Prepare the project for its first public release.",
  "created_by": { "kind": "human", "id": "…" },
  "created_at": "…"
}
```

Topic has **no** canonical status, current task, next action, or completion state.
`name` and `goal` are immutable creation metadata; `goal` supplies organizational
context but never substitutes for TaskDeclaration criteria. Task references `topic_id`.
Topic is required in v1 — a single-topic project still has one explicit Topic, not a
topicless mode.

### 5.4 Task (`tsk_`) and TaskDeclaration (`dcl_`)

**Task** is the stable unit of responsibility. **TaskDeclaration** is an immutable
version of what the Task asks for and what would count as done — the output of Declare.

```json
{
  "declaration_id": "dcl_…",
  "task_id": "tsk_…",
  "declared_by": { "kind": "human", "id": "…" },
  "declared_at": "…",
  "objective": "Implement validation for imported records.",
  "criteria": [
    {
      "criterion_id": "cri_…",
      "code": "invalid-record-rejected",
      "statement": "An imported record that violates the schema is rejected without partially mutating the store.",
      "required": true
    }
  ]
}
```

- `criterion_id` is the globally unique, stable logical-lineage identifier. `code` is
  the human-facing stable label, unique within the exact declaration. `statement` is the
  normative requirement text. The immutable definition is identified by the pair
  `(declaration_id, criterion_id)`; cross-record references use `criterion_id`.
- A declaration is **immutable**. Revising objective or semantics creates a new
  declaration with `supersedes`; both bodies remain in the graph.
- A Criterion may retain its `criterion_id` across declaration revisions when it is the
  same conceptual requirement with clarified wording. A replaced or materially changed
  requirement gets a new `criterion_id`.
- Consumers resolve a criterion through the exact `declaration_id`, so an old Verdict
  never acquires new meaning after a declaration revision.

Attempts and completion Claims are anchored to the declaration under which the work was
performed. A Verdict names the exact declaration and criteria it evaluated.

The **"current declaration"** is a derived projection (the declaration not superseded by
another). Concurrent unsuperseded heads are an explicit declaration conflict requiring
reconciliation; Store must not choose one by timestamp.

### 5.5 Attempt (`att_`) and AttemptEnd (`ate_`)

An Attempt is the **dispatch record** for one execution of a task. Dispatch does **not**
prove execution actually started; it records that work was assigned and where:

```json
{ "attempt_id": "att_…", "task_id": "tsk_…", "declaration_id": "dcl_…",
  "repository_id": "repo_…", "workspace_id": "wsp_…",
  "executor": { "kind": "subagent", "id": "…" }, "session_id": "…",
  "dispatched_by": { "kind": "human", "id": "…" }, "dispatched_at": "…" }
```

An **AttemptEnd** is a separate record (`ate_`) that terminates the Attempt:

```json
{ "attempt_end_id": "ate_…", "attempt_id": "att_…",
  "outcome": "returned", "reported_by": { "kind": "executor", "id": "…" },
  "ended_at": "…", "reason": "…" }
```

- `outcome` ∈ `returned` | `failed` | `cancelled` (never `completed`).
- An "open Attempt" means no effective AttemptEnd exists. A hard crash with no
  attributed termination record leaves the Attempt open; Tallyback must not call every
  open Attempt "actively executing."
- **Workspace exclusivity**: at most one open Attempt may own the same Workspace. This is
  not a one-attempt-per-Task rule.
- AttemptEnd never contains or implies a Verdict or Settlement. It is supersession-capable
  (a corrected AttemptEnd supersedes the earlier `ate_`).

### 5.6 Claim (`clm_`)

A statement made about progress or completion:

```json
{ "claim_id": "clm_…", "task_id": "tsk_…", "attempt_id": "att_…",
  "declaration_id": "dcl_…", "statement": "The declared validation work is complete.",
  "evidence_ids": ["evi_…"],
  "claimed_by": { "kind": "executor", "id": "…" }, "claimed_at": "…" }
```

`evidence_ids` means **"the claimant offers this evidence in support"** — not
"Tallyback confirms that it supports the claim." Only a Verdict evaluates adequacy,
relevance, contradiction, and uncertainty.

### 5.7 Evidence (`evi_`)

An attributed, immutable submission containing a typed locator or captured result that
software can inspect, plus enough execution/repository context to prevent the locator
from drifting, plus an optional free-text interpretation that remains untrusted
narrative.

Evidence is **not** automatically true merely because it is typed. It records what an
executor presented. Check may later reconcile it.

```json
{
  "evidence_id": "evi_…",
  "kind": "git_commit",
  "submitted_by": { "kind": "executor", "id": "…" },
  "submitted_at": "…",
  "payload": { "repository_id": "repo_…", "object_id": "…", "object_format": "sha1" },
  "note": "This commit implements the requested validation."
}
```

Closed `kind` set (v1) — seven canonical kinds plus one explicit `extension` kind:

`git_commit`, `git_diff`, `file_snapshot`, `command_run`, `test_run`, `artifact`, `observation`, `extension`.

Binding-context rules:

- a file reference includes repository revision plus path and, where captured, a content digest;
- a line range is only a locator and must be bound to a revision or digest;
- a test/command result includes command, exit code, timestamps, repository revision, working-tree condition, and an output reference or digest;
- an artifact includes a portable locator where possible and a content digest;
- an observation includes observer, time, and text, and is explicitly non-mechanically-reconcilable.

A bare path, abbreviated commit hash, or "tests passed" string is **not** sufficient
typed evidence, because its meaning can change after handoff.

No Evidence field is "authoritative." The contract distinguishes:

- **locator/capture** — machine-readable;
- **note** — submitter interpretation;
- **reconciliation** — Check's attributed finding about whether the locator or result matches repository reality;
- **verdict** — Check's semantic judgment about the Claim.

The evidence-kind set is closed. A **bare unknown kind is rejected**
(`schema.unknown_evidence_kind`) under normal version negotiation — it is never silently
preserved. An explicit `extension` kind is the only open-world path:

```json
{ "kind": "extension", "namespace": "acme", "extension_kind": "screenshot-diff",
  "ref": { "evidence_id": "evi_…" } }
```

An `extension` is namespaced, pointer-grounded (its meaning rests on the referenced
content, never on free text alone), and **never verdict-bearing**. A valid unsupported
`extension` remains valid and portable, but is *unresolved* for a consumer that does not
understand its namespace; it is not silently reclassified as a canonical kind.

### 5.8 Reconciliation (`rec_`)

A first-class record. Check may emit a Reconciliation without emitting a Verdict.

```json
{
  "reconciliation_id": "rec_…",
  "evidence_id": "evi_…",
  "checked_by": { "kind": "tool", "id": "tallyback-check" },
  "checked_at": "…",
  "method": { "name": "git-object-inspection", "version": "1" },
  "observed_context": { "repository_id": "repo_…", "workspace_id": "wsp_…",
                        "head_oid": "…", "tree_oid": "…", "working_tree": "dirty" },
  "checks": [ { "predicate": "git.object.exists", "outcome": "confirmed",
                "observed": { "object_id": "…", "object_type": "commit" } } ],
  "limitations": []
}
```

The **predicate is essential**: a bare `confirmed` is too broad. Core outcomes:

- `confirmed` — the named factual predicate matched;
- `mismatch` — the observation contradicted the submitted payload;
- `unresolved` — the check could not establish either result.

`unresolved` carries a structured reason and is **never collapsed into `mismatch`**.
Required `unresolved` reasons (v1):

`repository_unbound`, `workspace_unbound`, `path_unavailable`, `not_a_git_repository`,
`object_unavailable`, `observed_context_mismatch`, `unsupported_kind`,
`environment_unavailable`, `check_error`.

Reconciliation records are immutable. Re-running creates a new record with `supersedes`.
Consumers derive which reconciliation is currently applicable from its observed context
and policy, **not** the newest timestamp.

Resolution path (Check, local-only in v1):

1. read `repository_id` and, where working-tree state matters, `workspace_id`;
2. ask the configured local resolver for a bound path;
3. validate the path is a Git worktree of the expected Repository;
4. resolve the object database through Git, not by constructing `.git/objects` paths;
5. perform the named predicate;
6. record the exact observed context.

`head_oid` alone is not enough to bind a test result from a dirty worktree; evidence
derived from workspace contents records an additional tree/index/worktree fingerprint
or states that the dirty portion was not captured.

Check must **not** guess identity by matching a remote URL or a similarly named
directory. Remotes may be retained as optional discovery hints, but using one to create
or change a binding requires an explicit operation.

### 5.9 CheckInvocation (`chk_`) and CheckResult (`ckr_`)

A Check is **two records**: an invocation and, when produced, a result. The portable graph
distinguishes three states:

- no `chk_` → the Check was never invoked;
- `chk_` but no `ckr_` → invoked, but no result recorded (a crash, or a result emitted but
  Store ingestion failed — both are journal concerns, **not** graph distinctions);
- `chk_` + `ckr_` → a result was recorded.

**CheckInvocation** records that a Check began against a frozen input snapshot:

```json
{
  "check_invocation_id": "chk_…",
  "subject": { "kind": "claim", "id": "clm_…" },
  "checker": { "id": "done-or-not", "version": "…" },
  "evaluated_snapshot": { "project_id": "prj_…", "revision": 42, "digest": "…" },
  "invoked_by": { "kind": "tool", "id": "tallyback-check" }, "invoked_at": "…"
}
```

**CheckResult** carries the completion outcome and the produced records:

```json
{
  "check_result_id": "ckr_…",
  "check_invocation_id": "chk_…",
  "outcome": "verdict_withheld",
  "produced_by": { "kind": "tool", "id": "tallyback-check" }, "completed_at": "…",
  "diagnostics": [ { "code": "semantics_missing", "message": "No acceptance semantics were available." } ],
  "reconciliation_ids": ["rec_…"],
  "verdict_id": null
}
```

- `outcome` ∈ `verdict_emitted` | `verdict_withheld` | `check_failed`.
- `check_failed` means the checker or invoker produced an explicit, recordable failure
  result; it is not a catch-all for "no result arrived."

**`begin_check` flow.** Store is at revision `N`. The invoker submits
`begin_check(expected_revision = N)`. Store validates, records the `chk_`, and advances to
`N+1`; it returns the recorded `check_invocation_id` and frozen evaluation input. Check evaluates
that input and emits `ckr_` + `rec_[]` + optional produced `evi_[]` / `ver_`. The invoker
submits that result bundle using the ledger's current `expected_revision`. An ordinary
revision conflict may be retried against a freshly read current revision without changing
`evaluated_snapshot`. Concurrent writes therefore do not prevent the historical result
from being recorded; whether they make it stale for a later Settlement is an explicit
policy judgment, not an ingestion rule.

### 5.10 Verdict (`ver_`)

Check's **semantic judgment** about a Claim. It must contain an actual conclusion;
`withheld`, `not_attempted`, and "no semantics available" are **not** verdict conclusions.

```json
{
  "verdict_id": "ver_…",
  "subject": { "kind": "claim", "id": "clm_…" },
  "declaration_id": "dcl_…",
  "scope": { "evaluated_criteria": ["cri_…"], "unevaluated_criteria": [] },
  "conclusion": "supported",
  "finality": "final",
  "basis": { "evidence_ids": ["evi_…"], "reconciliation_ids": ["rec_…"] },
  "findings": [
    { "criterion_id": "cri_…", "assessment": "supported",
      "code": "non_operational", "summary": "…", "basis_refs": ["evi_…", "rec_…"] }
  ],
  "confidence": { "level": "high", "rationale": "…" },
  "rationale": "…",
  "uncertainty": [],
  "limitations": [],
  "issued_by": { "kind": "tool", "id": "tallyback-check" }, "issued_at": "…",
  "checker": { "id": "done-or-not", "version": "…" },
  "native_judgment": { "namespace": "done-or-not", "schema_version": "…", "payload": {} }
}
```

Canonical `conclusion` (v1):

| value | meaning |
| --- | --- |
| `supported` | the available basis adequately supports the Claim within the explicitly evaluated scope |
| `partially_supported` | material portions are supported, but other material portions are unresolved or unsatisfied |
| `unsupported` | the basis is insufficient to support or contradict the Claim |
| `contradicted` | the basis materially supports the Claim's negation or conflicts with it |

`inapplicable` is **excluded** from the conclusion enum — it is ambiguous between a
genuine non-applicability, a missing capability, absent semantics, and a malformed
subject. The latter three produce no Verdict (a `chk_` + `ckr_` with `outcome:
verdict_withheld` / `check_failed` and a gate diagnostic instead); a genuine "does not
apply" judgment is expressed as a scoped finding or a declaration/settlement decision.

Canonical finding codes (cross-checker, queryable): `insufficient_evidence`,
`scope_gap`, `missing_implementation`, `non_operational`, `drift`, `conflicting_evidence`.

- `finality` is **always present** and is `preliminary` | `final`. Absence must never
  mean "final."
- `confidence` is `{ level, rationale }` with `level` ∈ `low` | `medium` | `high`.
  Confidence is orthogonal to `conclusion` and `finality`: `unsupported` with high
  confidence means the checker confidently found insufficient support; `supported` with
  low confidence remains weak and should not silently become settlement-ready.
- `findings` is a required non-empty array of **criterion-scoped** findings:
  `{ criterion_id, assessment, code?, summary, basis_refs[] }`, where `assessment` ∈
  `supported` | `partially_supported` | `unsupported` | `contradicted`. The diagnostic
  `code` is required for any non-`supported` assessment and optional for `supported`.
- `uncertainty` and `limitations` are required arrays (may be empty).
- `issued_by`/`issued_at` are the Verdict's authorship; `checker` is software
  identity/version metadata, not a substitute for authorship.
- `native_judgment` is namespaced checker-specific metadata whose meaning is owned by
  the named checker and version. Generic consumers preserve and display it; generic
  settlement logic uses only the canonical fields.

Reference shape: a Verdict may reference Evidence and Reconciliation; Settlement may
reference a Verdict. A Verdict must not recursively cite another Verdict through a
generic mixed-reference list. A Verdict is **not** supersession-capable (`ver_` is an
immutable judgment anchor): a revised judgment is a new Verdict, and Settlement chooses
which Verdict it cites.

### 5.11 Settlement (`set_`)

A first-class decision record — **not** a Task status:

```json
{
  "settlement_id": "set_…", "task_id": "tsk_…", "attempt_id": "att_…",
  "decision": "accept",
  "decided_by": { "kind": "human", "id": "…" }, "decided_at": "…",
  "basis": { "verdict_id": "ver_…", "attempt_end_id": null, "blocker_ids": [] },
  "verification_exception": null,
  "rationale": "…"
}
```

`decision` ∈ `accept` | `retry` | `abandon` | `land`:

- `accept` records acceptance of the result;
- `retry` settles the evaluated Attempt and leaves the Task available for another Attempt (not terminal);
- `abandon` closes the Task without acceptance;
- `land` records an integration decision or authorization; whether integration actually
  occurred must still be reconciled against Git.

`basis` is a typed object: `{ verdict_id?, attempt_end_id?, blocker_ids[]? }`.
`verification_exception` is a **sibling** optional field — the exceptional accept/land
override — mutually exclusive with `basis.verdict_id`. `rationale` is required.

Per-action matrix:

- `accept` / `land` require `basis.verdict_id` **XOR** `verification_exception`;
- `retry` / `abandon` require no Verdict; they cite `attempt_end_id` / `blocker_ids` as rationale.

A later decision may explicitly supersede an earlier one; it must not silently overwrite
history (`supersedes`). The effective settlement is derived from the supersession graph.

### 5.12 Blocker (`blk_`) and BlockerResolution (`brs_`)

Blocker is a first-class immutable observation:

```json
{ "blocker_id": "blk_…", "task_id": "tsk_…", "attempt_id": "att_…",
  "description": "Required fixture is unavailable.",
  "raised_by": { "kind": "executor", "id": "…" }, "raised_at": "…" }
```

`attempt_id` may be omitted when the blocker applies to the Task generally.

Resolution is a **separate** record:

```json
{ "blocker_resolution_id": "brs_…", "blocker_id": "blk_…", "disposition": "resolved",
  "resolved_by": { "kind": "human", "id": "…" }, "resolved_at": "…",
  "explanation": "The fixture was added in commit …", "evidence_ids": ["evi_…"] }
```

`disposition` ∈ `resolved` (the reported condition existed but no longer blocks) |
`withdrawn` (the reporter retracts the report). A resolution does **not** supersede the
Blocker (supersession is reserved for correcting/replacing a record of the same semantic
role), but a BlockerResolution **is** supersession-capable: a corrected resolution
supersedes the earlier `brs_`. The Task's *blocked* projection is derived from Blockers
without an effective resolution. Nothing changes Task state automatically when a Blocker
or BlockerResolution is appended. A recurring obstruction gets a new `blocker_id`.

### 5.13 Decision (`dec_`)

An explicit choice about how execution should proceed — distinct from declaration,
claim, and settlement:

```json
{
  "decision_id": "dec_…",
  "subject": { "kind": "task", "id": "tsk_…" },
  "role": "execution_choice",
  "question": "How should validation errors be represented?",
  "choice": "Use stable namespaced error codes.",
  "rationale": "Consumers need to branch without parsing messages.",
  "decided_by": { "kind": "human", "id": "…" }, "decided_at": "…",
  "basis": []
}
```

- Scope is explicit (Project / Topic / Task / Attempt); a free-floating
  `{summary, rationale}` with no subject is invalid.
- Roles (v1): `execution_choice`, `next_action`.
- The displayed *next action* is derived from the effective non-superseded `next_action`
  Decision. Multiple non-superseded `next_action` Decisions report a conflict or
  alternatives; Store must not silently select one by timestamp.
- Decision has no implicit lifecycle effect. It cannot change acceptance criteria, mark
  a Claim supported, accept/abandon a Task, or authorize landing.

---

## 6. Storage model

```
.tallyback/
├── project.json          # portable identity; committable
├── state.json            # portable canonical semantic snapshot; committable
├── config.json           # portable project policy; committable
├── history.jsonl         # local operational journal; ignored
└── runtime/
    ├── bindings.json     # machine-local bindings; always ignored
    └── (locks, caches, watcher/debounce state)
```

- **`state.json`** is the portable canonical semantic snapshot: the **complete**
  semantic record graph at one snapshot revision, **including superseded record bodies**.
- **`history.jsonl`** is the local operational journal (commands, writes, intermediate
  mutations, recovery snapshots).
- **`runtime/`** holds machine-local state (bindings, locks, caches, watcher/debounce).

The governing distinction is **semantic domain records** (travel) vs **operational
mutation noise** (stays local) — **not** "current vs historical."

`state.json` includes: Project/Repository identities; portable Workspace descriptors
(no local paths); Topics and Task declarations; Attempts and AttemptEnds; Claims;
Evidence metadata and external-content references; CheckInvocations and CheckResults;
Reconciliations; Verdicts; Settlements; Blockers and explicit resolutions; **every
superseded version of those records**; schema version and snapshot revision metadata.

`state.json` excludes: transcripts; command-output bodies when an artifact reference and
digest suffice; repository files or diffs already addressable through Git; absolute
local paths and bindings; locks/caches/watcher state/heartbeats/debounce data; redundant
recovery copies; low-level mutations that carry no semantic content.

Derived statuses are **not** persisted in the canonical section of `state.json`. If an
implementation caches projections for performance, they are isolated and discardable:

```json
{ "projections": { "computed_from_revision": 42, "policy_id": "default-v1", "values": {} } }
```

"Compact" is a **structural** property — structured rather than transcript-based,
normalized references rather than duplicated content, evidence pointers rather than
embedded blobs, semantic records rather than operational write noise — **not** a
cardinality bound on `state.json`.

The compact tallyback returned to an agent is a derived resume/handoff projection of
this ledger, not the ledger itself.

### 6.1 Governing invariant

> **Deleting `history.jsonl` may reduce recovery and forensic detail, but must never
> make any record or internal reference in `state.json` semantically unintelligible.**

---

## 7. State model (mutation rules and lifecycle invariants)

The v1 deliverable is **mutation rules and lifecycle invariants** — not a
"state-transition table" and not an FSM.

Rules **validate explicit operations; they never advance state automatically.** Every
mutation is an explicit, attributable append or revision.

Explicit commands append or revise attributable records:

- **Declare** creates a TaskDeclaration.
- **Dispatch** creates an Attempt referencing a Task; **End** appends an AttemptEnd (`ate_`).
- **Observe** records Claims, Evidence, and Blockers.
- **Verify** creates a CheckInvocation (`chk_`) + CheckResult (`ckr_`) and, within them,
  Reconciliations and/or a Verdict against a typed subject.
- **Settle** creates a Settlement.

Structural and lifecycle invariants (representative; the full catalog lives in
`invariants.json`):

- every Attempt references an existing Task and Declaration;
- every Claim identifies its Task, Attempt, author, and time;
- every Verdict references an existing subject;
- a Verdict's `declaration_id` and criteria resolve within the snapshot and are consistent with its Claim;
- every Settlement identifies its decision-maker and supporting basis;
- entity IDs are immutable;
- an explicitly ended Attempt cannot be restarted under the same `attempt_id`;
- a rejected operation produces no partial mutation;
- criteria belong to the referenced declaration; no duplicate `criterion_id` within one declaration; no dangling supersession links.

The runtime does **not** infer or write semantic conclusions:

- adding evidence does not create a positive Verdict;
- ending an Attempt does not declare the Task complete;
- a passing test does not automatically accept the Task;
- elapsed time does not mutate anything to `stale`;
- a positive Verdict does not automatically authorize landing.

Those changes require separate, explicit, attributed records.

### 7.1 Authorization is semantic, not ritual

Recording an authoritative record (notably a Settlement) requires a **semantically
sufficient command** — one that names the decision and its target. "Accept this result and
record it" is already explicit authorization; no second confirmation prompt is required.
Authorization is recorded in the record's provenance (`decided_by` / `decided_at`) as
**durable attribution of the asserted decision-maker**. Attribution is not authentication:
v1 has no signatures or cryptographic attestation, so provenance records whom the ledger
writer asserts decided but does not prove that authorization occurred. `decided_by` must
name the real authorizing actor, never a synthesized identity standing in for an unstated
decision. A host may add
its own confirmation as non-normative UI policy, but that never enters `state.json`
semantics or its digest.

### 7.2 Derived projections (never authoritative statuses)

`blocked`, `verified`, `stale`, `ready_to_land`, `settled`, and `dispatched` are **not**
authoritative Task statuses:

- `blocked` — from unresolved Blocker records;
- `verified` — from applicable non-superseded Verdicts;
- `stale` — a time- and policy-dependent query (the existing Store's stale detector is
  already read-only; the 48h threshold is policy/View config, not schema semantics);
- `ready_to_land` — an effective Settlement combined with current Git and verification facts;
- `settled` — an applicable Settlement exists;
- `dispatched` — derivable from the existence of an Attempt.

Any `task.status` in a snapshot is explicitly marked as a derived projection, names the
revision and policy under which it was computed, and may be discarded and rebuilt.
Consumers must not write it independently.

---

## 8. Store ↔ Check boundary

**All actors are record producers; only Store performs ledger mutations**
(`validate → lock → append → persist`).

Check is **read-only with respect to the Tallyback ledger**. It consumes an immutable
input snapshot plus an explicitly resolved repository/workspace capability and emits a
self-contained canonical result bundle:

```text
Check(recorded_check_invocation, frozen_evaluation_input,
      repository/workspace resolver)
  → { check_result, produced_evidence[], reconciliations[], verdict? }
```

The invoker, not Check, produces the `CheckInvocation` before execution. This is what
makes an invocation observable even when Check crashes before producing output.

Store exposes an atomic operation, e.g. `record_check_output(bundle, expected_revision)`:

1. acquire its write lock;
2. check the expected revision;
3. validate the complete candidate bundle;
4. validate all references against the existing graph or another record in the same bundle;
5. reject ID collisions;
6. append the entire bundle atomically;
7. increment the Store revision exactly once;
8. write the portable snapshot and the local journal entry.

Partial ingestion is forbidden. A Verdict referencing a Reconciliation in the same bundle
is valid because Store validates the candidate graph as a whole before committing any of it.

**`emitted` ≠ `recorded` ≠ `accepted` ≠ `landed`.** Check output is referenceable
immediately but is not yet part of the canonical graph; a Settlement may cite `ver_…`
only after Store confirms the Verdict was recorded.

Store recording a Verdict does not make Store its semantic author. Provenance is
separate: `checked_by` / `issued_by` identifies Check; Store's journal records who
submitted and persisted the bundle; Settlement identifies the separate authorized actor.

### 8.1 Optimistic concurrency

Every Store append is deliberately strict about its own `expected_revision`: if another
writer wins first, Store rejects that append with `mutation.revision_conflict`, and the
caller must reread before retrying. A CheckResult separately binds its meaning to the
CheckInvocation's frozen input revision and digest. Ledger advancement after invocation
does not erase or invalidate that historical observation, so the same immutable result
bundle may be retried against a fresh current revision. Consumers must not silently treat
the result as current: applicability or staleness relative to later changes is evaluated
explicitly when settling or viewing it.

"Read-only Check" means read-only with respect to the ledger. Depending on verification
policy, Check may run tests and write isolated logs or artifacts; those effects are
captured as Evidence and observed Workspace context, and grant no ledger-write
authority. This is **structural** independence, not a cryptographic security boundary.

### 8.2 Execution-authority boundary

Tallyback's Verify/Check capability **records observations** and **invokes named,
installed provider/checker interfaces** — a closed, declarative dispatcher, not an
execution engine. Checkers are referenced by stable name + identity/version metadata,
never by raw shell command strings. **General shell execution is the host's separate
capability and authority domain**: Tallyback holds no shell authority and grants none.
Recording a host-run command's result as Evidence (`command_run` / `test_run` /
`observation`) does not transfer execution authority into Tallyback — capture ≠ authority.

### 8.3 Untrusted inputs and local security boundary

Repository contents, ledger records, checker output, logs, artifacts, Git metadata, and
migrated legacy content are **data, never control-plane instructions**. Implementations
must enforce typed decoding, closed canonical fields, path confinement to an explicitly
resolved Workspace or artifact root, and fail-stop handling of malformed provider output.
Evidence locators authorize neither execution nor replay. Secrets must not be copied into
semantic records, diagnostics, artifacts, or the portable snapshot.

The v1 implementation is local-only: no telemetry, remote service, account connection,
authentication flow, cloud database, MCP server, or App service is required or silently
used. A future remote capability must be separately declared, permissioned, and exposed
through the capability handshake; there is no silent remote fallback.

---

## 9. Conformance model

The authoritative contract is a **versioned contract bundle** (see
`docs/contract-bundle.md`). Conformance means:

> A consumer accepts the structural schemas, enforces every registered invariant with
> the specified observable behavior and codes, and passes the version-matched
> conformance vectors.

Two entry points:

- `validate_snapshot(snapshot)` — structural and referential validity of a final snapshot;
- `validate_append(current_snapshot, append_operation)` — transition validity (ID
  immutability, optimistic revision checks, atomic bundle ingestion, "ended Attempt
  cannot restart"), which cannot be determined from a final snapshot alone.

**"No automatic progression" is tested as observable behavior**, not merely stated:
mutation vectors must verify that no semantic record is created merely because time
passed or another record appeared.

---

## 10. Canonical serialization

`state.json` may be pretty-printed for human inspection, but hashes and idempotency
comparisons operate on **canonicalized** JSON bytes. Canonicalization is **JCS
(RFC 8785)**, which orders object members and normalizes whitespace/number/string
encodings. **JCS never sorts arrays.**

- `ordered` arrays keep their given order (their order is semantic).
- `set` arrays are canonicalized by the exhaustive normative array-semantics registry's
  own comparator, applied **before** JCS serialization: a `set` array must be **sorted and
  duplicate-free, otherwise the input is rejected**. Only after successful validation does
  JCS serialize it.
- Any optional normalize helper is explicitly separate and non-authoritative; its output
  must be revalidated.
- Equality is **canonical bytes**: same ID + byte-equal = idempotent no-op; same ID +
  different bytes = collision. CRLF ≠ LF — digests are over exact bytes.
- The digest is the shared `Digest` object `{ "algorithm": "sha-256", "value": "<hex>" }`.
  The hex is `Digest.value`; the field shape never collapses to a bare hash string.
- `projections` are excluded from the semantic digest; the whole snapshot is ordered by
  `(record_type, id)` before hashing.

---

## 11. Code namespaces

Not every machine-readable code is an invariant violation:

| namespace | meaning |
| --- | --- |
| `schema.*` | malformed wire data |
| `invariant.*` | invalid graph or lifecycle mutation |
| `mutation.*` | transaction/concurrency failure |
| `resolution.*` | repository/workspace/evidence resolution result |
| `check.*` | Check gate or capability diagnostic |

Examples: `mutation.revision_conflict`, `resolution.repository_unbound`,
`check.declaration_semantics_missing`, `check.checker_semantics_missing`.

---

## 12. What Tallyback is not

- a general task-management SaaS;
- an autonomous project manager;
- an agent runtime or model router;
- a scheduler or fleet orchestrator;
- a replacement for Git, tests, CI, or code review;
- a transcript archive;
- a generic memory, RAG, or vector-search system;
- a machine that can guarantee semantic truth.

Tallyback can reconcile **observable facts** (a commit exists; a test exited 0 under a
captured context) and may **make** semantic judgments, but a Verdict remains an
attributed judgment that preserves its basis, verifier, uncertainty, and limitations —
not a guaranteed fact.

---

## 13. v1 boundaries (out of scope)

- no workflow engine;
- no automatic status progression;
- no remote clone/fetch or artifact download (local binding only);
- no multi-writer merge or dependency-scoped rebase;
- no semantic garbage collection (archival is a future, content-addressed mechanism);
- no rich View/export profiles;
- no cryptographic attestation;
- no silent migration guesses.

---

## 14. Migration principles

Migration from the existing foundations is **one-time, persisted, and atomic** — one
Store transaction conceptually: generate IDs, preserve existing `Tn` aliases, rewrite
every reference, and write the mapping into the migrated snapshot. IDs are never
regenerated on later reads. A legacy snapshot that diverged on two machines before
migration requires explicit reconciliation — no heuristic merge. Migration is
**field-complete and non-fabricating**: legacy records lacking actor/timestamp use the
explicit legacy provenance variant (`actor: unknown`, nullable timestamps), never
synthesized actors. Legacy `attempts[]` entries become **one Evidence `observation`
each** (not Attempt records); legacy `status: done` is preserved as an **observation**,
not a Claim; no TaskDeclaration is synthesized. See `docs/migration.md`.

---

## 15. Governing test

The single behavior that must always hold:

> **Deleting `history.jsonl` may reduce recovery and forensic detail, but must never
> make any record or internal reference in `state.json` semantically unintelligible.**

---

## 16. Distribution and host adaptation

Marketplace-readiness is an **architectural constraint, not a v1 deliverable**. Core stays
host-neutral; the deterministic capability (reference library + CLI) is built once, with
thin host adapters above it.

- The distribution profile is a **separately versioned, non-normative** deliverable,
  implemented only **after** contract + conformance freeze, in this repo.
- The first public profile is **one plugin with one initial skill**. The skill exposes the
  loop's preconditions and per-phase tool needs (`declare` / `dispatch` / `observe` /
  `verify` / `settle`), not a CLI-subcommand passthrough.
- The plugin declares **compatible implementation and contract version ranges**; it never
  pins itself to a Store or Check foundation version.
- The **capability handshake** is mandatory: consumers reject unsupported semantic
  versions (unknown major → fail closed) and never mutate on compatibility failure.
  Migration between contract majors is explicit-only.
- At minimum, the CLI handshake reports `implementation_version`, `command_api_version`,
  `supported_contract_versions`, and supported feature/provider-interface identifiers in
  machine-readable form. Every mutating workflow performs this preflight. An unknown
  contract major may be read only when the implementation explicitly declares parser
  support for it; otherwise reads also fail closed.
- Migration is never an implicit compatibility fallback. It is a separately authorized
  operation with preview, validation, and a migration report before replacement of the
  portable state.
- The **distribution compatibility matrix** (which plugin release is tested against which
  CLI and contract ranges) is informative and updateable without changing the semantic
  contract.
- Installation/discovery is platform-specific in v1; the plugin is **not** required to
  bundle the CLI.
- Plugin/skill files never enter `state.json` semantics or its digest. Contract,
  implementation, and plugin versions are independent, joined only by compatibility ranges.

Non-goals for this documentation-only milestone: MCP, OAuth, cloud, plugin manifests,
skills, distribution assets, and marketplace submission. Any current host
plugin/submission expectations are time-sensitive and non-normative; cite the host's
official documentation rather than inlining them as permanent contract rules.
