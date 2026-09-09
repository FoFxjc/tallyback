/**
 * View: the compact per-task tallyback projection (`docs/view-design.md`).
 *
 * README's ecosystem table and SPEC §6 both describe the same shape twice — "current
 * state, claims, evidence references, blockers, next action, verification status, and
 * integration readiness" — and View v1 is exactly that projection, assembled from a
 * `Snapshot` with no I/O of its own. Unlike Land (`src/land/report.ts`), View needs no
 * injected resolver: every fact it reports already lives in the ledger, so this module is
 * pure top to bottom.
 *
 * `next_action` names which documented loop command (declare/dispatch/observe/verify/
 * settle) has not yet been called for a task, purely from record presence (design §4) —
 * never a judgment about whether the work is good.
 */

import type {
  Actor,
  Confidence,
  Criterion,
  EvidenceKind,
  Finality,
  SettlementDecision,
  Snapshot,
  Task,
  Timestamp,
  VerdictConclusion,
} from '../contract/index.js';
import { computeProjectionValues, type ProjectionValues, type StalePolicy } from '../ledger/projections.js';
import { effectiveRecords } from '../ledger/supersession.js';

/** SPEC §7.2 / design §3: the default staleness window, absent an explicit override. */
export const DEFAULT_STALE_AFTER_MS = 48 * 60 * 60 * 1000;

export interface TaskViewDeclaration {
  declaration_id: string;
  objective: string;
  criteria: Criterion[];
}

export interface TaskViewAttempt {
  attempt_id: string;
  executor: Actor;
  workspace_id: string;
  repository_id: string;
  dispatched_at: Timestamp;
  ended: boolean;
}

export interface TaskViewClaim {
  claim_id: string;
  statement: string;
  evidence_ids: string[];
  claimed_by: Actor;
  claimed_at: Timestamp;
}

/** Evidence pointer only — never `payload` (design §2/§6: no evidence payload inclusion). */
export interface TaskViewEvidence {
  evidence_id: string;
  kind: EvidenceKind;
  submitted_by: Actor;
  submitted_at: Timestamp;
  note?: string;
}

export interface TaskViewBlocker {
  blocker_id: string;
  description: string;
  raised_by: Actor;
  raised_at: Timestamp;
}

export interface TaskViewVerdict {
  verdict_id: string;
  conclusion: VerdictConclusion;
  finality: Finality;
  confidence: Confidence;
}

export interface TaskViewSettlement {
  settlement_id: string;
  decision: SettlementDecision;
  verification_exception?: string | null;
  rationale: string;
}

export interface TaskViewStatus {
  blocked: boolean;
  verified: boolean;
  settled: boolean;
  dispatched: boolean;
  ready_to_land: boolean;
  stale: boolean;
}

export interface TaskView {
  task_id: string;
  title: string;
  topic_id: string;
  declaration: TaskViewDeclaration | null;
  attempts: TaskViewAttempt[];
  claims: TaskViewClaim[];
  evidence: TaskViewEvidence[];
  blockers: TaskViewBlocker[];
  verification: TaskViewVerdict[];
  settlement: TaskViewSettlement | null;
  status: TaskViewStatus;
  next_action: string;
}

export interface ViewSummary {
  task_count: number;
  blocked: number;
  ready_to_land: number;
  stale: number;
  settled: number;
}

/**
 * Whether `a` is strictly later than `b` as an instant. Unparsable/absent timestamps fall
 * back to string order, mirroring `projections.ts`'s `maxIso` — still comparable, just not
 * by instant.
 */
function isAfter(a: Timestamp, b: Timestamp): boolean {
  if (!a) return false;
  if (!b) return true;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return a > b;
  return ta > tb;
}

/**
 * The "latest" item by timestamp, tie-breaking on a caller-supplied id (lexical order) when
 * timestamps tie or are absent. This is advisory next-action derivation, not a
 * correctness-critical judgment (design §4 steps 4-6), so an arbitrary-but-deterministic
 * tiebreak is enough.
 */
function pickLatest<T>(items: readonly T[], at: (item: T) => Timestamp, id: (item: T) => string): T | undefined {
  let best: T | undefined;
  for (const item of items) {
    if (!best) {
      best = item;
      continue;
    }
    if (isAfter(at(item), at(best)) || (!isAfter(at(best), at(item)) && id(item) > id(best))) {
      best = item;
    }
  }
  return best;
}

function deriveNextAction(snapshot: Snapshot, task: Task, projections: ProjectionValues): string {
  if ((projections.blocked[task.task_id]?.length ?? 0) > 0) return 'resolve blocker';

  // Design §4 lists "effective Settlement exists" (step 8) after the verify-chain steps
  // (5-6), but a Settlement can rest on `verification_exception` rather than a Verdict
  // (SPEC §5.11) and never require a CheckInvocation at all — exactly what a `land`
  // settlement via verification_exception does (`src/land/report.ts`'s own fixtures). A
  // settled task is a terminal resting state regardless of whether the check chain ran, so
  // that check has to short-circuit ahead of steps 4-7, not sit behind them.
  const effectiveSettlements = effectiveRecords(snapshot.settlements).filter((s) => s.task_id === task.task_id);
  if (effectiveSettlements.length > 0) {
    const latestSettlement = pickLatest(
      effectiveSettlements,
      (s) => s.decided_at,
      (s) => s.settlement_id,
    )!;
    return `settled: ${latestSettlement.decision}`;
  }

  const declaration = effectiveRecords(snapshot.declarations).find((d) => d.task_id === task.task_id);
  if (!declaration) return 'declare';

  const attempts = snapshot.attempts.filter((a) => a.task_id === task.task_id);
  if (attempts.length === 0) return 'dispatch';
  const latestAttempt = pickLatest(attempts, (a) => a.dispatched_at, (a) => a.attempt_id)!;

  const claimsForAttempt = snapshot.claims.filter((c) => c.attempt_id === latestAttempt.attempt_id);
  if (claimsForAttempt.length === 0) return 'observe (claim)';
  const latestClaim = pickLatest(claimsForAttempt, (c) => c.claimed_at, (c) => c.claim_id)!;

  const invocationsForClaim = snapshot.check_invocations.filter(
    (ci) => ci.subject.kind === 'claim' && ci.subject.id === latestClaim.claim_id,
  );
  if (invocationsForClaim.length === 0) return 'verify (begin-check)';
  const latestInvocation = pickLatest(
    invocationsForClaim,
    (ci) => ci.invoked_at,
    (ci) => ci.check_invocation_id,
  )!;

  const resultsForInvocation = snapshot.check_results.filter(
    (cr) => cr.check_invocation_id === latestInvocation.check_invocation_id,
  );
  if (resultsForInvocation.length === 0) return 'verify (record-check)';

  return 'settle';
}

function buildTaskView(snapshot: Snapshot, task: Task, projections: ProjectionValues): TaskView {
  const declaration = effectiveRecords(snapshot.declarations).find((d) => d.task_id === task.task_id);

  const attempts = snapshot.attempts.filter((a) => a.task_id === task.task_id);
  const attemptIds = new Set(attempts.map((a) => a.attempt_id));
  const endedAttemptIds = new Set(
    snapshot.attempt_ends.filter((e) => attemptIds.has(e.attempt_id)).map((e) => e.attempt_id),
  );

  const claims = snapshot.claims.filter((c) => c.task_id === task.task_id);

  const evidenceIds = new Set<string>();
  for (const claim of claims) for (const id of claim.evidence_ids) evidenceIds.add(id);
  const evidence = snapshot.evidence.filter((e) => evidenceIds.has(e.evidence_id));

  const blockerIds = new Set(projections.blocked[task.task_id] ?? []);
  const blockers = snapshot.blockers.filter((b) => blockerIds.has(b.blocker_id));

  const verdictIds = new Set(projections.verified[task.task_id] ?? []);
  const verdicts = snapshot.verdicts.filter((v) => verdictIds.has(v.verdict_id));

  const effectiveSettlements = effectiveRecords(snapshot.settlements).filter((s) => s.task_id === task.task_id);
  const settlement = pickLatest(effectiveSettlements, (s) => s.decided_at, (s) => s.settlement_id);

  const status: TaskViewStatus = {
    blocked: (projections.blocked[task.task_id]?.length ?? 0) > 0,
    verified: (projections.verified[task.task_id]?.length ?? 0) > 0,
    settled: (projections.settled[task.task_id]?.length ?? 0) > 0,
    dispatched: projections.dispatched.includes(task.task_id),
    ready_to_land: projections.ready_to_land.includes(task.task_id),
    stale: projections.stale?.includes(task.task_id) ?? false,
  };

  return {
    task_id: task.task_id,
    title: task.title,
    topic_id: task.topic_id,
    declaration: declaration
      ? { declaration_id: declaration.declaration_id, objective: declaration.objective, criteria: declaration.criteria }
      : null,
    attempts: attempts.map((a) => ({
      attempt_id: a.attempt_id,
      executor: a.executor,
      workspace_id: a.workspace_id,
      repository_id: a.repository_id,
      dispatched_at: a.dispatched_at,
      ended: endedAttemptIds.has(a.attempt_id),
    })),
    claims: claims.map((c) => ({
      claim_id: c.claim_id,
      statement: c.statement,
      evidence_ids: c.evidence_ids,
      claimed_by: c.claimed_by,
      claimed_at: c.claimed_at,
    })),
    evidence: evidence.map((e) => ({
      evidence_id: e.evidence_id,
      kind: e.kind,
      submitted_by: e.submitted_by,
      submitted_at: e.submitted_at,
      ...(e.note !== undefined ? { note: e.note } : {}),
    })),
    blockers: blockers.map((b) => ({
      blocker_id: b.blocker_id,
      description: b.description,
      raised_by: b.raised_by,
      raised_at: b.raised_at,
    })),
    verification: verdicts.map((v) => ({
      verdict_id: v.verdict_id,
      conclusion: v.conclusion,
      finality: v.finality,
      confidence: v.confidence,
    })),
    settlement: settlement
      ? {
          settlement_id: settlement.settlement_id,
          decision: settlement.decision,
          verification_exception: settlement.verification_exception ?? null,
          rationale: settlement.rationale,
        }
      : null,
    status,
    next_action: deriveNextAction(snapshot, task, projections),
  };
}

/**
 * Build one `TaskView` per target task (design §3/§5). `taskIds` omitted covers every task
 * in the snapshot; given, narrows to exactly those (backing the CLI's `--task-id`).
 * `policy` drives the `stale` status field via `computeProjectionValues`; omitted, `stale`
 * reads `false` for every task rather than guessing a time reference.
 */
export function buildTaskViews(snapshot: Snapshot, taskIds?: string[], policy?: StalePolicy): TaskView[] {
  const wanted = taskIds ? new Set(taskIds) : null;
  const tasks = wanted ? snapshot.tasks.filter((t) => wanted.has(t.task_id)) : snapshot.tasks;
  const projections = computeProjectionValues(snapshot, policy);
  return tasks.map((task) => buildTaskView(snapshot, task, projections));
}

/** A literal count rollup over `views[].status` — not a second source of truth (design §5). */
export function summarizeTaskViews(views: TaskView[]): ViewSummary {
  return {
    task_count: views.length,
    blocked: views.filter((v) => v.status.blocked).length,
    ready_to_land: views.filter((v) => v.status.ready_to_land).length,
    stale: views.filter((v) => v.status.stale).length,
    settled: views.filter((v) => v.status.settled).length,
  };
}
