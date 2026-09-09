/**
 * Collapsing a forked supersession lineage — the pre-merge repair.
 *
 * A fork (two records in one lineage that nothing supersedes) can only arise out-of-band:
 * merging two divergent `state.json` files, or a hand edit. No write path through the
 * Store can create one.
 *
 * **It also cannot be repaired by appending.** `supersedes` is single-valued, so a new
 * record supersedes exactly one head and always leaves the other live — appending never
 * reduces the head count below two. Collapsing a fork therefore means rewriting the
 * `supersedes` edge of a record that already exists, which is a file-level operation
 * belonging to the moment the histories are merged (merge / ready-to-push / branch
 * wrap-up), not a ledger mutation.
 *
 * **Strategy: chain.** Given heads `[…losers, keep]`, the losers are linked into a chain
 * and `keep` is attached to its end, so the lineage becomes a single line ending at the
 * record the human chose:
 *
 *     before   D1 ← A        after (--keep A)   D1 ← B ← A
 *              D1 ← B                           head = A
 *
 * Every record keeps its id, and everything anchored to a losing head — Attempts, Claims,
 * Verdicts — keeps resolving. The cost is that one existing record's bytes change; that is
 * acceptable precisely here, because a losing head has only ever existed on the branch
 * being merged and never entered the shared lineage. The alternative (dropping it and
 * re-authoring) would cascade through every record that referenced it.
 *
 * **Nothing is chosen automatically.** SPEC §5.4: "Store must not choose one by
 * timestamp." Every conflicted lineage needs an explicit `keep`, and a run that cannot
 * name one for each fork does nothing at all.
 */

import { lineageKey, validate_snapshot } from '../contract/index.js';
import type { AnyRecord, Snapshot } from '../contract/index.js';
import { findSupersessionConflicts, type SupersessionLineage } from '../contract/index.js';
import { allRecords, cloneSnapshot, recordId } from './snapshot.js';

/** Stable `mutation.*` / `invariant.*` outcome codes for a reconciliation run. */
export const RECONCILE_CODES = {
  NO_CONFLICTS: 'mutation.reconcile_nothing_to_do',
  UNDECIDED: 'mutation.reconcile_decision_required',
  UNKNOWN_HEAD: 'invariant.reference_unresolved',
  STILL_INVALID: 'mutation.reconcile_validation_failed',
} as const;

export interface ReconcileRewrite {
  /** The lineage this rewrite belongs to. */
  lineage: string;
  /** The record whose `supersedes` edge changed. */
  record_id: string;
  from: string | null;
  to: string;
}

export interface ReconcilePlan {
  conflicts: SupersessionLineage[];
  rewrites: ReconcileRewrite[];
  /** The resulting snapshot. Not written by `planReconciliation`. */
  snapshot: Snapshot;
}

export type ReconcileOutcome =
  | { ok: true; plan: ReconcilePlan }
  | { ok: false; code: string; message: string; conflicts: SupersessionLineage[] };

function supersedesOf(record: AnyRecord): string | null {
  const value = (record as Record<string, unknown>)['supersedes'];
  return typeof value === 'string' ? value : null;
}

/**
 * Plan the collapse of every forked lineage, given one chosen head per fork.
 *
 * Pure: it returns the rewritten snapshot and never touches the filesystem. The caller
 * decides whether to write it.
 */
export function planReconciliation(snapshot: Snapshot, keep: readonly string[]): ReconcileOutcome {
  const conflicts = findSupersessionConflicts(allRecords(snapshot));
  if (conflicts.length === 0) {
    return {
      ok: false,
      code: RECONCILE_CODES.NO_CONFLICTS,
      message: 'this ledger has no forked lineages; there is nothing to reconcile',
      conflicts,
    };
  }

  // Map each requested head to the lineage it belongs to, refusing ids that are not
  // actually a head of a forked lineage — a typo must not silently do nothing.
  const chosen = new Map<string, string>(); // lineage key -> kept head id
  for (const id of keep) {
    const lineage = conflicts.find((l) => l.heads.includes(id));
    if (!lineage) {
      return {
        ok: false,
        code: RECONCILE_CODES.UNKNOWN_HEAD,
        message: `${id} is not one of the concurrent heads of any forked lineage in this ledger`,
        conflicts,
      };
    }
    const already = chosen.get(lineage.key);
    if (already !== undefined && already !== id) {
      return {
        ok: false,
        code: RECONCILE_CODES.UNDECIDED,
        message: `lineage ${lineage.key} was given two different heads to keep (${already}, ${id})`,
        conflicts,
      };
    }
    chosen.set(lineage.key, id);
  }

  const undecided = conflicts.filter((l) => !chosen.has(l.key));
  if (undecided.length > 0) {
    return {
      ok: false,
      code: RECONCILE_CODES.UNDECIDED,
      message:
        `${undecided.length} forked lineage(s) still need a decision: ` +
        undecided.map((l) => `${l.key} → keep one of [${l.heads.join(', ')}]`).join('; ') +
        '. Reconciliation never picks a head for you (SPEC §5.4).',
      conflicts,
    };
  }

  // Apply the chain rewrite to a copy.
  const next = cloneSnapshot(snapshot);
  const byId = new Map<string, AnyRecord>();
  for (const rec of allRecords(next)) {
    const key = lineageKey(rec);
    if (key === null) continue;
    byId.set(recordId(rec), rec);
  }

  const rewrites: ReconcileRewrite[] = [];
  for (const lineage of conflicts) {
    const keepId = chosen.get(lineage.key) as string;
    // Losers in canonical id order — deterministic, and explicitly not chronological.
    const losers = lineage.heads.filter((id) => id !== keepId);
    const chain = [...losers, keepId];
    for (let i = 1; i < chain.length; i++) {
      const id = chain[i] as string;
      const target = chain[i - 1] as string;
      const record = byId.get(id);
      if (!record) continue;
      const from = supersedesOf(record);
      (record as Record<string, unknown>)['supersedes'] = target;
      rewrites.push({ lineage: lineage.key, record_id: id, from, to: target });
    }
  }

  // The repaired snapshot is a new revision: any holder of the old one must re-read.
  next.revision = snapshot.revision + 1;
  next.included_through = next.revision;

  const validation = validate_snapshot(next);
  if (!validation.ok) {
    return {
      ok: false,
      code: RECONCILE_CODES.STILL_INVALID,
      message:
        `the reconciled snapshot is still invalid (${validation.code}: ${validation.message ?? 'no detail'}); ` +
        'nothing was written',
      conflicts,
    };
  }

  return { ok: true, plan: { conflicts, rewrites, snapshot: next } };
}

// ---------------------------------------------------------------------------
// Applying a plan
// ---------------------------------------------------------------------------

/**
 * Reconcile a ledger's forked lineages on disk.
 *
 * Reads the portable snapshot **without** validating it into existence (that is the whole
 * point — the file is currently invalid), plans the collapse, and writes the result under
 * the store's single-writer lock only after the repaired snapshot validates. A dry run
 * plans and reports without writing.
 */
export async function reconcileLedger(options: {
  projectRoot: string;
  keep: readonly string[];
  /** Plan and report only; write nothing. Default false. */
  dryRun?: boolean;
}): Promise<ReconcileOutcome & { wrote?: boolean }> {
  const { diagnoseLedger } = await import('./diagnose.js');
  const { acquireLock, LockError } = await import('./lock.js');
  const { storeLockPath, ledgerRoot, writeSnapshot } = await import('./snapshot.js');

  // A dry run never writes, so it never needs the lock: plan against a best-effort read
  // and report it.
  if (options.dryRun) {
    const diagnosis = await diagnoseLedger(options.projectRoot);
    if (!diagnosis.snapshot) {
      return {
        ok: false,
        code: 'schema.unknown_property',
        message: `${options.projectRoot} has no readable state.json to reconcile`,
        conflicts: [],
      };
    }
    const blocking = diagnosis.problems.filter((p) => !p.reconcilable);
    if (blocking.length > 0) {
      return {
        ok: false,
        code: blocking[0]!.code,
        message:
          `this ledger has ${blocking.length} problem(s) reconciliation cannot fix; ` +
          `fix them first: ${blocking.map((p) => `${p.code} (${p.layer})`).join(', ')}`,
        conflicts: diagnosis.conflicts,
      };
    }
    const planned = planReconciliation(diagnosis.snapshot, options.keep);
    return planned.ok ? { ...planned, wrote: false } : planned;
  }

  // The write path plans and writes under ONE lock acquisition, from ONE read. Planning
  // outside the lock and only comparing conflict *keys* on the way back in — the earlier
  // approach — has a real gap: an out-of-band change that lands between the outside-lock
  // plan and the inside-lock recheck can leave the conflicted lineage's key set completely
  // unchanged (nothing about the fork itself was touched) while still changing OTHER
  // content, and reconciliation replaces the whole file — so that unrelated content would
  // be silently discarded even though the "still forked the same way" check passed.
  // Re-planning from the snapshot read *under* the lock removes the gap instead of
  // narrowing it: whatever is on disk at the moment of the read is exactly what the
  // rewrite is applied to and exactly what gets written back.
  const root = ledgerRoot(options.projectRoot);
  let handle;
  try {
    handle = await acquireLock(storeLockPath(root), {});
  } catch (err) {
    if (err instanceof LockError) {
      return { ok: false, code: err.code, message: err.message, conflicts: [] };
    }
    throw err;
  }
  try {
    const diagnosis = await diagnoseLedger(options.projectRoot);
    if (!diagnosis.snapshot) {
      return {
        ok: false,
        code: 'schema.unknown_property',
        message: `${options.projectRoot} has no readable state.json to reconcile`,
        conflicts: [],
      };
    }
    const blocking = diagnosis.problems.filter((p) => !p.reconcilable);
    if (blocking.length > 0) {
      return {
        ok: false,
        code: blocking[0]!.code,
        message:
          `this ledger has ${blocking.length} problem(s) reconciliation cannot fix; ` +
          `fix them first: ${blocking.map((p) => `${p.code} (${p.layer})`).join(', ')}`,
        conflicts: diagnosis.conflicts,
      };
    }
    const planned = planReconciliation(diagnosis.snapshot, options.keep);
    if (!planned.ok) return planned;
    await writeSnapshot(root, planned.plan.snapshot);
    return { ...planned, wrote: true };
  } finally {
    await handle.release();
  }
}
