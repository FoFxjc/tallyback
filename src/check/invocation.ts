/**
 * CheckInvocation (`chk_`) production.
 *
 * The **invoker** (Check), not the checker, produces the CheckInvocation
 * **before** executing the checker. This is what makes an invocation observable
 * even when the checker crashes before producing output. The invoker submits
 * it through `Store.beginCheck`, which records it, advances the ledger, and
 * returns the frozen evaluation input.
 *
 * Expected `../contract/index.js` exports used here (verify when landed):
 *   - type `CheckInvocation`
 */

import { newId, now } from './ids.js';
import type { CheckInvocation } from '../contract/index.js';
import type { Actor, CheckerRef, EvaluatedSnapshot, Subject, Timestamp } from './types.js';
import { DEFAULT_INVOKER } from './types.js';

export interface ProduceInvocationInput {
  /** The subject being checked (`{ kind: 'claim', id: 'clm_…' }` in v1). */
  subject: Subject;
  /** The checker referenced by stable name + version (never a shell string). */
  checker: CheckerRef;
  /** The frozen snapshot the invocation evaluates. */
  evaluated_snapshot: EvaluatedSnapshot;
  invoked_by?: Actor;
  /** `null` records that no time is known (the legacy-provenance variant). */
  invoked_at?: Timestamp;
}

/** Produce a canonical `chk_` CheckInvocation record. */
export function produceCheckInvocation(input: ProduceInvocationInput): CheckInvocation {
  if (!input.subject.id) {
    throw new Error('check_error: CheckInvocation requires a subject id');
  }
  if (!input.checker.id || !input.checker.version) {
    throw new Error('check_error: CheckInvocation requires a checker id and version');
  }
  return {
    check_invocation_id: newId('chk_'),
    subject: input.subject,
    checker: input.checker,
    evaluated_snapshot: input.evaluated_snapshot,
    invoked_by: input.invoked_by ?? DEFAULT_INVOKER,
    invoked_at: input.invoked_at !== undefined ? input.invoked_at : now(),
  };
}
