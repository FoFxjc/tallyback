/**
 * Supersession lineages and their heads.
 *
 * A supersession-capable record belongs to a **lineage**, identified by the record type
 * plus the logical subject the record is about. Within one lineage, a record is a *head*
 * when nothing supersedes it. SPEC §5.4: "Concurrent unsuperseded heads are an explicit
 * declaration conflict requiring reconciliation; Store must not choose one by timestamp."
 *
 * This module is the single definition of both notions. The validator uses it to reject a
 * forked lineage (TB-SUP-005), the ledger's `supersessionSubject()` helper mirrors it so a
 * host and the Store agree on what "same lineage" means, and the reconciliation tool uses
 * it to enumerate exactly what a human has to decide.
 *
 * **A fork cannot be repaired by appending.** `supersedes` is single-valued, so a new
 * record can only supersede one head and always leaves the other live. Collapsing a fork
 * is therefore a file-level edit performed *before* the divergent histories are merged —
 * see `ledger/reconcile.ts`.
 */

import { compareByCodeUnit } from './jcs.js';
import { recordTypeOf } from './record-types.js';
import type { AnyRecord } from './types.js';

type AnyObject = Record<string, unknown>;

function str(record: unknown, name: string): string | null {
  if (typeof record !== 'object' || record === null) return null;
  const value = (record as AnyObject)[name];
  return typeof value === 'string' ? value : null;
}

/**
 * The logical lineage subject of a supersession-capable record, or null when the record is
 * not supersession-capable.
 *
 * Two records may form a supersession link only when this key matches (their type is
 * checked separately). The keys are deliberately specific: a Settlement settles one
 * Attempt, and a Decision's `role` distinguishes the `next_action` lineage from the
 * `execution_choice` one, because SPEC §5.13 derives the displayed next action from the
 * effective non-superseded `next_action` Decision.
 */
export function supersessionSubjectKey(record: AnyRecord): string | null {
  const info = recordTypeOf(record);
  if (info?.supersessionCapable !== true) return null;
  switch (info.type) {
    case 'declaration':
      return `task:${String(str(record, 'task_id'))}`;
    case 'settlement':
      return `task:${String(str(record, 'task_id'))}:attempt:${String(str(record, 'attempt_id'))}`;
    case 'attempt_end':
      return `attempt:${String(str(record, 'attempt_id'))}`;
    case 'reconciliation':
      return `evidence:${String(str(record, 'evidence_id'))}`;
    case 'blocker_resolution':
      return `blocker:${String(str(record, 'blocker_id'))}`;
    case 'decision': {
      const subject = (record as AnyObject)['subject'];
      return `decision:${String(str(subject, 'kind'))}:${String(str(subject, 'id'))}:${String(str(record, 'role'))}`;
    }
    default:
      return null;
  }
}

/** A lineage key that is unique across record types. */
export function lineageKey(record: AnyRecord): string | null {
  const info = recordTypeOf(record);
  const subject = supersessionSubjectKey(record);
  if (!info || subject === null) return null;
  return `${info.type}|${subject}`;
}

export interface SupersessionLineage {
  /** `<record_type>|<subject key>`, unique across the graph. */
  key: string;
  /** Canonical record-type name (`declaration`, `settlement`, …). */
  type: string;
  /** The logical subject the lineage is about. */
  subject: string;
  /** Every record id in this lineage, sorted. */
  members: string[];
  /** The unsuperseded record ids, sorted. More than one is a conflict. */
  heads: string[];
}

/** Group every supersession-capable record into its lineage and find that lineage's heads. */
export function supersessionLineages(records: readonly AnyRecord[]): SupersessionLineage[] {
  const superseded = new Set<string>();
  for (const rec of records) {
    if (recordTypeOf(rec)?.supersessionCapable !== true) continue;
    const target = str(rec, 'supersedes');
    if (target !== null) superseded.add(target);
  }

  const byKey = new Map<string, SupersessionLineage>();
  for (const rec of records) {
    const info = recordTypeOf(rec);
    if (info?.supersessionCapable !== true) continue;
    const id = str(rec, info.idField);
    const subject = supersessionSubjectKey(rec);
    if (id === null || subject === null) continue;
    const key = `${info.type}|${subject}`;
    const lineage =
      byKey.get(key) ?? { key, type: info.type, subject, members: [], heads: [] };
    lineage.members.push(id);
    if (!superseded.has(id)) lineage.heads.push(id);
    byKey.set(key, lineage);
  }

  const sort = (xs: string[]): string[] => xs.sort(compareByCodeUnit);
  return [...byKey.values()].map((l) => ({
    ...l,
    members: sort(l.members),
    heads: sort(l.heads),
  }));
}

/** The lineages that have more than one unsuperseded head — the ones needing a decision. */
export function findSupersessionConflicts(
  records: readonly AnyRecord[],
): SupersessionLineage[] {
  return supersessionLineages(records).filter((l) => l.heads.length > 1);
}
