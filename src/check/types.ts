/**
 * Shared sub-types for the Check boundary.
 *
 * Re-exports the canonical sub-shapes from `contract` (single source of truth)
 * and adds the Check-specific aliases the flow uses. `Subject` and `CheckerRef`
 * are ergonomic aliases: v1 checks Claims (so a subject is a `ClaimSubject`) and
 * a checker is referenced by `CheckerMeta`.
 */

import type { Actor, CheckerMeta, ClaimSubject } from '../contract/index.js';

export type {
  Actor,
  CheckerMeta,
  ClaimSubject,
  Diagnostic,
  Digest,
  EvaluatedSnapshot,
  Method,
  Timestamp,
} from '../contract/index.js';

/** A typed subject reference; v1 checks Claims, so this is a claim subject. */
export type Subject = ClaimSubject;

/** Software identity/version metadata (checker reference). */
export type CheckerRef = CheckerMeta;

export const DEFAULT_INVOKER: Actor = { kind: 'tool', id: 'tallyback-check' };
