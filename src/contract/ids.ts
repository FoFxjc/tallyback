/**
 * Canonical identifier parsing and validation.
 *
 * Every durable, cross-referenced entity ID is `<prefix>_<UUIDv7>`. The type prefix
 * prevents accidental cross-entity references; the UUID supplies stable, merge-safe
 * identity. There are 19 prefixes: 18 top-level record types plus `cri_`, a scoped
 * lineage identifier for Criterion (nested inside an immutable TaskDeclaration — not a
 * top-level record type). `revision` is a monotonic concurrency field, not an entity.
 */

/** The canonical UUIDv7 version/variant shape (lowercase hex), no bare `format: uuid`. */
export const UUIDV7_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';

const UUIDV7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** All 19 canonical prefixes, including `cri_`. */
export const PREFIXES = [
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

export type Prefix = (typeof PREFIXES)[number];

/** The 18 top-level record-type prefixes (`cri_` excluded). */
export const TOP_LEVEL_PREFIXES = PREFIXES.filter((p) => p !== 'cri_');

export type TopLevelPrefix = Exclude<Prefix, 'cri_'>;

/** Prefix → record type name (or `criterion` for `cri_`, which is not a top-level type). */
export const RECORD_TYPE_BY_PREFIX: Readonly<Record<Prefix, string>> = {
  prj_: 'project',
  top_: 'topic',
  tsk_: 'task',
  dcl_: 'declaration',
  att_: 'attempt',
  ate_: 'attempt_end',
  clm_: 'claim',
  evi_: 'evidence',
  rec_: 'reconciliation',
  chk_: 'check_invocation',
  ckr_: 'check_result',
  ver_: 'verdict',
  set_: 'settlement',
  repo_: 'repository',
  wsp_: 'workspace',
  blk_: 'blocker',
  brs_: 'blocker_resolution',
  dec_: 'decision',
  cri_: 'criterion',
};

/** Record type name → canonical prefix. */
export const PREFIX_BY_RECORD_TYPE: Readonly<Record<string, Prefix>> = Object.fromEntries(
  Object.entries(RECORD_TYPE_BY_PREFIX).map(([prefix, type]) => [type, prefix]),
) as Readonly<Record<string, Prefix>>;

/** Whether a string is a well-formed UUIDv7 (without any prefix). */
export function isUuidV7(value: string): boolean {
  return UUIDV7_RE.test(value);
}

/** The matched canonical prefix of an ID, or null when none of the 19 prefixes match. */
export function prefixOf(id: string): Prefix | null {
  const match = /^([a-z]{2,4})_/.exec(id);
  if (!match) return null;
  const candidate = `${match[1]}_`;
  return (PREFIXES as readonly string[]).includes(candidate) ? (candidate as Prefix) : null;
}

export interface ParsedId {
  prefix: Prefix;
  uuid: string;
}

/** Parse an ID into its prefix and UUIDv7. Returns null when the shape is invalid. */
export function parseId(id: string): ParsedId | null {
  const match = /^([a-z]{2,4})_([0-9a-f-]+)$/.exec(id);
  if (!match) return null;
  const prefix = `${match[1]}_`;
  const uuid = match[2] ?? '';
  if (!(PREFIXES as readonly string[]).includes(prefix) || !UUIDV7_RE.test(uuid)) {
    return null;
  }
  return { prefix: prefix as Prefix, uuid };
}

/** Whether `id` is a valid canonical ID under any of the 19 prefixes. */
export function isValidId(id: string): boolean {
  return parseId(id) !== null;
}

/** Whether `id` carries exactly `prefix` and a well-formed UUIDv7. */
export function isValidIdForPrefix(id: string, prefix: Prefix): boolean {
  const parsed = parseId(id);
  return parsed !== null && parsed.prefix === prefix;
}

/** Whether `id` is a top-level record-type ID (any prefix except `cri_`). */
export function isTopLevelId(id: string): boolean {
  const parsed = parseId(id);
  return parsed !== null && parsed.prefix !== 'cri_';
}

/**
 * Assert that `id` is a valid canonical ID (optionally with a specific prefix).
 * Throws with a `schema.*`-shaped message on failure so callers can surface malformed
 * wire data distinctly from graph invariants.
 */
export function assertId(id: string, prefix?: Prefix): void {
  if (!isValidId(id)) {
    throw new Error(`schema.unknown_property: malformed canonical id: ${JSON.stringify(id)}`);
  }
  if (prefix !== undefined && !isValidIdForPrefix(id, prefix)) {
    throw new Error(
      `schema.unknown_property: expected ${prefix} id, got ${JSON.stringify(id)}`,
    );
  }
}
