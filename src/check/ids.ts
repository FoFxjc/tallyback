/**
 * Canonical identifier generation.
 *
 * Every durable entity ID is `<prefix>_<UUIDv7>` (see contract/SPEC.md §4.1).
 * The prefix is validated against the 19 canonical prefixes so a typo cannot
 * silently mint a foreign-prefixed identifier.
 */

import { v7 as uuidv7 } from 'uuid';

import { PREFIXES, type Prefix } from '../contract/ids.js';

export const CANONICAL_PREFIXES = PREFIXES;

export type CanonicalPrefix = Prefix;

const PREFIX_SET: ReadonlySet<string> = new Set<string>(CANONICAL_PREFIXES);

/** Generate a canonical `<prefix>_<UUIDv7>` identifier. */
export function newId(prefix: CanonicalPrefix): string {
  if (!PREFIX_SET.has(prefix)) {
    throw new Error(`check_error: unknown canonical id prefix "${prefix}"`);
  }
  return `${prefix}${uuidv7()}`;
}

/** ISO-8601 timestamp for provenance fields. */
export function now(): string {
  return new Date().toISOString();
}
