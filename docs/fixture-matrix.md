# Tallyback v1 — Fixture & Conformance Matrix

> Planning document. Defines the conformance vectors that lock behavior before adapters
> are expanded. Fixtures are authored during the development phase.

## 1. Fixture layout

```
contract/fixtures/
├── snapshots/
│   ├── valid/
│   └── invalid/
└── mutations/
    ├── accepted/
    └── rejected/
```

## 2. Snapshot fixtures

### Valid (positive) — must pass `validate_snapshot`

| Fixture | Covers |
| --- | --- |
| `minimal-task` | Project + Topic + Task + Declaration + Criterion |
| `task-with-attempt` | Attempt referencing task, declaration, repo, workspace |
| `complete-graph` | Task → Attempt → Claim → Evidence → Reconciliation → Verdict → Settlement |
| `attempt-with-end` | Attempt + AttemptEnd (`ate_`, outcome `returned`) |
| `superseded-declaration` | `dcl_new` with `supersedes` → `dcl_old`, both bodies present |
| `superseded-settlement` | `set_old` (accept) superseded by `set_new` (retry), both bodies present |
| `superseded-reconciliation` | `rec_new` with `supersedes` → `rec_old` |
| `superseded-attemptend` | `ate_new` with `supersedes` → `ate_old`, both bodies present |
| `verdict-withheld-checkresult` | CheckInvocation + CheckResult `verdict_withheld` + `check.declaration_semantics_missing`, no Verdict |
| `blocker-with-resolution` | Blocker + BlockerResolution |
| `decision-next-action` | Decision `role: next_action` with `supersedes` |
| `isolated-projections` | `projections` section present; discardable, not part of the graph |
| `evidence-observation-legacy` | Legacy Store evidence string migrated to `observation` |

### Invalid (negative) — must be rejected

| Fixture | Violation code |
| --- | --- |
| `verdict-missing-declaration` | `invariant.verdict_scope_unresolved` |
| `verdict-foreign-criterion` | `invariant.verdict_foreign_criterion` |
| `verdict-declaration-conflict` | `invariant.verdict_declaration_conflict` |
| `dangling-supersession` | `invariant.dangling_supersession` |
| `unknown-property` | `schema.unknown_property` |
| `unknown-evidence-kind` | `schema.unknown_evidence_kind` (bare unknown kind; `extension` is the only open path) |
| `absolute-path-in-snapshot` | `schema.unknown_property` (paths belong only in `runtime/bindings.json`) |
| `duplicate-criterion` | `invariant.duplicate_criterion` |
| `verdict-supersedes` | `invariant.supersession_unsupported` (Verdict is not supersession-capable) |
| `settlement-basis-missing` | `invariant.settlement_basis_matrix` (accept without verdict_id XOR verification_exception) |
| `transcript-body-embedded` | `schema.unknown_property` (evidence payload must be a pointer, not a blob) |

## 3. Mutation vectors

Shape:

```json
{
  "name": "reject-restarting-ended-attempt",
  "before": "fixtures/snapshots/ended-attempt.json",
  "operation": {
    "kind": "append_records",
    "expected_revision": 12,
    "records": []
  },
  "expected": {
    "accepted": false,
    "code": "invariant.attempt_already_ended",
    "revision": 12,
    "state_unchanged": true
  }
}
```

### Rejected vectors

| Vector | Expected |
| --- | --- |
| `reject-restarting-ended-attempt` | `invariant.attempt_already_ended`, `state_unchanged: true` |
| `reject-id-collision` | `invariant.id_collision` (same ID, different content) |
| `reject-revision-conflict` | `mutation.revision_conflict` (ledger advanced) |
| `reject-foreign-criterion` | `invariant.verdict_foreign_criterion` |
| `reject-checkresult-without-invocation` | `invariant.check_result_invocation_mismatch` |
| `reject-second-checkresult` | `invariant.check_result_already_recorded` |
| `reject-unsupported-contract-major` | capability preflight fails closed; no mutation |
| `reject-malformed-provider-output` | typed decoding fails; no partial ingestion or execution |
| `reject-evidence-locator-as-command` | locator remains inert data; no execution or replay |

### Accepted vectors

| Vector | Expected |
| --- | --- |
| `accept-atomic-check-result-bundle` | For an existing CheckInvocation, CheckResult + produced Evidence + Reconciliation + optional Verdict commit all-or-nothing; revision +1 |
| `accept-idempotent-replay` | same ID + identical content → no duplicate; revision unchanged |
| `accept-superseding-reconciliation` | new `rec_` with `supersedes`, old body preserved |
| `accept-checkresult-after-unrelated-append` | result for a frozen evaluated snapshot records against the current revision after an unrelated append; evaluated snapshot remains unchanged |
| `accept-supported-capability-handshake` | declared command API, contract range, and required provider interfaces match before mutation |

Every mutation vector must additionally assert, as observable behavior:

- rejected operations leave canonical semantic content unchanged;
- accepted bundles are all-or-nothing;
- revision increments exactly once per accepted transaction;
- idempotent replay does not duplicate records;
- same ID with different content is rejected;
- no derived status changes unless explicitly recomputed as a discardable projection;
- no semantic record is created merely because time passed or another record appeared.

## 4. Store → Check acceptance scenario

The single end-to-end vector that proves the contract (both branches):

1. **Declare** — a TaskDeclaration with structured criteria.
2. **Dispatch** — an Attempt anchored to the declaration, with repository/workspace binding.
3. **Observe** — a completion Claim citing typed Evidence.
4. **Resolve** — local repository/workspace binding resolves `repo_id`/`wsp_id` to a path.
5. **Begin Check** — the invoker creates CheckInvocation through Store and receives the
   recorded invocation plus frozen evaluation input.
6. **Check** — Check consumes that invocation/input and emits CheckResult plus
   Reconciliation against the named predicate.

Branch A (adequate semantics):

7a. Check emits a Verdict (conclusion + criterion-scoped findings + native judgment).

Branch B (insufficient semantics):

7b. Check emits Reconciliations + a `verdict_withheld` CheckResult, and **no Verdict** —
    a meaningful model state, not an error.

8. **Record** — Store ingests the bundle atomically under the current expected revision
   (`emitted ≠ recorded`).
9. **Settle** — a Settlement is recorded per the per-action basis matrix (`recorded ≠
   accepted`): `accept`/`land` cite a recorded Verdict (`basis.verdict_id`) or a
   `verification_exception`; `retry`/`abandon` cite `attempt_end_id`/`blocker_ids` and
   require no Verdict.

## 5. Governing test

Every snapshot fixture and every accepted mutation must satisfy:

> Deleting `history.jsonl` may reduce recovery and forensic detail, but must never make
> any record or internal reference in `state.json` semantically unintelligible.

Concretely: for each valid snapshot, remove the journal and confirm the snapshot still
validates and every internal reference still resolves.
