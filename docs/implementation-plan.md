# Tallyback v1 — Implementation Plan

> Historical document. Describes the planning posture before v1 development began.
> v1 development **has** happened: the contract was frozen, the schemas/validators/
> fixtures/Store/Check landed, and Watch/Land/View/Bridge v1 were built on top. This
> file is retained as a record of the build order and bounded-scope decisions that
> governed that work — it is no longer "documentation only".

## 1. Build order

1. **`SPEC.md`** — normative semantics and boundaries (written this phase).
2. **`manifest.json`** — single contract version and artifact inventory.
3. **Structural schemas** — `records.schema.json`, `snapshot.schema.json`,
   `append-operation.schema.json`, `project.schema.json`, `bindings.schema.json`,
   `migration-report.schema.json`, `manifest.schema.json`.
4. **`invariants.json`** — stable rule IDs, phases, violation codes, spec anchors,
   required conformance cases.
5. **Canonical serialization / digest** — JCS (RFC 8785), the array-semantics registry
   (`canonicalization.json`), and the `Digest` shape.
6. **Reference validator** — `validate_snapshot` and `validate_append`.
7. **Snapshot fixtures** — positive and negative.
8. **Mutation vectors** — before / operation / expected.
9. **Derived TypeScript reference types** — plus schema-drift checks preventing the
   types from becoming a second source of truth.
10. **Store → Check acceptance scenario** — declaration + structured criteria; attempt,
    claim, typed evidence; local repository/workspace binding; CheckInvocation +
    CheckResult + Reconciliation; both branches (Verdict emitted / Verdict withheld);
    atomic Store recording under the then-current expected revision, including a vector
    proving unrelated intervening writes do not invalidate the frozen evaluation;
    Settlement recorded per the
    per-action basis matrix (accept/land require a Verdict XOR `verification_exception`;
    retry/abandon do not).

## 2. Bounded scope (must not creep)

- no workflow engine;
- no automatic status progression;
- no remote clone/fetch or artifact download (local binding only);
- no multi-writer merge or dependency-scoped rebase;
- no semantic garbage collection;
- no rich View/export profiles;
- no cryptographic attestation;
- no silent migration guesses.
- no telemetry, remote service, authentication flow, cloud database, MCP/App service, or
  silent remote fallback;
- no execution or replay derived from repository text, evidence locators, logs, artifacts,
  checker output, Git metadata, or migrated content.

Before a later distribution profile is authored, the CLI must expose a machine-readable
capability handshake (`implementation_version`, `command_api_version`, supported contract
ranges, and feature/provider interfaces). Every mutating workflow preflights it and fails
closed on unsupported majors. Explicit migration includes preview, validation, and a
migration report; it is not a compatibility fallback.

## 3. Freeze gate (historical)

The v1 written contract was reviewed and frozen before implementation; steps 2–10 of the
build order below were carried out against that frozen contract. The freeze-first
posture is preserved as a process expectation: any future contract change ships under a
new contract major version, with no in-place rewrites of the v1 spec.

## 4. Governing test

The single behavior that must always hold, and that every conformance vector and
accepted mutation is checked against:

> **Deleting `history.jsonl` may reduce recovery and forensic detail, but must never
> make any record or internal reference in `state.json` semantically unintelligible.**
