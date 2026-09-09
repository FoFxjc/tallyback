/**
 * Supersession graph application.
 *
 * A supersession-capable record may point at the record it corrects/replaces via
 * `supersedes`. Only `dcl_`, `set_`, `ate_`, `rec_`, `brs_`, and `dec_` may carry the
 * field (SPEC §5, TB-SUP-004). The graph must be acyclic, same-type, and same-subject;
 * those legality checks are enforced by `validate_snapshot` / `validate_append` in the
 * contract layer. This module DERIVES the effective (current, non-superseded) records so
 * projections and consumers never treat a superseded body as current.
 */

import type {
  AnyRecord,
  AttemptEnd,
  BlockerResolution,
  Decision,
  Reconciliation,
  Settlement,
  TaskDeclaration,
} from '../contract/index.js';
import { LEDGER_RECORD_TYPES, recordId, recordTypeOf } from './snapshot.js';

/** ID prefixes whose records may carry `supersedes`. */
export const SUPERSESSION_CAPABLE_PREFIXES: ReadonlySet<string> = new Set(
  LEDGER_RECORD_TYPES.filter((info) => info.supersessionCapable).map((info) => info.prefix),
);

export function isSupersessionCapable(record: AnyRecord): boolean {
  return recordTypeOf(record).supersessionCapable;
}

/** Read the `supersedes` target id, or undefined when absent/blank. */
export function getSupersedes(record: AnyRecord): string | undefined {
  const value = (record as Record<string, unknown>).supersedes;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * The logical lineage subject of a supersession-capable record. Two records may form a
 * supersession link only when they share this key (same type is checked separately).
 *
 * This must agree exactly with the contract validator's TB-SUP-002 check
 * (`supersession.same_subject`): the helper is exported for hosts deciding whether two
 * records *can* form a lineage, so a looser key here would let a host build supersessions
 * the Store then rejects, and a stricter one would make it refuse links the Store accepts.
 */
export function supersessionSubject(record: AnyRecord): string | undefined {
  const info = recordTypeOf(record);
  if (!info.supersessionCapable) return undefined;
  switch (info.prefix) {
    case 'dcl_':
      return `task:${(record as TaskDeclaration).task_id}`;
    case 'set_': {
      // A Settlement settles one Attempt, so its lineage is the (task, attempt) pair —
      // a settlement of a *different* attempt of the same task is a separate decision,
      // not a correction of this one. This matches the validator's TB-SUP-002 check.
      const settlement = record as Settlement;
      return `task:${settlement.task_id}:attempt:${settlement.attempt_id}`;
    }
    case 'ate_':
      return `attempt:${(record as AttemptEnd).attempt_id}`;
    case 'rec_':
      return `evidence:${(record as Reconciliation).evidence_id}`;
    case 'brs_':
      return `blocker:${(record as BlockerResolution).blocker_id}`;
    case 'dec_': {
      const decision = record as Decision;
      return `decision:${decision.subject.kind}:${decision.subject.id}:${decision.role}`;
    }
    default:
      return undefined;
  }
}

/** IDs referenced by any `supersedes` field in the given (same-type) record set. */
export function supersededIds(records: readonly AnyRecord[]): Set<string> {
  const targets = new Set<string>();
  for (const record of records) {
    const target = getSupersedes(record);
    if (target) targets.add(target);
  }
  return targets;
}

/**
 * Records that are not superseded by any other record in the set. Operates within a
 * single record type (supersession is same-type); call per collection.
 */
export function effectiveRecords<T extends AnyRecord>(records: readonly T[]): T[] {
  const superseded = supersededIds(records);
  return records.filter((record) => !superseded.has(recordId(record)));
}

/** The effective (non-superseded) record ids for a same-type record set. */
export function effectiveIds(records: readonly AnyRecord[]): Set<string> {
  return new Set(effectiveRecords(records).map((record) => recordId(record)));
}

/**
 * Detect a supersession cycle within a same-type record set (defensive; the contract
 * validator is authoritative). Returns the cycle as an ordered list of IDs, or null.
 */
export function findSupersessionCycle(records: readonly AnyRecord[]): string[] | null {
  const byId = new Map<string, AnyRecord>(records.map((record) => [recordId(record), record]));
  const visiting = new Set<string>();
  const done = new Set<string>();
  const stack: string[] = [];

  const visit = (id: string): string[] | null => {
    if (visiting.has(id)) {
      const idx = stack.indexOf(id);
      return idx >= 0 ? [...stack.slice(idx), id] : [id];
    }
    if (done.has(id)) return null;
    const record = byId.get(id);
    if (!record) return null;
    visiting.add(id);
    stack.push(id);
    const target = getSupersedes(record);
    if (target) {
      const cycle = visit(target);
      if (cycle) return cycle;
    }
    stack.pop();
    visiting.delete(id);
    done.add(id);
    return null;
  };

  for (const record of records) {
    const cycle = visit(recordId(record));
    if (cycle) return cycle;
  }
  return null;
}
