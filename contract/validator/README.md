# Reference validator

This directory is the **reference** implementation of the Tallyback v1 contract
validator. In `contract/manifest.json` its role is `reference`: it executes the
invariants catalogued in `contract/invariants.json` and enforces the structural
rules in `contract/schemas/*.json`, but it is **not** a third source of truth.
The schemas, `canonicalization.json`, and `invariants.json` are normative; this
implementation is a convenience reference.

## Implementation

The executable reference validator lives in the TypeScript source tree:

- `src/contract/validator.ts` — `validate_snapshot`, `validate_append`, and the
  `INVARIANT_VALIDATORS` registry mapping each `contract/invariants.json` rule to
  its implementation.
- `src/contract/index.ts` — the public barrel re-exporting the validator.

## Entry points

- `validate_snapshot(snapshot)` — structural (JSON Schema) + referential validity
  of a final snapshot.
- `validate_append(current, operation)` — transition validity: optimistic
  revision check, id immutability/collision/replay, lifecycle guards, and
  candidate-graph validation.

Both return a `ValidationResult`:

```ts
type ValidationResult =
  | { ok: true }
  | { ok: false; code: string; message?: string; details?: unknown };
```

Violation `code` values are namespaced by layer: `schema.*` (malformed wire
data), `invariant.*` (invalid graph/lifecycle), `mutation.*` (transaction/
concurrency).

## Running

```sh
npm test              # full suite, including the conformance fixtures
```

Conformance vectors (inputs and expected outcomes) live in
`contract/fixtures/` and are normative.
