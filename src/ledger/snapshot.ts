/**
 * Portable snapshot persistence + canonical digest.
 *
 * `state.json` is the portable canonical semantic snapshot: the complete referenced
 * record graph at one snapshot revision, INCLUDING superseded bodies. `project.json` is a
 * bootstrap + validated header. `history.jsonl` is the local operational journal
 * (append-only, non-authoritative). `runtime/bindings.json` is machine-local and always
 * ignored.
 *
 * The semantic digest is computed over canonical (JCS) bytes of the snapshot with the
 * discardable `projections` section removed and each record collection ordered by record
 * ID (the collection key is the record type). It is NOT computed over pretty-printed bytes.
 *
 * Record shapes, id rules, canonicalization, and the digest object are the contract's
 * authority (`../contract/index.js`). This module adds the ledger's own registry
 * (prefix → collection/id-field), I/O, and the snapshot digest.
 */

import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { v7 } from 'uuid';
import {
  canonicalizeJson,
  findAbsolutePath,
  isValidId,
  prefixOf,
  semanticSnapshotDigest,
  semanticSnapshotDigestHex,
  sha256Hex,
  validate_bindings,
  validate_project_manifest,
} from '../contract/index.js';
import type { AnyRecord, Project, Snapshot } from '../contract/index.js';

/** Structural schema version stamped on `state.json` (matches the contract literal). */
export const SCHEMA_VERSION = '1.0.0';

/** Default projection policy id used when computing discardable projections. */
export const DEFAULT_PROJECTION_POLICY = 'default-v1';

// Validation types are the contract's authority (lead-locked, list-form); re-exported here
// so snapshot consumers can keep a single import path. Resolves once the validator lands.
export type { ValidationResult } from '../contract/index.js';

export interface ProjectManifest {
  project_id: string;
  repositories: { repository_id: string; alias: string }[];
}

export interface Bindings {
  repositories: Record<string, { workspaces: Record<string, { root: string }> }>;
}

export interface HistoryEntry {
  seq: number;
  at: string;
  kind: string;
  revision: number;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Record-type registry (prefix → collection / id field)
// ---------------------------------------------------------------------------

export type CollectionKey =
  | 'repositories'
  | 'workspaces'
  | 'topics'
  | 'tasks'
  | 'declarations'
  | 'attempts'
  | 'attempt_ends'
  | 'claims'
  | 'evidence'
  | 'reconciliations'
  | 'check_invocations'
  | 'check_results'
  | 'verdicts'
  | 'settlements'
  | 'blockers'
  | 'blocker_resolutions'
  | 'decisions';

export interface RecordTypeInfo {
  /** Canonical record-type name (e.g. `declaration`). */
  type: string;
  /** ID prefix including the underscore (e.g. `dcl_`). */
  prefix: string;
  /** The record's own ID field name (e.g. `declaration_id`). */
  idField: string;
  /** Whether this record type may carry `supersedes` (SPEC §5, TB-SUP-004). */
  supersessionCapable: boolean;
  /** The snapshot collection for array-valued record types; undefined for the singleton Project. */
  collection?: CollectionKey;
  /** Required fields whose joint presence uniquely identifies this record type. */
  signature: string[];
}

/** The singleton Project record (not a collection in `state.json`). */
export const PROJECT_RECORD_TYPE: RecordTypeInfo = {
  type: 'project',
  prefix: 'prj_',
  idField: 'project_id',
  supersessionCapable: false,
  signature: ['repositories'],
};

/**
 * The 17 array-valued record-type collections. `attempt` precedes `workspace` because a
 * Workspace's id fields are a strict subset of an Attempt's (an Attempt references both
 * `repository_id` and `workspace_id`); checking the more specific type first keeps
 * `recordTypeOf` unambiguous.
 */
export const LEDGER_RECORD_TYPES: readonly RecordTypeInfo[] = [
  {
    type: 'repository',
    prefix: 'repo_',
    idField: 'repository_id',
    supersessionCapable: false,
    collection: 'repositories',
    signature: ['alias'],
  },
  {
    type: 'attempt',
    prefix: 'att_',
    idField: 'attempt_id',
    supersessionCapable: false,
    collection: 'attempts',
    signature: ['executor'],
  },
  {
    type: 'workspace',
    prefix: 'wsp_',
    idField: 'workspace_id',
    supersessionCapable: false,
    collection: 'workspaces',
    signature: ['workspace_id'],
  },
  {
    type: 'topic',
    prefix: 'top_',
    idField: 'topic_id',
    supersessionCapable: false,
    collection: 'topics',
    signature: ['name'],
  },
  {
    type: 'task',
    prefix: 'tsk_',
    idField: 'task_id',
    supersessionCapable: false,
    collection: 'tasks',
    signature: ['title'],
  },
  {
    type: 'declaration',
    prefix: 'dcl_',
    idField: 'declaration_id',
    supersessionCapable: true,
    collection: 'declarations',
    signature: ['objective'],
  },
  {
    type: 'attempt_end',
    prefix: 'ate_',
    idField: 'attempt_end_id',
    supersessionCapable: true,
    collection: 'attempt_ends',
    signature: ['outcome'],
  },
  {
    type: 'claim',
    prefix: 'clm_',
    idField: 'claim_id',
    supersessionCapable: false,
    collection: 'claims',
    signature: ['statement'],
  },
  {
    type: 'evidence',
    prefix: 'evi_',
    idField: 'evidence_id',
    supersessionCapable: false,
    collection: 'evidence',
    signature: ['kind'],
  },
  {
    type: 'reconciliation',
    prefix: 'rec_',
    idField: 'reconciliation_id',
    supersessionCapable: true,
    collection: 'reconciliations',
    signature: ['method'],
  },
  {
    type: 'check_invocation',
    prefix: 'chk_',
    idField: 'check_invocation_id',
    supersessionCapable: false,
    collection: 'check_invocations',
    signature: ['checker'],
  },
  {
    type: 'check_result',
    prefix: 'ckr_',
    idField: 'check_result_id',
    supersessionCapable: false,
    collection: 'check_results',
    signature: ['outcome'],
  },
  {
    type: 'verdict',
    prefix: 'ver_',
    idField: 'verdict_id',
    supersessionCapable: false,
    collection: 'verdicts',
    signature: ['conclusion'],
  },
  {
    type: 'settlement',
    prefix: 'set_',
    idField: 'settlement_id',
    supersessionCapable: true,
    collection: 'settlements',
    signature: ['decision'],
  },
  {
    type: 'blocker',
    prefix: 'blk_',
    idField: 'blocker_id',
    supersessionCapable: false,
    collection: 'blockers',
    signature: ['description'],
  },
  {
    type: 'blocker_resolution',
    prefix: 'brs_',
    idField: 'blocker_resolution_id',
    supersessionCapable: true,
    collection: 'blocker_resolutions',
    signature: ['disposition'],
  },
  {
    type: 'decision',
    prefix: 'dec_',
    idField: 'decision_id',
    supersessionCapable: true,
    collection: 'decisions',
    signature: ['role'],
  },
] as const;

/** All 18 record types (the singleton Project + the 17 collections). */
export const ALL_RECORD_TYPES: readonly RecordTypeInfo[] = [
  PROJECT_RECORD_TYPE,
  ...LEDGER_RECORD_TYPES,
];

export const RECORD_TYPE_BY_PREFIX: ReadonlyMap<string, RecordTypeInfo> = new Map(
  ALL_RECORD_TYPES.map((info) => [info.prefix, info]),
);

// ---------------------------------------------------------------------------
// Identity helpers
// ---------------------------------------------------------------------------

/** Generate a canonical entity ID: `<prefix>_<UUIDv7>`. */
export function newId(prefix: string): string {
  const normalized = prefix.endsWith('_') ? prefix : `${prefix}_`;
  return `${normalized}${v7()}`;
}

/** Extract the canonical prefix (with trailing underscore) from an ID string. */
export function idPrefix(id: string): string {
  const idx = id.indexOf('_');
  if (idx < 0) return '';
  return id.slice(0, idx + 1);
}

/**
 * Infer the record-type info for a record from its own ID field plus a unique signature
 * of required fields. Reference id fields (`task_id` on a declaration, etc.) share field
 * names with other records' primary ids, so the id field alone is ambiguous; the
 * signature disambiguates.
 */
export function recordTypeOf(record: AnyRecord): RecordTypeInfo {
  const any = record as Record<string, unknown>;
  for (const info of ALL_RECORD_TYPES) {
    const value = any[info.idField];
    if (typeof value !== 'string' || prefixOf(value) !== info.prefix) continue;
    if (info.signature.every((field) => field in any)) return info;
  }
  throw new Error('record does not carry a recognizable canonical ID');
}

/** Read the canonical ID of a record. */
export function recordId(record: AnyRecord): string {
  return (record as Record<string, unknown>)[recordTypeOf(record).idField] as string;
}

/** Whether an arbitrary string is a structurally valid canonical entity ID. */
export function isCanonicalId(id: string): boolean {
  return isValidId(id);
}

// ---------------------------------------------------------------------------
// Collection access + record lookup
// ---------------------------------------------------------------------------

export function getCollection(snapshot: Snapshot, collection: CollectionKey): AnyRecord[] {
  return snapshot[collection] as unknown as AnyRecord[];
}

/** All records in the snapshot (the Project singleton first, then collections in order). */
export function allRecords(snapshot: Snapshot): AnyRecord[] {
  const out: AnyRecord[] = [snapshot.project];
  for (const info of LEDGER_RECORD_TYPES) {
    out.push(...getCollection(snapshot, info.collection as CollectionKey));
  }
  return out;
}

/** Locate a record by canonical ID across all collections (and the Project singleton). */
export function findRecord(snapshot: Snapshot, id: string): AnyRecord | undefined {
  if (!isValidId(id)) return undefined;
  const prefix = prefixOf(id);
  if (!prefix) return undefined;
  if (prefix === PROJECT_RECORD_TYPE.prefix) {
    return snapshot.project.project_id === id ? snapshot.project : undefined;
  }
  const info = RECORD_TYPE_BY_PREFIX.get(prefix);
  if (!info || !info.collection) return undefined;
  return getCollection(snapshot, info.collection).find((r) => recordId(r) === id);
}

// ---------------------------------------------------------------------------
// Canonical digest
// ---------------------------------------------------------------------------

// The §10 semantic-digest rules live in the contract layer (`contract/snapshot-digest.ts`)
// and are re-exported here so ledger consumers keep one import path. There is exactly one
// implementation: a second copy is how two layers end up disagreeing about the identity of
// a revision that a frozen `evaluated_snapshot` has already committed to.
export { canonicalSnapshotForDigest } from '../contract/index.js';

/** Canonical (JCS) serialization of a single record, as a UTF-8 string. */
export function canonicalizeRecord(record: AnyRecord): string {
  return canonicalizeJson(record);
}

/** SHA-256 hex of a single record's canonical bytes. */
export function recordDigestHex(record: AnyRecord): string {
  return sha256Hex(canonicalizeRecord(record));
}

/** SHA-256 hex of the snapshot's canonical bytes (projections excluded). */
export function snapshotDigestHex(snapshot: Snapshot): string {
  return semanticSnapshotDigestHex(snapshot);
}

/** The shared `Digest` object for a snapshot (never a bare hash string). */
export function snapshotDigest(snapshot: Snapshot): { algorithm: 'sha-256'; value: string } {
  return semanticSnapshotDigest(snapshot);
}

// ---------------------------------------------------------------------------
// Snapshot construction
// ---------------------------------------------------------------------------

/** A pre-init placeholder snapshot (used only before `load`/`initialize`). */
export function emptySnapshot(): Snapshot {
  return {
    schema_version: SCHEMA_VERSION,
    revision: 0,
    included_through: 0,
    project: { project_id: '', repositories: [] },
    repositories: [],
    workspaces: [],
    topics: [],
    tasks: [],
    declarations: [],
    attempts: [],
    attempt_ends: [],
    claims: [],
    evidence: [],
    reconciliations: [],
    check_invocations: [],
    check_results: [],
    verdicts: [],
    settlements: [],
    blockers: [],
    blocker_resolutions: [],
    decisions: [],
  };
}

export function cloneSnapshot(snapshot: Snapshot): Snapshot {
  return structuredClone(snapshot);
}

// ---------------------------------------------------------------------------
// Filesystem I/O
// ---------------------------------------------------------------------------

/** Resolve the project root by walking up from `startDir` to a `package.json`. */
export function findProjectRoot(startDir: string): string {
  let dir = startDir;
  for (;;) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`no project root found walking up from ${startDir}`);
    }
    dir = parent;
  }
}

/** The `.tallyback` ledger directory under a project root. */
export function ledgerRoot(projectRoot: string): string {
  return join(projectRoot, '.tallyback');
}

/**
 * Whether `projectRoot` provably holds no ledger: NEITHER portable file exists.
 *
 * This is the one absence state a caller may report as "not initialized". Anything else —
 * one file present without the other (a partial init or a hand deletion), a permission
 * error, `.tallyback` being a plain file — is not proven absence and returns false, so the
 * caller surfaces the original failure instead of hiding a damaged ledger behind a
 * friendly bootstrap hint.
 */
export async function isLedgerAbsent(projectRoot: string): Promise<boolean> {
  const root = ledgerRoot(projectRoot);
  for (const file of ['project.json', 'state.json']) {
    try {
      await lstat(join(root, file));
      return false;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') return false;
    }
  }
  return true;
}

/**
 * SPEC §6: `history.jsonl` (local journal) and `runtime/` (bindings with absolute paths,
 * locks, caches) are never committed. Written into `.tallyback/` when a ledger is created
 * so a plain `git add -A` cannot commit them (dogfood F11: it did, in 2/9 runs). An existing
 * `.gitignore` is left untouched — it may be the user's.
 */
export const LEDGER_GITIGNORE =
  '# Machine-local Tallyback state (SPEC §6): never commit.\nhistory.jsonl\nruntime/\n';

export async function ensureLedgerGitignore(root: string): Promise<void> {
  await mkdir(root, { recursive: true });
  try {
    await writeFile(join(root, '.gitignore'), LEDGER_GITIGNORE, { flag: 'wx' });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
  }
}

/** The machine-local `runtime/` directory (locks, bindings, caches) — never committed. */
export function runtimeDir(root: string): string {
  return join(root, 'runtime');
}

/** The store's cross-process single-writer lock file. */
export function storeLockPath(root: string): string {
  return join(runtimeDir(root), 'store.lock');
}

/**
 * Write JSON atomically: serialize to a uniquely named sibling temp file, then rename.
 *
 * The temp name carries a random component as well as the PID. A PID alone is not unique
 * — two containers or two hosts sharing a checkout can collide on it, and a recycled PID
 * can collide with an abandoned temp file from an earlier crash — and a collision here
 * would let one writer's partial bytes be renamed over the ledger.
 */
async function writeJsonAtomic(filePath: string, value: unknown, pretty = true): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const text = (pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value)) + '\n';
  const tmp = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(tmp, text, 'utf8');
    await rename(tmp, filePath);
  } catch (err) {
    // Never leave a partial temp file behind for a later writer to trip over.
    await rm(tmp, { force: true }).catch(() => undefined);
    throw err;
  }
}

async function readJson(filePath: string): Promise<unknown> {
  const text = await readFile(filePath, 'utf8');
  return JSON.parse(text) as unknown;
}

/**
 * Portable files must never carry machine-local absolute paths (SPEC §5.2: "Absolute
 * paths live only in the machine-local binding, never in a committable file"). The closed
 * schemas already have no field to put one in; this is the belt-and-braces check on the
 * write path, so a future field can never quietly start leaking one.
 */
/** Throw when `value` carries an absolute path under a path-bearing key. */
export function assertNoAbsolutePaths(value: unknown, what: string): void {
  const found = findAbsolutePath(value);
  if (found) {
    throw new StorePersistenceError(
      'invariant.absolute_path_in_portable_file',
      `${what} would carry the absolute path ${JSON.stringify(found.value)} at ${found.at}; ` +
        'absolute paths belong only in runtime/bindings.json',
    );
  }
}

/** A persistence-layer failure carrying a stable namespaced code. */
export class StorePersistenceError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'StorePersistenceError';
    this.code = code;
  }
}

export async function writeSnapshot(root: string, snapshot: Snapshot): Promise<void> {
  assertNoAbsolutePaths(snapshot, 'state.json');
  await writeJsonAtomic(join(root, 'state.json'), snapshot, true);
}

export async function readSnapshot(root: string): Promise<Snapshot> {
  const value = (await readJson(join(root, 'state.json'))) as Snapshot;
  if (typeof value !== 'object' || value === null) {
    throw new StorePersistenceError('schema.unknown_property', 'state.json is not an object');
  }
  return value as Snapshot;
}

export async function writeProject(root: string, manifest: ProjectManifest): Promise<void> {
  assertNoAbsolutePaths(manifest, 'project.json');
  const validation = validate_project_manifest(manifest);
  if (!validation.ok) {
    throw new StorePersistenceError(
      validation.code,
      validation.message ?? 'project.json does not satisfy project.schema.json',
    );
  }
  await writeJsonAtomic(join(root, 'project.json'), manifest, true);
}

/** Read `project.json` and validate it against the frozen `project.schema.json`. */
export async function readProject(root: string): Promise<ProjectManifest> {
  let value: unknown;
  try {
    value = await readJson(join(root, 'project.json'));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw err;
    throw new StorePersistenceError(
      'schema.invalid_project_manifest',
      `project.json is not readable JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const validation = validate_project_manifest(value);
  if (!validation.ok) {
    throw new StorePersistenceError(
      validation.code,
      validation.message ?? 'project.json does not satisfy project.schema.json',
    );
  }
  return value as ProjectManifest;
}

const EMPTY_BINDINGS: Bindings = { repositories: {} };

/**
 * Read the machine-local bindings, validated against `bindings.schema.json`.
 *
 * A missing file is the normal "nothing bound yet" state and yields an empty binding set;
 * a malformed one fails closed rather than being silently treated as empty, because
 * silently losing a binding would turn a resolvable workspace into `repository_unbound`.
 */
export async function readBindings(root: string): Promise<Bindings> {
  let value: unknown;
  try {
    value = await readJson(join(root, 'runtime', 'bindings.json'));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { ...EMPTY_BINDINGS };
    throw new StorePersistenceError(
      'schema.invalid_bindings',
      `runtime/bindings.json is not readable JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const validation = validate_bindings(value);
  if (!validation.ok) {
    throw new StorePersistenceError(
      validation.code,
      validation.message ?? 'runtime/bindings.json does not satisfy bindings.schema.json',
    );
  }
  return value as Bindings;
}

export async function writeBindings(root: string, bindings: Bindings): Promise<void> {
  const validation = validate_bindings(bindings);
  if (!validation.ok) {
    throw new StorePersistenceError(
      validation.code,
      validation.message ?? 'runtime/bindings.json does not satisfy bindings.schema.json',
    );
  }
  await writeJsonAtomic(join(root, 'runtime', 'bindings.json'), bindings, true);
}

/** Append one entry to the local operational journal (`history.jsonl`). */
export async function appendHistory(root: string, entry: HistoryEntry): Promise<void> {
  const line = JSON.stringify(entry) + '\n';
  const path = join(root, 'history.jsonl');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, line, { encoding: 'utf8', flag: 'a' });
}

/** Read + return the journal as parsed entries (best-effort; the journal is non-authoritative). */
export async function readHistory(root: string): Promise<HistoryEntry[]> {
  try {
    const text = await readFile(join(root, 'history.jsonl'), 'utf8');
    return text
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as HistoryEntry);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Timestamp helper
// ---------------------------------------------------------------------------

export function nowIso(): string {
  return new Date().toISOString();
}

/** Re-export the shared Project type for the manifest header. */
export type { Project };
