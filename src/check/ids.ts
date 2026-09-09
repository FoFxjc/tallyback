/**
 * Canonical identifier generation.
 *
 * Every durable entity ID is `<prefix>_<UUIDv7>` (see contract/SPEC.md §4.1).
 * The prefix is validated against the 19 canonical prefixes so a typo cannot
 * silently mint a foreign-prefixed identifier.
 */

import { v7 as uuidv7 } from 'uuid';

export const CANONICAL_PREFIXES = [
  'prj_',
  'top_',
  'tsk_',
  'dcl_',
  'att_',
  'ate_',
  'clm_',
  'evi_',
  'rec_',
  'chk_',
  'ckr_',
  'ver_',
  'set_',
  'repo_',
  'wsp_',
  'blk_',
  'brs_',
  'dec_',
  'cri_',
] as const;

export type CanonicalPrefix = (typeof CANONICAL_PREFIXES)[number];

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
