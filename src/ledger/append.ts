/**
 * Append transaction: the pure mutation core of the Store.
 *
 * A mutation is `validate → lock → append → persist`. This module implements the pure
 * append step over an in-memory snapshot: optimistic revision check, id-collision vs
 * idempotent-replay resolution, contract validation of the candidate graph as a whole,
 * and the single revision increment. It performs no I/O and acquires no lock — the
 * caller (the Store) holds the write lock and persists the returned snapshot.
 */

import { validate_append } from '../contract/index.js';
import { compareByCodeUnit } from '../contract/jcs.js';
import type { AnyRecord, AppendOperation, Snapshot } from '../contract/index.js';
import {
  allRecords,
  canonicalizeRecord,
  cloneSnapshot,
  recordId,
  recordTypeOf,
  type ValidationResult,
} from './snapshot.js';

export interface AppendSuccess {
  ok: true;
  snapshot: Snapshot;
  revision: number;
  /** Number of genuinely-new records appended. */
  appendedCount: number;
  /** Whether any record in the operation was an idempotent replay (skipped). */
  replayed: boolean;
}

export interface AppendFailure {
  ok: false;
  code: string;
  message?: string;
  /** The original contract `ValidationResult`, when the failure came from `validate_append`. */
  validation?: ValidationResult;
}

export type AppendResult = AppendSuccess | AppendFailure;

/** Read a record's canonical id without throwing on malformed records. */
function tryRecordId(record: AnyRecord): string | null {
  try {
    return recordId(record);
  } catch {
    return null;
  }
}

/**
 * Canonicalize a record, or report why it cannot be canonicalized.
 *
 * `applyAppend` runs identity comparison *before* schema validation (it has to: replay
 * detection is what decides whether there is anything to validate), so it is the first
 * code to touch arbitrary caller data. A record JCS cannot serialize — a property present
 * with an `undefined` value, a non-finite number — is malformed wire data, and an append
 * reports it as a rejected mutation rather than throwing out of a call whose contract is
 * "never throws for ordinary mutation failures".
 */
function tryCanonicalize(record: AnyRecord): { ok: true; canonical: string } | AppendFailure {
  try {
    return { ok: true, canonical: canonicalizeRecord(record) };
  } catch (err) {
    return {
      ok: false,
      code: 'schema.undefined_value',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Build the next snapshot by appending `records`, bumping the revision exactly once.
 * Preserves the `(record_type, id)` ordering by sorting each touched collection by id.
 * The singleton Project record is never appended here (its collection is undefined).
 */
function snapshotWithRecords(current: Snapshot, records: AnyRecord[]): Snapshot {
  const next = cloneSnapshot(current);
  for (const record of records) {
    const info = recordTypeOf(record);
    if (!info.collection) {
      throw new Error(`record type ${info.type} is not appendable (singleton)`);
    }
    const collection = next[info.collection] as unknown as AnyRecord[];
    // Deep-copy: the caller keeps its own object (command results hand it back), and a
    // committed record must be immutable. Storing the caller's reference would let a later
    // mutation of that object silently change what `currentSnapshot()` reports — including
    // the bytes a frozen `evaluated_snapshot.digest` was computed over.
    collection.push(structuredClone(record));
  }
  for (const record of records) {
    const info = recordTypeOf(record);
    if (!info.collection) continue;
    const collection = next[info.collection] as unknown as AnyRecord[];
    collection.sort((a, b) => compareByCodeUnit(recordId(a), recordId(b)));
  }
  next.revision = current.revision + 1;
  next.included_through = next.revision;
  return next;
}

/**
 * Apply an append operation to `current`, atomically. Never mutates `current`: on success
 * it returns a new snapshot; on failure it returns a code and leaves `current` untouched
 * (byte-identical — TB-ATOM-001).
 */
export function applyAppend(current: Snapshot, operation: AppendOperation): AppendResult {
  // Validate the ORIGINAL, unmodified operation as a whole, first. `validate_append`
  // checks the optimistic revision, the full append-operation schema (`kind`,
  // `expected_revision`, `provenance`, and every record — including an envelope `kind`
  // other than `append_records`, or an unknown top-level field), canonical set-array
  // semantics, id-collision/replay resolution, lifecycle guards, and the resulting graph.
  //
  // This has to run before any reconstruction. A "candidate" built from only the records
  // this function itself decided were new would hardcode `kind` and drop any other
  // top-level field, so a malformed envelope would never actually reach a schema check —
  // and if every record turned out to be an idempotent replay (or the operation carried
  // none at all), building that candidate at all would be skipped, so the envelope would
  // not be checked even once.
  const validation = validate_append(current, operation);
  if (!validation.ok) {
    return {
      ok: false,
      code: validation.code,
      message: 'message' in validation ? validation.message : undefined,
      validation,
    };
  }

  // The operation is valid as a whole. `validate_append` makes its own id-collision/replay
  // distinction internally to decide what to validate, but does not expose it — this
  // function's job is to actually construct the next snapshot, so it re-derives which
  // records are genuinely new. Every canonicalization below is now provably safe (a
  // record that could not be canonicalized would already have failed the check above).
  const existingById = new Map<string, AnyRecord>();
  for (const record of allRecords(current)) existingById.set(recordId(record), record);

  const newRecords: AnyRecord[] = [];
  const seen = new Map<string, string>(); // id -> canonical bytes, within the operation
  let replayed = false;

  for (const record of operation.records) {
    const id = tryRecordId(record);
    const canonicalized = tryCanonicalize(record);
    if (!canonicalized.ok) return canonicalized; // defensive: validate_append already screened this
    const canonical = canonicalized.canonical;

    // No recognizable id: validate_append's schema pass would already have rejected this.
    if (id === null) {
      newRecords.push(record);
      continue;
    }

    // Duplicate id within the same operation.
    const inOp = seen.get(id);
    if (inOp !== undefined) {
      if (inOp === canonical) {
        replayed = true;
        continue;
      }
      return { ok: false, code: 'invariant.id_collision' }; // defensive: already rejected above
    }
    seen.set(id, canonical);

    const existing = existingById.get(id);
    if (existing !== undefined) {
      const existingCanonical = tryCanonicalize(existing);
      if (!existingCanonical.ok) return existingCanonical;
      if (existingCanonical.canonical === canonical) {
        // Idempotent replay: same id, byte-identical content -> no-op for this record.
        replayed = true;
        continue;
      }
      // Same id, different bytes -> identity collision.
      return { ok: false, code: 'invariant.id_collision' };
    }

    newRecords.push(record);
  }

  // Everything was an idempotent replay: no mutation, revision unchanged.
  if (newRecords.length === 0) {
    return { ok: true, snapshot: current, revision: current.revision, appendedCount: 0, replayed };
  }

  const next = snapshotWithRecords(current, newRecords);
  return {
    ok: true,
    snapshot: next,
    revision: next.revision,
    appendedCount: newRecords.length,
    replayed,
  };
}
