/**
 * The shared digest object and its SHA-256 computation.
 *
 * The digest is always the object `{ "algorithm": "sha-256", "value": "<hex>" }`; the
 * field shape never collapses to a bare hash string. Digests are over exact bytes
 * (CRLF ≠ LF).
 *
 * `digest(value)` computes the canonical digest of a JSON value: it JCS-canonicalizes
 * the value and hashes the canonical bytes (a `Uint8Array` is hashed as-is, since it is
 * already a byte serialization). For the exact-bytes digest of a raw string or buffer,
 * use `sha256Hex` / `digestBytes` directly.
 */

import { createHash } from 'node:crypto';

import { jcsBytes } from './jcs.js';
import type { Digest } from './types.js';

export const DIGEST_ALGORITHM = 'sha-256';

/** 64 lowercase hex characters. */
const HEX_VALUE_PATTERN = /^[0-9a-f]{64}$/;

function toBytes(data: Uint8Array | string): Uint8Array {
  return typeof data === 'string' ? new TextEncoder().encode(data) : data;
}

/** Compute the SHA-256 digest of `data` and return its lowercase-hex encoding. */
export function sha256Hex(data: Uint8Array | string): string {
  return createHash('sha256').update(toBytes(data)).digest('hex');
}

/** Compute the raw SHA-256 digest bytes of `data`. */
export function digestBytes(data: Uint8Array | string): Uint8Array {
  return new Uint8Array(createHash('sha256').update(toBytes(data)).digest());
}

/**
 * The canonical digest of a JSON value: JCS-canonicalize (unless already bytes), then
 * SHA-256. Returns the shared `Digest` object shape.
 */
export function digest(value: unknown): Digest {
  const bytes = value instanceof Uint8Array ? value : jcsBytes(value);
  return { algorithm: DIGEST_ALGORITHM, value: sha256Hex(bytes) };
}

/** Whether `value` is a well-formed `Digest` object. */
export function isDigest(value: unknown): value is Digest {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { algorithm?: unknown; value?: unknown };
  return (
    candidate.algorithm === DIGEST_ALGORITHM &&
    typeof candidate.value === 'string' &&
    HEX_VALUE_PATTERN.test(candidate.value)
  );
}
