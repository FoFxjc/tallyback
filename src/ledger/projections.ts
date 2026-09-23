/**
 * Derived projections (never authoritative statuses).
 *
 * `blocked`, `verified`, `stale`, `ready_to_land`, `settled`, and `dispatched` are all
 * derived from the canonical record graph (SPEC §7.2). They are discardable, tagged with
 * the revision and policy under which they were computed, and may be rebuilt at any time.
 * Consumers must not write them independently, and the ledger never persists them into
 * the canonical section of `state.json` (only into the discardable `projections` slot).
 */

import type {
  Projections,
  Settlement,
  Snapshot,
  TaskDeclaration,
  Verdict,
} from '../contract/index.js';
import { DEFAULT_PROJECTION_POLICY } from './snapshot.js';
import { effectiveRecords } from './supersession.js';

export interface ProjectionValues {
  /** task_id -> unresolved blocker_ids (a Blocker with no effective BlockerResolution). */
  blocked: Record<string, string[]>;
  /** task_id -> applicable verdict_ids (via the verdict's claim subject), of ANY conclusion. */
  verified: Record<string, string[]>;
  /**
   * task_id -> applicable verdict_ids that individually clear `isPositiveVerification` —
   * the subset of `verified` that is actually positive verification, not merely "a Verdict
   * exists." `status.verified` (View) reads this, never the bare presence check on
   * `verified` above; existence of a Verdict is not positive verification (see
   * `isPositiveVerification`'s docstring).
   */
  verified_positive: Record<string, string[]>;
  /** task_id -> effective (non-superseded) settlement_ids. */
  settled: Record<string, string[]>;
  /** task_ids with at least one Attempt. */
  dispatched: string[];
  /** task_ids with an effective `land` settlement. */
  ready_to_land: string[];
  /** task_ids considered stale under the supplied time/policy window (optional). */
  stale?: string[];
}

export interface StalePolicy {
  now: string;
  staleAfterMs: number;
}

function pushInto(map: Record<string, string[]>, key: string, value: string): void {
  const list = map[key] ?? (map[key] = []);
  if (!list.includes(value)) list.push(value);
}

/** Map claim_id -> task_id for the snapshot's Claims. */
function claimToTask(snapshot: Snapshot): Map<string, string> {
  const map = new Map<string, string>();
  for (const claim of snapshot.claims) map.set(claim.claim_id, claim.task_id);
  return map;
}

/**
 * The ONE shared predicate for "this Verdict is positive verification" — used by both
 * `isLandSettlementVerificationReady` (Land / `ready_to_land`) and View's `status.verified`
 * so the two surfaces cannot silently drift into different rules for the same question.
 *
 * Fails closed (`false`) for anything that has not been positively established:
 *
 * - no Verdict at all;
 * - `finality !== 'final'` (SPEC §5.10: "Absence must never mean final" — a `preliminary`
 *   Verdict is explicitly not done judging yet);
 * - `conclusion !== 'supported'` — `partially_supported`, `unsupported`, and
 *   `contradicted` are all real, distinct conclusions (SPEC §5.10's table), never
 *   collapsed into a pass merely because they are not a hard rejection.
 *   `partially_supported` is deliberately excluded: the frozen contract does not
 *   anywhere define it as sufficient for readiness, only that it means "material
 *   portions ... unresolved or unsatisfied."
 * - `confidence.level === 'low'` — SPEC §5.10 states this explicitly: "`supported` with
 *   low confidence remains weak and should not silently become settlement-ready." Medium
 *   and high are accepted as-is; the contract defines no further threshold to invent.
 * - the Verdict leaves a `required: true` Criterion of its own cited declaration
 *   unevaluated (`scope.unevaluated_criteria`) — a required criterion that was never
 *   checked is not "supported," whatever the overall `conclusion` says.
 *
 * An explicit `verification_exception` (SPEC §5.11) is a SEPARATE authorization path, not
 * a second way to satisfy this predicate — see `isLandSettlementVerificationReady`. It
 * authorizes `accept`/`land`; it never makes this function return `true`, and it never
 * retroactively makes an underlying Verdict positive.
 */
export function isPositiveVerification(
  verdict: Verdict | undefined,
  declaration?: TaskDeclaration,
): boolean {
  if (!verdict) return false;
  if (verdict.finality !== 'final') return false;
  if (verdict.conclusion !== 'supported') return false;
  if (verdict.confidence.level === 'low') return false;
  if (declaration) {
    const requiredCriteriaIds = new Set(
      declaration.criteria.filter((c) => c.required).map((c) => c.criterion_id),
    );
    for (const id of verdict.scope.unevaluated_criteria) {
      if (requiredCriteriaIds.has(id)) return false;
    }
  }
  return true;
}

/**
 * Whether a single `land` Settlement's own basis clears the verification bar (SPEC §5.10 /
 * §5.11) — positive verification per `isPositiveVerification`, OR an explicit
 * `verification_exception` when there is no Verdict at all. Exported so a host layer
 * classifying individual land candidates (Land, `src/land/report.ts`) applies the
 * identical per-settlement rule this projection uses to decide `ready_to_land` at the task
 * level — a task can have more than one effective `land` Settlement (distinct attempts),
 * and only the ones that individually clear this bar are actually ready, not every
 * settlement of a task that has at least one that is.
 *
 * The exception path is a distinct `authorization_override`, never synthesized proof: a
 * Settlement whose `basis.verdict_id` cites a real but negative/preliminary Verdict does
 * NOT fall back to the exception path just because one is absent from that citation —
 * TB-LC-005 already requires `verdict_id` XOR `verification_exception`, so a Settlement
 * that cited a verdict and got a negative answer is not "ready" merely because Store
 * accepted the record as a valid decision. Only a Settlement that explicitly invoked the
 * override field is treated as authorized-without-proof.
 */
export function isLandSettlementVerificationReady(
  settlement: Settlement,
  verdictById: ReadonlyMap<string, Verdict>,
  declarationById?: ReadonlyMap<string, TaskDeclaration>,
): boolean {
  const verdictId = settlement.basis.verdict_id;
  if (verdictId !== null && verdictId !== undefined) {
    const verdict = verdictById.get(verdictId);
    const declaration = verdict ? declarationById?.get(verdict.declaration_id) : undefined;
    return isPositiveVerification(verdict, declaration);
  }
  return (
    settlement.verification_exception !== null && settlement.verification_exception !== undefined
  );
}

export function computeProjectionValues(snapshot: Snapshot, stale?: StalePolicy): ProjectionValues {
  const blocked: Record<string, string[]> = {};
  const verified: Record<string, string[]> = {};
  const verified_positive: Record<string, string[]> = {};
  const settled: Record<string, string[]> = {};
  const dispatched: string[] = [];
  const ready_to_land: string[] = [];

  // Blocked: a Blocker without an effective BlockerResolution.
  const effectiveResolutions = effectiveRecords(snapshot.blocker_resolutions);
  const resolvedBlockers = new Set(effectiveResolutions.map((r) => r.blocker_id));
  for (const blocker of snapshot.blockers) {
    if (resolvedBlockers.has(blocker.blocker_id)) continue;
    pushInto(blocked, blocker.task_id, blocker.blocker_id);
  }

  // Declaration lookup for isPositiveVerification's "unevaluated required criterion"
  // check: a Verdict cites the exact declaration_id its scope was evaluated against, which
  // may since have been superseded — look it up by that exact id, not the current head.
  const declarationById = new Map(snapshot.declarations.map((d) => [d.declaration_id, d]));

  // Verified: each Verdict judges a Claim; map the verdict to the claim's task. `verified`
  // tracks every applicable Verdict regardless of conclusion (SPEC §7.2's literal text);
  // `verified_positive` is the strict subset that also clears `isPositiveVerification` —
  // existence of a Verdict is not the same claim as positive verification.
  const claimTask = claimToTask(snapshot);
  for (const verdict of snapshot.verdicts) {
    if (verdict.subject.kind !== 'claim') continue;
    const taskId = claimTask.get(verdict.subject.id);
    if (!taskId) continue;
    pushInto(verified, taskId, verdict.verdict_id);
    if (isPositiveVerification(verdict, declarationById.get(verdict.declaration_id))) {
      pushInto(verified_positive, taskId, verdict.verdict_id);
    }
  }

  // Settled + ready_to_land: effective (non-superseded) settlements.
  //
  // SPEC §7.2: "ready_to_land — an effective Settlement combined with current Git and
  // verification facts." The "current Git" half is a live check this pure, I/O-free
  // function over a `Snapshot` cannot perform — that belongs to a host/View layer with
  // filesystem access (SPEC §16), never fabricated here. The "verification facts" half
  // IS derivable from the graph, though, and a bare `decision === 'land'` ignores it
  // entirely: SPEC §5.10 requires every Verdict to carry `finality` precisely so a
  // consumer can tell a settled judgment from one that is still preliminary — "Absence
  // must never mean final," which only matters if something downstream actually checks
  // it. `ready_to_land` is exactly that downstream consumer, so a `land` Settlement whose
  // basis cites a still-`preliminary` Verdict is a graph-level fact this projection must
  // not silently ignore, whatever a live Git check might separately determine. A
  // Settlement landing on an explicit `verification_exception` carries no Verdict to
  // check finality on; the exception itself is the complete override signal (SPEC §5.11).
  const verdictById = new Map(snapshot.verdicts.map((v) => [v.verdict_id, v]));
  for (const settlement of effectiveRecords(snapshot.settlements)) {
    pushInto(settled, settlement.task_id, settlement.settlement_id);
    if (settlement.decision !== 'land') continue;
    if (
      isLandSettlementVerificationReady(settlement, verdictById, declarationById) &&
      !ready_to_land.includes(settlement.task_id)
    ) {
      ready_to_land.push(settlement.task_id);
    }
  }

  // Dispatched: any Attempt references the task.
  for (const attempt of snapshot.attempts) {
    if (!dispatched.includes(attempt.task_id)) dispatched.push(attempt.task_id);
  }

  const values: ProjectionValues = {
    blocked,
    verified,
    verified_positive,
    settled,
    dispatched,
    ready_to_land,
  };
  if (stale) values.stale = staleTaskIds(snapshot, stale);
  return values;
}

/** Build the discardable `projections` section for a snapshot. */
export function computeProjections(
  snapshot: Snapshot,
  policyId: string = DEFAULT_PROJECTION_POLICY,
  stale?: StalePolicy,
): Projections {
  return {
    computed_from_revision: snapshot.revision,
    policy_id: policyId,
    values: computeProjectionValues(snapshot, stale) as unknown as Record<string, unknown>,
  };
}

/** Attach (or replace) the discardable projections section on a snapshot copy. */
export function withProjections(snapshot: Snapshot, section: Projections): Snapshot {
  return { ...snapshot, projections: section };
}

// ---------------------------------------------------------------------------
// Stale (time- and policy-dependent, read-only)
// ---------------------------------------------------------------------------

/**
 * The later of two ISO-8601 timestamps, compared as **instants**.
 *
 * Lexicographic order is not chronological once offsets are in play:
 * `2026-01-01T01:00:00+02:00` sorts after `2026-01-01T00:30:00Z` but happens 90 minutes
 * earlier. Records arrive from many hosts and adapters, so the comparison has to parse.
 * A timestamp that cannot be parsed falls back to string order rather than being dropped —
 * it is still data, just not orderable by instant.
 */
function maxIso(a: string | undefined, b: string | null): string {
  if (!a) return b ?? '';
  if (!b) return a;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return a < b ? b : a;
  return ta < tb ? b : a;
}

/**
 * The latest observable activity timestamp for a task across records that reference it.
 * Read-only; never mutates anything to "stale" (SPEC §7.2, TB-NOP-004).
 */
export function lastActivityAt(snapshot: Snapshot, taskId: string): string | undefined {
  let latest: string | undefined;

  for (const decl of snapshot.declarations) {
    if (decl.task_id === taskId) latest = maxIso(latest, decl.declared_at);
  }
  for (const attempt of snapshot.attempts) {
    if (attempt.task_id === taskId) latest = maxIso(latest, attempt.dispatched_at);
  }
  const attemptTasks = new Map(snapshot.attempts.map((a) => [a.attempt_id, a.task_id]));
  for (const end of snapshot.attempt_ends) {
    if (attemptTasks.get(end.attempt_id) === taskId) latest = maxIso(latest, end.ended_at);
  }
  for (const claim of snapshot.claims) {
    if (claim.task_id === taskId) latest = maxIso(latest, claim.claimed_at);
  }
  for (const settlement of snapshot.settlements) {
    if (settlement.task_id === taskId) latest = maxIso(latest, settlement.decided_at);
  }
  for (const blocker of snapshot.blockers) {
    if (blocker.task_id === taskId) latest = maxIso(latest, blocker.raised_at);
  }
  const blockerTasks = new Map(snapshot.blockers.map((b) => [b.blocker_id, b.task_id]));
  for (const resolution of snapshot.blocker_resolutions) {
    if (blockerTasks.get(resolution.blocker_id) === taskId) {
      latest = maxIso(latest, resolution.resolved_at);
    }
  }
  for (const decision of snapshot.decisions) {
    if (decision.subject.kind === 'task' && decision.subject.id === taskId) {
      latest = maxIso(latest, decision.decided_at);
    }
  }

  return latest;
}

export function isTaskStale(snapshot: Snapshot, taskId: string, policy: StalePolicy): boolean {
  const latest = lastActivityAt(snapshot, taskId);
  if (!latest) return true;
  const age = new Date(policy.now).getTime() - new Date(latest).getTime();
  return age > policy.staleAfterMs;
}

/**
 * `lastActivityAt` for every task in one pass over the snapshot's record arrays, instead
 * of `staleTaskIds` rescanning all records once per task (O(tasks * total_records)) plus
 * rebuilding the `attemptTasks`/`blockerTasks` maps on every call.
 */
function lastActivityAtAll(snapshot: Snapshot): Map<string, string> {
  const latest = new Map<string, string>();
  const bump = (taskId: string | undefined, ts: string | null | undefined): void => {
    if (taskId === undefined) return;
    latest.set(taskId, maxIso(latest.get(taskId), ts ?? null));
  };

  for (const decl of snapshot.declarations) bump(decl.task_id, decl.declared_at);
  for (const attempt of snapshot.attempts) bump(attempt.task_id, attempt.dispatched_at);
  const attemptTasks = new Map(snapshot.attempts.map((a) => [a.attempt_id, a.task_id]));
  for (const end of snapshot.attempt_ends) bump(attemptTasks.get(end.attempt_id), end.ended_at);
  for (const claim of snapshot.claims) bump(claim.task_id, claim.claimed_at);
  for (const settlement of snapshot.settlements) bump(settlement.task_id, settlement.decided_at);
  for (const blocker of snapshot.blockers) bump(blocker.task_id, blocker.raised_at);
  const blockerTasks = new Map(snapshot.blockers.map((b) => [b.blocker_id, b.task_id]));
  for (const resolution of snapshot.blocker_resolutions) {
    bump(blockerTasks.get(resolution.blocker_id), resolution.resolved_at);
  }
  for (const decision of snapshot.decisions) {
    if (decision.subject.kind === 'task') bump(decision.subject.id, decision.decided_at);
  }

  return latest;
}

/** Task ids considered stale under the given time/policy window. */
export function staleTaskIds(snapshot: Snapshot, policy: StalePolicy): string[] {
  const activity = lastActivityAtAll(snapshot);
  const now = new Date(policy.now).getTime();
  const out: string[] = [];
  for (const task of snapshot.tasks) {
    const latest = activity.get(task.task_id);
    const stale = !latest || now - new Date(latest).getTime() > policy.staleAfterMs;
    if (stale) out.push(task.task_id);
  }
  return out;
}

/** Convenience: the Claim id a Verdict judges (subject.kind === 'claim'). */
export function verdictClaimId(subject: { kind: string; id: string }): string | undefined {
  return subject.kind === 'claim' ? subject.id : undefined;
}
