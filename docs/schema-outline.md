# Tallyback v1 — Structural Schema Outlines

> Planning document. Outlines the three JSON Schemas and the canonical ID pattern. The
> actual `.schema.json` files are authored during the development phase.

## 1. ID pattern

Every entity ID is `<prefix>_<UUIDv7>`. The schema `pattern` enforces both the prefix
and the UUIDv7 version/variant shape; it does **not** rely on bare `format: "uuid"`.

The 19 prefixes (see `contract/SPEC.md` §4.1):

```
prj_ top_ tsk_ dcl_ att_ ate_ clm_ evi_ rec_ chk_ ckr_ ver_ set_ repo_ wsp_ blk_ brs_ dec_
```

`cri_` is a scoped lineage identifier for Criterion (nested inside TaskDeclaration),
**not** a top-level record type.

## 2. records.schema.json

Defines each of the 18 top-level record shapes as **closed** objects
(`additionalProperties: false`).
Provenance objects (`submitted_by`, `checked_by`, `decided_by`, `raised_by`,
`resolved_by`, `declared_by`) share a common `{ "kind": enum, "id": string }` shape.

### Entities and their required/optional fields

| Record | Required fields | Optional / nullable |
| --- | --- | --- |
| Project | `project_id`, `repositories[]` | — |
| Repository | `repository_id`, `alias` (manifest) | — |
| Workspace | `workspace_id`, `repository_id` | branch/ref hints (no paths) |
| Topic | `topic_id`, `project_id`, `name`, `goal`, `created_by`, `created_at` | — |
| Task | `task_id`, `topic_id`, `title` | `alias` |
| TaskDeclaration | `declaration_id`, `task_id`, `declared_by`, `declared_at`, `objective`, `criteria[]` | `supersedes` |
| Attempt | `attempt_id`, `task_id`, `declaration_id`, `repository_id`, `workspace_id`, `executor`, `dispatched_by`, `dispatched_at` | `session_id` |
| AttemptEnd | `attempt_end_id`, `attempt_id`, `outcome`, `reported_by`, `ended_at` | `reason`, `supersedes` |
| Claim | `claim_id`, `task_id`, `attempt_id`, `declaration_id`, `statement`, `evidence_ids[]`, `claimed_by`, `claimed_at` | — |
| Evidence | `evidence_id`, `kind`, `submitted_by`, `submitted_at`, `payload` | `note` |
| Reconciliation | `reconciliation_id`, `evidence_id`, `checked_by`, `checked_at`, `method`, `observed_context`, `checks[]`, `limitations[]` | `supersedes` |
| CheckInvocation | `check_invocation_id`, `subject`, `checker`, `evaluated_snapshot`, `invoked_by`, `invoked_at` | — |
| CheckResult | `check_result_id`, `check_invocation_id`, `outcome`, `produced_by`, `completed_at` | `diagnostics[]`, `reconciliation_ids[]`, `verdict_id` (nullable) |
| Verdict | `verdict_id`, `subject`, `declaration_id`, `scope`, `conclusion`, `finality`, `basis`, `findings[]`, `confidence`, `rationale`, `uncertainty`, `limitations[]`, `issued_by`, `issued_at` | `checker`, `native_judgment` |
| Settlement | `settlement_id`, `task_id`, `attempt_id`, `decision`, `decided_by`, `decided_at`, `basis`, `rationale` | `verification_exception`, `supersedes` |
| Blocker | `blocker_id`, `task_id`, `description`, `raised_by`, `raised_at` | `attempt_id` |
| BlockerResolution | `blocker_resolution_id`, `blocker_id`, `disposition`, `resolved_by`, `resolved_at` | `explanation`, `evidence_ids[]`, `supersedes` |
| Decision | `decision_id`, `subject`, `role`, `question`, `choice`, `rationale`, `decided_by`, `decided_at` | `basis[]`, `supersedes` |

### Closed enums (authoritative)

- `conclusion` — `supported` | `partially_supported` | `unsupported` | `contradicted`
- `finality` — `preliminary` | `final` (always present)
- `decision` (Settlement) — `accept` | `retry` | `abandon` | `land`
- `disposition` — `resolved` | `withdrawn`
- `role` (Decision) — `execution_choice` | `next_action`
- `outcome` (AttemptEnd) — `returned` | `failed` | `cancelled`
- `outcome` (CheckResult) — `verdict_emitted` | `verdict_withheld` | `check_failed`
- `evidence.kind` — `git_commit` | `git_diff` | `file_snapshot` | `command_run` | `test_run` | `artifact` | `observation` | `extension`
- `reconciliation.check.outcome` — `confirmed` | `mismatch` | `unresolved`
- finding `assessment` — `supported` | `partially_supported` | `unsupported` | `contradicted`
- finding `code` (diagnostic) — `insufficient_evidence` | `scope_gap` | `missing_implementation` | `non_operational` | `drift` | `conflicting_evidence`
- `confidence.level` — `low` | `medium` | `high`

### Extension boundary

Only `native_judgment` (on Verdict), `checker` metadata, and the explicit `extension`
evidence kind are open, namespaced, and versioned. Everything else is closed. A **bare
unknown evidence `kind` is rejected** (`schema.unknown_evidence_kind`) under version
negotiation; the `extension` kind is the only open-world path and is never verdict-bearing.

## 3. snapshot.schema.json

The envelope of the portable semantic snapshot (`state.json`):

- `schema_version`
- snapshot `revision` (monotonic integer — a concurrency field, not an entity)
- `included_through` revision marker
- top-level collections for each record type, all records (including superseded bodies),
  ordered by `(record_type, id)` for the semantic digest
- an isolated `projections` section (`computed_from_revision`, `policy_id`, `values`)
  that validators and consumers may discard and rebuild; excluded from the semantic digest
- no absolute paths, no transcripts, no embedded repository/output blobs

## 4. append-operation.schema.json

The shape of a single mutation submitted to `validate_append` / `record_check_output`:

```json
{
  "kind": "append_records",
  "expected_revision": 12,
  "records": [],
  "provenance": { "submitted_by": { "kind": "…", "id": "…" } }
}
```

Check submission is a two-step flow: `begin_check(expected_revision = N)` records the
invoker-produced `chk_` and advances to `N+1`, returning a frozen evaluation input. Check
consumes that recorded invocation and input, then emits `ckr_` + `rec_[]` + optional
produced `evi_[]` / `ver_`. The result bundle is submitted using the ledger's current
`expected_revision`; a normal revision conflict may be retried without changing the
frozen `evaluated_snapshot`. Operations may bundle multiple records atomically. Partial
ingestion is forbidden; the candidate graph is validated as a whole before any of it is
committed.
