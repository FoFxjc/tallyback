# Tallyback v1 — Contract Bundle Structure

> Historical v1 contract-bundle design record. The bundle described here is implemented
> under `contract/`; this document records its structure and release semantics.

## 1. Layout

```
contract/
├── manifest.json
├── SPEC.md
├── schemas/
│   ├── records.schema.json
│   ├── snapshot.schema.json
│   ├── append-operation.schema.json
│   ├── project.schema.json
│   ├── bindings.schema.json
│   ├── migration-report.schema.json
│   └── manifest.schema.json
├── canonicalization.json          # array-semantics + digest registry
├── invariants.json                # rule registry
├── fixtures/
│   ├── snapshots/
│   │   ├── valid/
│   │   └── invalid/
│   └── mutations/
│       ├── accepted/
│       └── rejected/
├── validator/                     # reference (not normative)
└── (derived)                      # generated TS types, docs, build outputs
```

## 2. Artifact responsibilities

| Artifact | Responsibility | Role |
| --- | --- | --- |
| `manifest.json` | Single contract version; role-classified inventory + digests of every artifact | `normative` |
| `schemas/*.json` | JSON Schema — wire structure, closed enums, ID syntax | `normative` |
| `canonicalization.json` | Array-semantics registry (which arrays are `set`/`ordered` + their comparator) and the digest shape | `normative` |
| `invariants.json` | Machine-readable registry of relational and mutation rules | `normative` |
| `fixtures/` | Conformance vectors (inputs **and** expected outcomes) | `normative` |
| `SPEC.md` | Normative semantics, trust boundaries, concepts not reducible to validation | `normative` |
| `validator/` | Reference validator executing the invariants — not a third source of truth | `reference` |
| generated TS types / docs / build outputs | Derived convenience, never wire-contract authority | `derived` |

## 3. JSON Schema authority

JSON Schema is authoritative for:

- record and operation shapes;
- required fields;
- discriminated unions;
- closed canonical enums;
- ID syntax (prefix + UUIDv7);
- scalar constraints;
- where extensions are permitted.

Core record objects are **closed** (`additionalProperties: false`). Checker-native data
has one explicitly open, namespaced extension boundary:

```json
{ "native_judgment": { "namespace": "done-or-not", "schema_version": "…", "payload": {} } }
```

Unknown properties are rejected outside such declared extension containers.

UUID validation does **not** rely only on `format: "uuid"`. The schema `pattern` enforces
the entity prefix and canonical UUIDv7 version/variant shape; the reference validator
may additionally parse and validate it semantically.

Reference types are **derived** from the structural schemas and are not a second
authority. TypeScript types may be generated or mechanically checked against the schema,
but changing a TypeScript interface alone does not change the wire contract.

## 4. manifest.json

```json
{
  "contract": "tallyback",
  "bundle_format_version": "1",
  "version": "1.0.0",
  "self_digest": { "algorithm": "sha-256", "value": "…" },
  "tree": { "algorithm": "sha-256", "value": "…" },
  "artifacts": {
    "spec":              { "path": "SPEC.md", "role": "normative", "digest": { "algorithm": "sha-256", "value": "…" } },
    "records_schema":    { "path": "schemas/records.schema.json", "role": "normative", "digest": { "algorithm": "sha-256", "value": "…" } },
    "snapshot_schema":   { "path": "schemas/snapshot.schema.json", "role": "normative", "digest": { "algorithm": "sha-256", "value": "…" } },
    "append_schema":     { "path": "schemas/append-operation.schema.json", "role": "normative", "digest": { "algorithm": "sha-256", "value": "…" } },
    "project_schema":    { "path": "schemas/project.schema.json", "role": "normative", "digest": { "algorithm": "sha-256", "value": "…" } },
    "bindings_schema":   { "path": "schemas/bindings.schema.json", "role": "normative", "digest": { "algorithm": "sha-256", "value": "…" } },
    "migration_report":  { "path": "schemas/migration-report.schema.json", "role": "normative", "digest": { "algorithm": "sha-256", "value": "…" } },
    "manifest_schema":   { "path": "schemas/manifest.schema.json", "role": "normative", "digest": { "algorithm": "sha-256", "value": "…" } },
    "canonicalization":  { "path": "canonicalization.json", "role": "normative", "digest": { "algorithm": "sha-256", "value": "…" } },
    "invariants":        { "path": "invariants.json", "role": "normative", "digest": { "algorithm": "sha-256", "value": "…" } },
    "fixtures":          { "path": "fixtures/", "role": "normative", "digest": { "algorithm": "sha-256", "value": "…" } },
    "validator":         { "path": "validator/", "role": "reference", "digest": { "algorithm": "sha-256", "value": "…" } }
  }
}
```

Every artifact carries a **role**: `normative` (specifies accepted behavior), `reference`
(the validator — not a third source of truth), or `derived` (generated types/docs/build
outputs). A manifest validator must reject an unlisted normative file, a missing listed
file, a duplicate path, and a role/derivation inconsistency.

- `self_digest` = JCS over the manifest with only `self_digest` omitted. It is an internal
  consistency check, **not** self-authentication; Git commit/signature or an externally
  known release digest anchors which manifest is trusted.
- `tree` = a domain-separated digest over `{ domain: "tallyback.artifact-tree.v1", entries:
  [{ path, type, size, digest }] }`, entries sorted by POSIX path. Digests are over exact
  bytes (CRLF ≠ LF). Absolute paths, `.`, `..`, duplicate and case-colliding paths, and
  symlinks/special files are rejected in v1.
- `bundle_format_version` and `version` (contract SemVer) are independent: the bundle
  layout may evolve without a semantic contract change and vice versa.
- Verification order: validate the manifest structurally → verify `self_digest` → verify
  every file/tree digest and inventory closure → only then load schemas/rules/fixtures.

All normative artifacts ship under **one** contract version. Schema and invariants do
not have independently drifting compatibility versions. Any normative change produces a
new contract release:

- breaking shape, meaning, or rule change → **major**;
- backward-compatible addition → **minor**;
- clarification/correction that does not change accepted behavior → **patch**.

Contract bundle immutability — the property that `version` + digests identify one stable
bundle — begins once a contract version is publicly released and tagged. Before that
first public release, documentation-only corrections to an unreleased bundle may
regenerate its digests without implying a new semantic contract version.

Artifact digests identify the exact bundle used by a validator or a Check.

## 5. invariants.json

A versioned, machine-readable rule registry. A rule entry:

```json
{
  "id": "TB-REF-001",
  "phase": "snapshot",
  "applies_to": ["Verdict"],
  "validator": "verdict.declaration_and_criteria_resolve",
  "violation_code": "invariant.verdict_scope_unresolved",
  "summary": "Every Verdict declaration and criterion reference resolves within the snapshot.",
  "spec_anchor": "verdict-reference-integrity",
  "conformance_cases": [
    "snapshot/verdict-valid-scope",
    "snapshot/verdict-missing-declaration",
    "snapshot/verdict-foreign-criterion"
  ]
}
```

- `validator` is a stable symbolic predicate implemented by the reference validator.
  The catalog is not pretending that an English summary is executable.
- The conformance suite must fail if: a catalog rule has no registered validator; a
  validator has no catalog entry; a rule lacks positive/negative coverage where
  applicable; the emitted violation code differs from the catalog.

**No** JSON Logic, CEL, Rego, or custom expression language in v1. A compact reference
validator with stable rule IDs is more inspectable than a newly invented rules engine.

## 6. Two validation entry points

- `validate_snapshot(snapshot)` — structural + referential validity of a final snapshot.
- `validate_append(current_snapshot, append_operation)` — transition validity (ID
  immutability, optimistic revision checks, atomic bundle ingestion, "ended Attempt
  cannot restart").

These must be separate because several rules cannot be determined from a final snapshot
alone.

## 7. Code namespaces

| namespace | meaning | examples |
| --- | --- | --- |
| `schema.*` | malformed wire data | `schema.unknown_property` |
| `invariant.*` | invalid graph or lifecycle mutation | `invariant.attempt_already_ended` |
| `mutation.*` | transaction/concurrency failure | `mutation.revision_conflict` |
| `resolution.*` | repository/workspace/evidence resolution result | `resolution.repository_unbound` |
| `check.*` | Check gate or capability diagnostic | `check.declaration_semantics_missing` |

These are distinct layers and must not be flattened into one "validation errors" enum.
