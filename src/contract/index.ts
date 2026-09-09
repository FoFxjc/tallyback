/**
 * Public barrel for the contract reference implementation.
 *
 * Exposes the derived reference types, canonical identifier validation, JCS
 * canonicalization, the `set`-array registry enforcement, the shared digest, and the
 * reference validator entry points (`validate_snapshot` / `validate_append` plus the
 * portable-header validators) and the invariant validator registry.
 */

export * from './types.js';
export * from './ids.js';
export * from './jcs.js';
export * from './canonical-arrays.js';
export * from './digest.js';
export * from './snapshot-digest.js';
export * from './supersession.js';
export * from './validator.js';
