# Tallyback v1 — Invariant Catalog Outline

> Planning document. Names the mutation rules and lifecycle invariants gathered during
> the grilling, with their phases, violation codes, and conformance cases. The full
> `invariants.json` registry is authored during the development phase.

## 1. Rule ID scheme

`TB-<CATEGORY>-<NNN>`, where category is a short mnemonic:

- `REF` — referential integrity
- `ID` — identity and immutability
- `LC` — lifecycle / transition legality
- `ATOM` — atomicity and transaction behavior
- `NOP` — no automatic progression
- `STR` — structural / closed-shape enforcement
- `SUP` — supersession graph validity

## 2. Phases

- `snapshot` — checkable from a final snapshot alone (via `validate_snapshot`).
- `mutation` — checkable only against a transition (via `validate_append`).

## 3. Catalog

### Referential integrity (`REF`) — snapshot phase

| ID | Invariant | Violation code |
| --- | --- | --- |
| TB-REF-001 | Verdict `declaration_id` and every criterion reference resolve within the snapshot | `invariant.verdict_scope_unresolved` |
| TB-REF-002 | Verdict's `declaration_id` is consistent with its Claim's `declaration_id` | `invariant.verdict_declaration_conflict` |
| TB-REF-003 | Criteria referenced by a Verdict belong to that declaration | `invariant.verdict_foreign_criterion` |
| TB-REF-004 | Attempt/Claim reference an existing Task and Declaration | `invariant.attempt_unresolved` |
| TB-REF-005 | Every `supersedes` target body is present in the snapshot | `invariant.dangling_supersession` |
| TB-REF-006 | Settlement `basis` references (`verdict_id` / `attempt_end_id` / `blocker_ids`) resolve | `invariant.settlement_basis_unresolved` |
| TB-REF-007 | Evidence `payload.repository_id` / `workspace_id` references resolve where present | `invariant.evidence_reference_unresolved` |
| TB-REF-008 | Decision `subject` resolves and is Project/Topic/Task/Attempt-scoped | `invariant.decision_subject_unresolved` |
| TB-REF-009 | `project.json` identity matches `state.json`'s Project record; mismatch fails closed | `invariant.project_identity_mismatch` |
| TB-REF-010 | CheckResult references an existing CheckInvocation, and every record in its result bundle is consistent with that invocation's subject and evaluated snapshot | `invariant.check_result_invocation_mismatch` |

### Identity and immutability (`ID`) — mutation phase

| ID | Invariant | Violation code |
| --- | --- | --- |
| TB-ID-001 | Entity IDs are immutable (an append cannot change an existing record's ID) | `invariant.id_mutation` |
| TB-ID-002 | A canonical top-level record ID with canonically different content is rejected (top-level records only; nested criterion definitions are not compared) | `invariant.id_collision` |
| TB-ID-003 | Same ID with canonically identical content is an idempotent no-op (no duplicate record) | `invariant.id_replay_duplicate` |

### Lifecycle / transition legality (`LC`) — mutation phase

| ID | Invariant | Violation code |
| --- | --- | --- |
| TB-LC-001 | An Attempt with an effective AttemptEnd cannot be restarted under the same `attempt_id` | `invariant.attempt_already_ended` |
| TB-LC-002 | No duplicate `criterion_id` within one declaration | `invariant.duplicate_criterion` |
| TB-LC-003 | Settlement `retry` settles the Attempt but leaves the Task available (not terminal) | `invariant.retry_not_terminal` (documented behavior) |
| TB-LC-004 | At most one open Attempt owns the same Workspace (Workspace exclusivity) | `invariant.workspace_exclusivity` |
| TB-LC-005 | Settlement `basis` satisfies the per-action matrix (`accept`/`land` require `verdict_id` XOR `verification_exception`) | `invariant.settlement_basis_matrix` |
| TB-LC-006 | A CheckInvocation has at most one CheckResult | `invariant.check_result_already_recorded` |

### Supersession (`SUP`) — snapshot + mutation phase

| ID | Invariant | Violation code |
| --- | --- | --- |
| TB-SUP-001 | `supersedes` targets a record of the same supersession-capable type | `invariant.supersession_type` |
| TB-SUP-002 | `supersedes` targets the same logical subject (same lineage) | `invariant.supersession_subject` |
| TB-SUP-003 | The supersession graph is acyclic (no supersession cycle) | `invariant.supersession_cycle` |
| TB-SUP-004 | Only supersession-capable records (`dcl_`, `set_`, `ate_`, `rec_`, `brs_`, `dec_`) carry `supersedes`; all others are immutable anchors | `invariant.supersession_unsupported` |
| TB-SUP-005 | Multiple concurrent unsuperseded heads are a conflict; Store never selects one by timestamp | `invariant.supersession_conflict` |

### Atomicity and transaction (`ATOM`) — mutation phase

| ID | Invariant | Violation code |
| --- | --- | --- |
| TB-ATOM-001 | A rejected operation produces no partial mutation (state unchanged, bytes unchanged) | `mutation.partial_ingestion` |
| TB-ATOM-002 | An accepted bundle is all-or-nothing; revision increments exactly once | `mutation.non_atomic_ingestion` |
| TB-ATOM-003 | Optimistic revision check: expected revision must match current before append | `mutation.revision_conflict` |

### No automatic progression (`NOP`) — mutation phase (observable behavior)

| ID | Invariant | Violation code |
| --- | --- | --- |
| TB-NOP-001 | Adding evidence does not create a Verdict | (assertion: no record change) |
| TB-NOP-002 | Ending an Attempt does not declare the Task complete | (assertion: no record change) |
| TB-NOP-003 | A passing test does not automatically accept the Task | (assertion: no record change) |
| TB-NOP-004 | Elapsed time does not mutate anything to `stale` | (assertion: no record change) |
| TB-NOP-005 | A positive Verdict does not automatically authorize landing | (assertion: no record change) |
| TB-NOP-006 | No derived status changes unless explicitly recomputed as a discardable projection | (assertion: projections isolated) |

## 4. Non-invariant codes (do not live in `invariants.json`)

These are contract codes in other namespaces, enumerated here for completeness but
registered by the validator/resolver/check layer, not as graph invariants:

- `resolution.*` — `repository_unbound`, `workspace_unbound`, `path_unavailable`,
  `not_a_git_repository`, `object_unavailable`, `observed_context_mismatch`,
  `unsupported_kind`, `environment_unavailable`, `check_error`
- `check.*` — `declaration_semantics_missing`, `checker_semantics_missing`, `check_failed`
- `schema.*` — `unknown_property`, `unknown_evidence_kind`, and other malformed-wire errors

## 5. Conformance-suite failure conditions

The suite fails if:

1. a catalog rule has no registered validator;
2. a validator has no catalog entry;
3. a rule lacks positive or negative coverage where applicable;
4. the emitted violation code differs from the catalog.
