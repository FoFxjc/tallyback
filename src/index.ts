/**
 * Public barrel for the Tallyback reference implementation.
 *
 * Single import surface for the capability handshake, the contract (types + id
 * validation + JCS canonicalization + digest + reference validator), the Store
 * (sole ledger writer), and the Check boundary (resolution, reconciliation,
 * invocation, flow, migration). The CLI is built on top of this barrel and is
 * NOT re-exported here (it lives under `dist/cli.js`).
 *
 * A few names are intentionally disambiguated below because the same identifier
 * is (for now) declared in more than one layer; each explicit re-export pins the
 * canonical public symbol. See the "name collisions" note under each section.
 */

// -- Capability handshake + version-range logic ---------------------------------

export {
  canMutateContractVersion,
  COMMAND_API_VERSION,
  CONTRACT_NAME,
  FEATURE_INTERFACES,
  handshake,
  IMPLEMENTATION_VERSION,
  SUPPORTED_CONTRACT_VERSIONS,
  supportsContractMajor,
} from './version.js';
export type { CapabilityHandshake } from './version.js';

// -- Contract (single source of truth for record shapes + validation) -----------

export * from './contract/index.js';

// -- Ledger (Store + append + supersession + projections + snapshot persistence) -

export * from './ledger/index.js';

// -- Check boundary (resolution, reconciliation, invocation, flow, migration) ----

export * from './check/index.js';

// -- Name-collision resolution ---------------------------------------------------
//
// The names below are exported by more than one layer. The explicit re-exports pin
// the canonical owner so `export *` remains unambiguous. Pending deduplication at
// the source (see coordination notes), these are the public symbols:

// `RECORD_TYPE_BY_PREFIX` (contract): prefix → record-type *name* string.
export { RECORD_TYPE_BY_PREFIX } from './contract/index.js';
// ledger's richer prefix → RecordTypeInfo registry is re-exported under a distinct name.
export { RECORD_TYPE_BY_PREFIX as RECORD_TYPE_INFO_BY_PREFIX } from './ledger/index.js';

// `newId` (ledger): `<prefix>_<UUIDv7>` generation (permissive prefix normalization).
export { newId } from './ledger/index.js';

// Boundary types shared by Store (ledger) and Check; the ledger's are canonical here.
// These are types, not values: they MUST be re-exported with `export type`. A plain
// `export { … }` type-checks (tsc erases it when emitting `dist/`) but leaves a real
// named import in the source, so any transpile-only consumer — esbuild, swc, tsx, vitest —
// fails to load this barrel with "does not provide an export named …".
export type { BeginCheckResult, RecordCheckOutputResult } from './ledger/index.js';

// `CheckResultOutcome` is owned by the contract's type surface.
export type { CheckResultOutcome } from './contract/index.js';

// `CollectionKey` (ledger): the 17 snapshot collection names. The contract's validator keeps
// a local (unexported) union of its own; the ledger's is the public symbol.
export type { CollectionKey } from './ledger/index.js';
