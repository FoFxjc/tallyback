/**
 * Reconciliation (`rec_`) construction.
 *
 * A Reconciliation is a first-class, immutable record pairing a named
 * **predicate** with a **check outcome** (`confirmed` | `mismatch` |
 * `unresolved`) against a captured observed context. An `unresolved` outcome
 * always carries a structured `reason` and is **never collapsed into
 * `mismatch`**.
 *
 * Check may emit a Reconciliation without emitting a Verdict.
 */

import { newId, now } from './ids.js';
import { gitObjectType, type ObservedContext, type ResolutionCode } from './resolution.js';
import type {
  Reconciliation,
  ReconciliationCheck,
  ReconciliationCheckOutcome,
} from '../contract/index.js';
import type { Actor, Method } from './types.js';

export type ReconciliationOutcome = ReconciliationCheckOutcome;

/** Stable, cross-checker predicate names. */
export const PREDICATES = {
  GIT_OBJECT_EXISTS: 'git.object.exists',
  GIT_OBJECT_TYPE: 'git.object.type',
  GIT_HEAD_MATCHES: 'git.head.matches',
  GIT_TREE_MATCHES: 'git.tree.matches',
  GIT_WORKTREE_CLEAN: 'git.working_tree.clean',
  EVIDENCE_KIND_SUPPORTED: 'evidence.kind.supported',
} as const;

export type PredicateName = (typeof PREDICATES)[keyof typeof PREDICATES];

export const DEFAULT_CHECKED_BY: Actor = { kind: 'tool', id: 'tallyback-check' };

/** Build a single check entry, enforcing the `unresolved` reason invariant. */
export function check(
  predicate: string,
  outcome: ReconciliationCheckOutcome,
  observed?: Record<string, unknown>,
  reason?: string,
): ReconciliationCheck {
  if (outcome === 'unresolved' && (reason === undefined || reason.trim() === '')) {
    throw new Error('check_error: an unresolved reconciliation check requires a structured reason');
  }
  return {
    predicate,
    outcome,
    ...(observed !== undefined ? { observed } : {}),
    ...(reason !== undefined ? { reason } : {}),
  };
}

/** Convenience: an `unresolved` check with a structured resolution-code reason. */
export function unresolvedCheck(
  predicate: string,
  reason: ResolutionCode | string,
  observed?: Record<string, unknown>,
): ReconciliationCheck {
  return check(predicate, 'unresolved', observed, reason);
}

export interface BuildReconciliationInput {
  evidence_id: string;
  method: Method;
  observed_context: ObservedContext;
  checks: ReconciliationCheck[];
  limitations?: string[];
  supersedes?: string;
  checked_by?: Actor;
  checked_at?: string | null;
}

/** Build an immutable `rec_` Reconciliation record. */
export function buildReconciliation(input: BuildReconciliationInput): Reconciliation {
  if (input.checks.length === 0) {
    throw new Error('check_error: a Reconciliation requires at least one check');
  }
  return {
    reconciliation_id: newId('rec_'),
    evidence_id: input.evidence_id,
    checked_by: input.checked_by ?? DEFAULT_CHECKED_BY,
    checked_at: input.checked_at !== undefined ? input.checked_at : now(),
    method: input.method,
    observed_context: input.observed_context,
    checks: input.checks,
    limitations: input.limitations ?? [],
    ...(input.supersedes ? { supersedes: input.supersedes } : {}),
  };
}

/** Reconcile `git.object.exists` for an evidence object id against a worktree. */
export async function reconcileGitObject(root: string, oid: string): Promise<ReconciliationCheck> {
  const type = await gitObjectType(root, oid);
  if (!type.ok) {
    if (type.code === 'environment_unavailable') {
      return unresolvedCheck(PREDICATES.GIT_OBJECT_EXISTS, 'environment_unavailable', {
        object_id: oid,
      });
    }
    return check(PREDICATES.GIT_OBJECT_EXISTS, 'mismatch', { object_id: oid, exists: false });
  }
  return check(PREDICATES.GIT_OBJECT_EXISTS, 'confirmed', {
    object_id: oid,
    object_type: type.stdout,
  });
}
