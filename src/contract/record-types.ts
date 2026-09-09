/**
 * The canonical record-type registry, shared by every contract-layer consumer.
 *
 * Extracted from the validator so that reference validation, canonical set-array
 * enforcement, and any future contract-layer check all resolve a record's type through
 * exactly one table. A record's own ID field is not sufficient to identify its type —
 * reference fields share those names (`task_id` on a Declaration, `attempt_id` on a
 * Claim) — so each entry carries a `signature` of required fields whose joint presence
 * is unique to that type, and the list is ordered so a more specific type is tried
 * before a type whose id fields are a subset of it (`attempt` before `workspace`).
 */

import { prefixOf } from './ids.js';
import type { AnyRecord, Snapshot } from './types.js';

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
  /** Canonical record-type name, matching `contract/canonicalization.json`. */
  type: string;
  /** ID prefix including the trailing underscore. */
  prefix: string;
  /** The record's own ID field name. */
  idField: string;
  /** Snapshot collection for array-valued record types; undefined for the singleton Project. */
  collection?: CollectionKey;
  supersessionCapable: boolean;
  /** Required fields whose joint presence uniquely identifies this record type. */
  signature: string[];
}

/** The 18 record types, in `recordTypeOf` disambiguation order. */
export const RECORD_TYPES: readonly RecordTypeInfo[] = [
  { type: 'project', prefix: 'prj_', idField: 'project_id', supersessionCapable: false, signature: ['repositories'] },
  { type: 'repository', prefix: 'repo_', idField: 'repository_id', collection: 'repositories', supersessionCapable: false, signature: ['alias'] },
  { type: 'attempt', prefix: 'att_', idField: 'attempt_id', collection: 'attempts', supersessionCapable: false, signature: ['executor'] },
  { type: 'workspace', prefix: 'wsp_', idField: 'workspace_id', collection: 'workspaces', supersessionCapable: false, signature: ['workspace_id'] },
  { type: 'topic', prefix: 'top_', idField: 'topic_id', collection: 'topics', supersessionCapable: false, signature: ['name'] },
  { type: 'task', prefix: 'tsk_', idField: 'task_id', collection: 'tasks', supersessionCapable: false, signature: ['title'] },
  { type: 'declaration', prefix: 'dcl_', idField: 'declaration_id', collection: 'declarations', supersessionCapable: true, signature: ['objective'] },
  { type: 'attempt_end', prefix: 'ate_', idField: 'attempt_end_id', collection: 'attempt_ends', supersessionCapable: true, signature: ['outcome'] },
  { type: 'claim', prefix: 'clm_', idField: 'claim_id', collection: 'claims', supersessionCapable: false, signature: ['statement'] },
  { type: 'evidence', prefix: 'evi_', idField: 'evidence_id', collection: 'evidence', supersessionCapable: false, signature: ['kind'] },
  { type: 'reconciliation', prefix: 'rec_', idField: 'reconciliation_id', collection: 'reconciliations', supersessionCapable: true, signature: ['method'] },
  { type: 'check_invocation', prefix: 'chk_', idField: 'check_invocation_id', collection: 'check_invocations', supersessionCapable: false, signature: ['checker'] },
  { type: 'check_result', prefix: 'ckr_', idField: 'check_result_id', collection: 'check_results', supersessionCapable: false, signature: ['outcome'] },
  { type: 'verdict', prefix: 'ver_', idField: 'verdict_id', collection: 'verdicts', supersessionCapable: false, signature: ['conclusion'] },
  { type: 'settlement', prefix: 'set_', idField: 'settlement_id', collection: 'settlements', supersessionCapable: true, signature: ['decision'] },
  { type: 'blocker', prefix: 'blk_', idField: 'blocker_id', collection: 'blockers', supersessionCapable: false, signature: ['description'] },
  { type: 'blocker_resolution', prefix: 'brs_', idField: 'blocker_resolution_id', collection: 'blocker_resolutions', supersessionCapable: true, signature: ['disposition'] },
  { type: 'decision', prefix: 'dec_', idField: 'decision_id', collection: 'decisions', supersessionCapable: true, signature: ['role'] },
] as const;

export const RECORD_TYPE_BY_NAME: ReadonlyMap<string, RecordTypeInfo> = new Map(
  RECORD_TYPES.map((info) => [info.type, info]),
);

type AnyObject = Record<string, unknown>;

/** Infer the record type from its own ID field plus its unique signature of required fields. */
export function recordTypeOf(record: AnyRecord): RecordTypeInfo | null {
  if (typeof record !== 'object' || record === null) return null;
  const any = record as AnyObject;
  for (const info of RECORD_TYPES) {
    const value = any[info.idField];
    if (typeof value !== 'string' || prefixOf(value) !== info.prefix) continue;
    if (info.signature.every((f) => f in any)) return info;
  }
  return null;
}

/** The canonical ID of a record, or null when the record is unrecognizable. */
export function recordIdOf(record: AnyRecord): string | null {
  const info = recordTypeOf(record);
  if (!info) return null;
  const value = (record as AnyObject)[info.idField];
  return typeof value === 'string' ? value : null;
}

/** All records in a snapshot (the Project singleton first, then collections in order). */
export function allSnapshotRecords(snapshot: Snapshot): AnyRecord[] {
  const out: AnyRecord[] = [];
  if (snapshot.project) out.push(snapshot.project);
  for (const info of RECORD_TYPES) {
    if (!info.collection) continue;
    const arr = (snapshot as unknown as AnyObject)[info.collection];
    if (Array.isArray(arr)) out.push(...(arr as AnyRecord[]));
  }
  return out;
}
