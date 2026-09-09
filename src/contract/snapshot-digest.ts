/**
 * The §10 **semantic** snapshot digest.
 *
 * SPEC §10: "`projections` are excluded from the semantic digest; the whole snapshot is
 * ordered by `(record_type, id)` before hashing."
 *
 * This lives in the contract layer, not the ledger, because it is a contract rule: any
 * consumer that freezes a `CheckInvocation.evaluated_snapshot` has to hash the same bytes
 * the ledger does, and a second implementation of "the digest, but excluding projections"
 * is exactly how two layers end up disagreeing about what revision N *was*.
 *
 * The generic `digest()` in `digest.js` hashes whatever value it is handed — including a
 * `projections` section, which is discardable cache and must never change the semantic
 * identity of a revision. Use `semanticSnapshotDigest` for a snapshot; `digest` for
 * anything else.
 */

import { canonicalizeJson } from './jcs.js';
import { digest } from './digest.js';
import { recordIdOf, RECORD_TYPES } from './record-types.js';
import { sha256Hex } from './digest.js';
import type { AnyRecord, Digest, Snapshot } from './types.js';

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The canonical form used for the semantic digest: `projections` removed and every record
 * collection ordered by record ID. Array order is otherwise preserved (JCS never sorts
 * arrays, SPEC §10); the `project` singleton is left intact.
 */
export function canonicalSnapshotForDigest(snapshot: Snapshot): unknown {
  const { projections: _projections, ...rest } = snapshot as Snapshot & { projections?: unknown };
  const out: Record<string, unknown> = { ...rest };
  for (const info of RECORD_TYPES) {
    if (!info.collection) continue;
    const value = out[info.collection];
    if (!Array.isArray(value)) continue;
    const sorted = (value as AnyRecord[]).slice();
    sorted.sort((x, y) => compareIds(recordIdOf(x) ?? '', recordIdOf(y) ?? ''));
    out[info.collection] = sorted;
  }
  return out;
}

/** SHA-256 hex of a snapshot's canonical semantic bytes (projections excluded). */
export function semanticSnapshotDigestHex(snapshot: Snapshot): string {
  return sha256Hex(canonicalizeJson(canonicalSnapshotForDigest(snapshot)));
}

/** The shared `Digest` object for a snapshot's semantic content. */
export function semanticSnapshotDigest(snapshot: Snapshot): Digest {
  return digest(canonicalSnapshotForDigest(snapshot));
}
