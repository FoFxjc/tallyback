/**
 * Canonical `set`-array enforcement, driven by `contract/canonicalization.json`.
 *
 * SPEC §10: JCS never sorts arrays. An `ordered` array keeps its given order because its
 * order is semantic; a `set` array is canonicalized by the normative array-semantics
 * registry's own comparator, applied **before** JCS serialization — it must already be
 * **sorted and duplicate-free, otherwise the input is rejected**.
 *
 * This module is the wiring between that registry and the validator: it reads the frozen
 * `array_semantics` table (never a hand-maintained copy of it) and walks every registered
 * `set` path on a snapshot or a single record. Validation **rejects** a non-canonical set
 * array; it never silently normalizes one. `canonicalizeSetArraysInRecord` is the separate,
 * explicitly non-authoritative producer helper (SPEC §10: "any optional normalize helper
 * is explicitly separate and non-authoritative; its output must be revalidated").
 *
 * Registered path syntax (as it appears in `canonicalization.json`):
 *
 *   snapshot.<collection>            the snapshot's top-level record collections
 *   project.<field>                  a field of the singleton Project record
 *   <record_type>.<field>[.<field>]  a field (possibly nested) of a record of that type
 *   <record_type>.<field>[].<field>  `[]` iterates every element of an intermediate array
 *
 * Ordering is by the entry's `key` (a property of each element) when present, otherwise
 * by the element string itself (`comparator: "lexical-by-id"`). Both use the single
 * RFC 8785 UTF-16 code-unit comparator from `jcs.ts`.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compareByCodeUnit } from './jcs.js';
import { recordTypeOf, RECORD_TYPES, type CollectionKey } from './record-types.js';
import type { AnyRecord, Snapshot } from './types.js';

/** Violation codes for a non-canonical `set` array (malformed wire data — SPEC §11). */
export const SET_ARRAY_UNSORTED = 'schema.set_array_unsorted';
export const SET_ARRAY_DUPLICATE = 'schema.set_array_duplicate';

export interface SetArrayViolation {
  code: typeof SET_ARRAY_UNSORTED | typeof SET_ARRAY_DUPLICATE;
  message: string;
}

interface PathSegment {
  field: string;
  /** `true` when the segment is written `field[]`: iterate every element of that array. */
  each: boolean;
}

export interface SetArrayPath {
  /** The registry path, verbatim (e.g. `verdict.findings[].basis_refs`). */
  path: string;
  /** `snapshot`, `project`, or a canonical record-type name. */
  root: string;
  segments: PathSegment[];
  /** Element property to order by; absent means order by the element string itself. */
  key?: string;
  comparator?: string;
}

// ---------------------------------------------------------------------------
// Registry loading
// ---------------------------------------------------------------------------

const CONTRACT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'contract');

interface RegistryEntry {
  path: string;
  semantics: 'set' | 'ordered';
  key?: string;
  comparator?: string;
}

interface CanonicalizationRegistry {
  array_semantics?: RegistryEntry[];
}

function parsePath(entry: RegistryEntry): SetArrayPath {
  const parts = entry.path.split('.');
  const root = parts[0] ?? '';
  const segments: PathSegment[] = parts.slice(1).map((raw) => {
    const each = raw.endsWith('[]');
    return { field: each ? raw.slice(0, -2) : raw, each };
  });
  return { path: entry.path, root, segments, key: entry.key, comparator: entry.comparator };
}

let cachedPaths: readonly SetArrayPath[] | null = null;

/** Every `set` path in the frozen array-semantics registry, parsed. */
export function setArrayPaths(): readonly SetArrayPath[] {
  if (cachedPaths) return cachedPaths;
  const raw = readFileSync(join(CONTRACT_DIR, 'canonicalization.json'), 'utf8');
  const registry = JSON.parse(raw) as CanonicalizationRegistry;
  const entries = registry.array_semantics ?? [];
  const setEntries = entries.filter((e) => e.semantics === 'set');
  if (setEntries.length === 0) {
    throw new Error('contract: canonicalization.json declares no `set` arrays');
  }
  const parsed = setEntries.map(parsePath);
  const knownRoots = new Set<string>(['snapshot', 'project', ...RECORD_TYPES.map((r) => r.type)]);
  for (const p of parsed) {
    if (!knownRoots.has(p.root)) {
      throw new Error(`contract: canonicalization.json set path has unknown root "${p.root}"`);
    }
  }
  cachedPaths = parsed;
  return cachedPaths;
}

/** The registered `set` paths rooted at a given record type (excludes snapshot/project). */
function pathsForRecordType(type: string): SetArrayPath[] {
  return setArrayPaths().filter((p) => p.root === type);
}

// ---------------------------------------------------------------------------
// Checking
// ---------------------------------------------------------------------------

type AnyObject = Record<string, unknown>;

function sortKeyOf(item: unknown, key: string | undefined): string | null {
  if (key === undefined) {
    return typeof item === 'string' ? item : null;
  }
  if (typeof item !== 'object' || item === null) return null;
  const value = (item as AnyObject)[key];
  return typeof value === 'string' ? value : null;
}

/**
 * Assert one array is canonical for its registered semantics. Elements whose sort key is
 * not a string are skipped for ordering purposes: those are structural faults the JSON
 * Schema layer reports with its own `schema.*` code.
 */
function checkArray(
  array: unknown[],
  spec: SetArrayPath,
  where: string,
): SetArrayViolation | null {
  let previous: string | null = null;
  for (const item of array) {
    const key = sortKeyOf(item, spec.key);
    if (key === null) {
      previous = null;
      continue;
    }
    if (previous !== null) {
      const cmp = compareByCodeUnit(previous, key);
      if (cmp > 0) {
        return {
          code: SET_ARRAY_UNSORTED,
          message: `${where} (${spec.path}) is a set array but is not sorted: ${JSON.stringify(previous)} precedes ${JSON.stringify(key)}`,
        };
      }
      if (cmp === 0) {
        return {
          code: SET_ARRAY_DUPLICATE,
          message: `${where} (${spec.path}) is a set array but contains the duplicate entry ${JSON.stringify(key)}`,
        };
      }
    }
    previous = key;
  }
  return null;
}

/** Walk `segments` from `container`, checking every array the path resolves to. */
function walk(
  container: unknown,
  segments: readonly PathSegment[],
  spec: SetArrayPath,
  where: string,
): SetArrayViolation | null {
  if (typeof container !== 'object' || container === null) return null;
  const segment = segments[0];
  if (segment === undefined) return null;
  const value = (container as AnyObject)[segment.field];
  const rest = segments.slice(1);

  if (segment.each) {
    // `field[]`: iterate the array and continue the path inside each element.
    if (!Array.isArray(value)) return null;
    for (let i = 0; i < value.length; i++) {
      const violation = walk(value[i], rest, spec, `${where}.${segment.field}[${i}]`);
      if (violation) return violation;
    }
    return null;
  }

  if (rest.length > 0) {
    return walk(value, rest, spec, `${where}.${segment.field}`);
  }

  if (!Array.isArray(value)) return null;
  return checkArray(value, spec, `${where}.${segment.field}`);
}

/**
 * Check every registered `set` path that is rooted at this record's own type.
 * Records of an unrecognizable type are skipped (the schema layer reports those).
 */
export function checkRecordSetArrays(record: AnyRecord): SetArrayViolation | null {
  const info = recordTypeOf(record);
  if (!info) return null;
  const id = (record as AnyObject)[info.idField];
  const where = typeof id === 'string' ? id : info.type;
  for (const spec of pathsForRecordType(info.type)) {
    const violation = walk(record, spec.segments, spec, where);
    if (violation) return violation;
  }
  return null;
}

/** Check every registered `set` path across a list of records. */
export function checkRecordsSetArrays(records: readonly AnyRecord[]): SetArrayViolation | null {
  for (const record of records) {
    const violation = checkRecordSetArrays(record);
    if (violation) return violation;
  }
  return null;
}

/**
 * Check every registered `set` path on a whole snapshot: the top-level record collections
 * (`snapshot.*`), the singleton Project's own arrays (`project.*`), and every record-rooted
 * path on every record in the graph.
 */
export function checkSnapshotSetArrays(snapshot: Snapshot): SetArrayViolation | null {
  const asObject = snapshot as unknown as AnyObject;
  for (const spec of setArrayPaths()) {
    if (spec.root === 'snapshot') {
      const violation = walk(asObject, spec.segments, spec, 'snapshot');
      if (violation) return violation;
    } else if (spec.root === 'project') {
      const violation = walk(asObject['project'], spec.segments, spec, 'project');
      if (violation) return violation;
    }
  }
  // Record-rooted paths, including the Project singleton's record-level paths.
  const records: AnyRecord[] = [];
  if (snapshot.project) records.push(snapshot.project);
  for (const info of RECORD_TYPES) {
    if (!info.collection) continue;
    const arr = asObject[info.collection as CollectionKey];
    if (Array.isArray(arr)) records.push(...(arr as AnyRecord[]));
  }
  return checkRecordsSetArrays(records);
}

// ---------------------------------------------------------------------------
// Producer helper (explicitly separate and non-authoritative — SPEC §10)
// ---------------------------------------------------------------------------

function canonicalizeAt(container: unknown, segments: readonly PathSegment[], spec: SetArrayPath): void {
  if (typeof container !== 'object' || container === null) return;
  const segment = segments[0];
  if (segment === undefined) return;
  const obj = container as AnyObject;
  const value = obj[segment.field];
  const rest = segments.slice(1);

  if (segment.each) {
    if (!Array.isArray(value)) return;
    for (const element of value) canonicalizeAt(element, rest, spec);
    return;
  }
  if (rest.length > 0) {
    canonicalizeAt(value, rest, spec);
    return;
  }
  if (!Array.isArray(value)) return;

  const keyed = value.map((item) => ({ item, key: sortKeyOf(item, spec.key) }));
  if (keyed.some((k) => k.key === null)) return; // malformed: leave for the schema layer
  keyed.sort((a, b) => compareByCodeUnit(a.key as string, b.key as string));
  const out: unknown[] = [];
  let previous: string | null = null;
  for (const { item, key } of keyed) {
    if (previous !== null && key === previous) continue;
    out.push(item);
    previous = key;
  }
  obj[segment.field] = out;
}

/**
 * Sort and de-duplicate every registered `set` array on a record, in place, and return it.
 *
 * This is the **producer-side** helper the reference implementation uses when it builds a
 * record itself. It is explicitly non-authoritative: externally supplied records are
 * rejected when non-canonical, never quietly normalized, and the result of this helper is
 * still revalidated on the way into the ledger.
 */
export function canonicalizeSetArraysInRecord<T extends AnyRecord>(record: T): T {
  const info = recordTypeOf(record);
  if (!info) return record;
  for (const spec of pathsForRecordType(info.type)) {
    canonicalizeAt(record, spec.segments, spec);
  }
  return record;
}

// ---------------------------------------------------------------------------
// Portable-path guard (SPEC §5.2 / §6)
// ---------------------------------------------------------------------------

/**
 * Keys whose value is a filesystem location. A portable file may carry a repository-
 * relative path or a portable locator under these, never a machine-local absolute one.
 */
const PATH_BEARING_KEYS = new Set(['root', 'path', 'locator', 'roots', 'paths']);

function isAbsolutePathLike(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\');
}

/**
 * Find an absolute path under a path-bearing key.
 *
 * SPEC §5.2: "Absolute paths live only in the machine-local binding, never in a
 * committable file." Enforcing this only on the write path would leave a hand-written or
 * hand-merged `state.json` free to carry one and be accepted by `Store.open`, so the rule
 * belongs in validation as well — the write guard and the validator call this same code.
 */
export function findAbsolutePath(value: unknown, trail = ''): { at: string; value: string } | null {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const found = findAbsolutePath(value[i], `${trail}[${i}]`);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  for (const [key, child] of Object.entries(value as AnyObject)) {
    const here = trail ? `${trail}.${key}` : key;
    if (typeof child === 'string' && PATH_BEARING_KEYS.has(key) && isAbsolutePathLike(child)) {
      return { at: here, value: child };
    }
    const found = findAbsolutePath(child, here);
    if (found) return found;
  }
  return null;
}
