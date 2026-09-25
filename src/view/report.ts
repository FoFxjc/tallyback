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
import {
  computeProjectionValues,
  isPositiveVerification,
  type ProjectionValues,
  type StalePolicy,
} from '../ledger/projections.js';
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
  /**
   * The runnable form of `next_action`: one command with this task's ids filled in and
   * `<placeholders>` (listed in `requires`) for what only the caller can supply. Advice,
   * never a transition. Null when no single command follows.
   */
  next_command: LedgerNextAction | null;
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
function pickLatest<T>(
  items: readonly T[],
  at: (item: T) => Timestamp,
  id: (item: T) => string,
): T | undefined {
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
  //
  // Only Settlements of the *latest* Attempt count here. `retry` settles an Attempt but
  // leaves the Task available (TB-LC-003): once a newer Attempt is dispatched, guidance
  // follows that Attempt instead of echoing the earlier retry forever.
  const taskAttempts = snapshot.attempts.filter((a) => a.task_id === task.task_id);
  const newestAttempt = pickLatest(
    taskAttempts,
    (a) => a.dispatched_at,
    (a) => a.attempt_id,
  );
  const effectiveSettlements = effectiveRecords(snapshot.settlements).filter(
    (s) =>
      s.task_id === task.task_id && (!newestAttempt || s.attempt_id === newestAttempt.attempt_id),
  );
  if (effectiveSettlements.length > 0) {
    const latestSettlement = pickLatest(
      effectiveSettlements,
      (s) => s.decided_at,
      (s) => s.settlement_id,
    )!;
    return `settled: ${latestSettlement.decision}`;
  }

  const declaration = effectiveRecords(snapshot.declarations).find(
    (d) => d.task_id === task.task_id,
  );
  if (!declaration) return 'declare';

  const attempts = snapshot.attempts.filter((a) => a.task_id === task.task_id);
  if (attempts.length === 0) return 'dispatch';
  const latestAttempt = pickLatest(
    attempts,
    (a) => a.dispatched_at,
    (a) => a.attempt_id,
  )!;

  const claimsForAttempt = snapshot.claims.filter((c) => c.attempt_id === latestAttempt.attempt_id);
  if (claimsForAttempt.length === 0) return 'observe (claim)';
  const latestClaim = pickLatest(
    claimsForAttempt,
    (c) => c.claimed_at,
    (c) => c.claim_id,
  )!;

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

/**
 * The runnable form of a task's `next_action` (see `TaskView.next_command`). Every id is
 * one the ledger already holds; anything else is a `<placeholder>` named in `requires`.
 * Mirrors `deriveNextAction`'s branches and never decides anything on the caller's behalf
 * — in particular it never pre-selects a settlement decision or an assessment.
 */
function deriveNextCommand(
  snapshot: Snapshot,
  task: Task,
  projections: ProjectionValues,
  nextAction: string,
  status: TaskViewStatus,
): LedgerNextAction | null {
  const t = task.task_id;
  if (nextAction === 'resolve blocker') {
    const blocker = (projections.blocked[t] ?? [])[0]!;
    return {
      command: `tallyback resolve --blocker-id ${blocker} --disposition <resolved|withdrawn> --explanation <text>`,
      reason: 'An unresolved Blocker is recorded on this task.',
      requires: ['--disposition', '--explanation'],
    };
  }
  if (nextAction.startsWith('settled: ') && nextAction !== 'settled: retry') {
    if (!status.ready_to_land) return null;
    return {
      command: 'tallyback land',
      reason:
        'ready_to_land here is the ledger half only (a land Settlement on positive ' +
        'verification); `tallyback land` checks the Git half: branch, commits ahead, conflicts.',
      requires: [],
    };
  }
  const declaration = effectiveRecords(snapshot.declarations).find((d) => d.task_id === t);
  if (nextAction === 'declare' || !declaration) {
    return {
      command: `tallyback declare --task-id ${t} --objective <objective> --criterion <code:statement>`,
      reason: 'Declare what done means; repeat --criterion once per acceptance criterion.',
      requires: ['--objective', '--criterion'],
    };
  }
  const attempts = snapshot.attempts.filter((a) => a.task_id === t);
  // `retry` is not terminal (TB-LC-003): the next step is a new Attempt — after the retried
  // one is ended, because an open Attempt keeps its Workspace (TB-LC-004).
  if (nextAction === 'settled: retry') {
    const retried = pickLatest(
      attempts,
      (a) => a.dispatched_at,
      (a) => a.attempt_id,
    )!;
    if (!snapshot.attempt_ends.some((e) => e.attempt_id === retried.attempt_id)) {
      return {
        command: `tallyback end --attempt-id ${retried.attempt_id} --outcome <returned|failed|cancelled> --reason <text>`,
        reason:
          'The Attempt was settled `retry` but is still open; end it so a new Attempt can use the Workspace.',
        requires: ['--outcome', '--reason'],
      };
    }
  }
  if (nextAction === 'dispatch' || nextAction === 'settled: retry') {
    const repositories = snapshot.repositories;
    const repo = repositories.length === 1 ? repositories[0]!.repository_id : '<repo_…>';
    const workspaces = snapshot.workspaces.filter(
      (w) => repositories.length !== 1 || w.repository_id === repo,
    );
    if (workspaces.length === 0) {
      return {
        command: `tallyback workspace --repository-id ${repo} --branch <branch>`,
        reason: 'Dispatch needs a Workspace; register the checkout/branch the work happens on.',
        requires: repositories.length === 1 ? ['--branch'] : ['--repository-id', '--branch'],
      };
    }
    const ws = workspaces.length === 1 ? workspaces[0]!.workspace_id : '<wsp_…>';
    return {
      command:
        `tallyback dispatch --task-id ${t} --declaration-id ${declaration.declaration_id} ` +
        `--repository-id ${repo} --workspace-id ${ws} --executor <kind:id>`,
      reason:
        nextAction === 'settled: retry'
          ? 'The last Attempt was settled `retry`; the Task stays open. Start a new Attempt.'
          : 'Start an Attempt; --executor names who does the work.',
      requires: [
        ...(repositories.length === 1 ? [] : ['--repository-id']),
        ...(workspaces.length === 1 ? [] : ['--workspace-id']),
        '--executor',
      ],
    };
  }
  const latestAttempt = pickLatest(
    attempts,
    (a) => a.dispatched_at,
    (a) => a.attempt_id,
  )!;
  if (nextAction === 'observe (claim)') {
    return {
      command:
        `tallyback claim --task-id ${t} --attempt-id ${latestAttempt.attempt_id} ` +
        `--declaration-id ${latestAttempt.declaration_id} --statement <statement> --evidence <evi_…>`,
      reason:
        'Record what the Attempt claims. Record Evidence first (`tallyback evidence --help`) ' +
        'and cite it with --evidence (repeatable).',
      requires: ['--statement', '--evidence'],
    };
  }
  const claims = snapshot.claims.filter((c) => c.attempt_id === latestAttempt.attempt_id);
  const latestClaim = pickLatest(
    claims,
    (c) => c.claimed_at,
    (c) => c.claim_id,
  );
  if (nextAction.startsWith('verify') && latestClaim) {
    const claimDeclaration = snapshot.declarations.find(
      (d) => d.declaration_id === latestClaim.declaration_id,
    );
    const codes = (claimDeclaration?.criteria ?? []).map((c) => c.code);
    return {
      command:
        `tallyback verdict --claim ${latestClaim.claim_id} ` +
        codes.map((c) => `--criterion ${c}=<assessment> `).join('') +
        '--confidence <low|medium|high> --rationale <text>',
      reason:
        'Judge the claim criterion by criterion (assessment: supported|partially_supported|' +
        'unsupported|contradicted); --finding/--finding-basis say what supports each one.',
      requires: [...codes.map((c) => `--criterion ${c}`), '--confidence', '--rationale'],
    };
  }
  if (nextAction === 'settle') {
    const positive = snapshot.verdicts
      .filter((v) => latestClaim && v.subject.id === latestClaim.claim_id)
      .filter((v) =>
        isPositiveVerification(
          v,
          snapshot.declarations.find((d) => d.declaration_id === v.declaration_id),
        ),
      )
      .map((v) => v.verdict_id)
      .sort();
    const verdict = positive.at(-1);
    return {
      command:
        `tallyback settle --task-id ${t} --attempt-id ${latestAttempt.attempt_id} ` +
        `--decision <accept|retry|abandon|land> ${verdict ? `--verdict-id ${verdict} ` : ''}--rationale <text>`,
      reason: verdict
        ? 'Record the decision explicitly. land authorises integration; accept does not.'
        : 'No positive Verdict exists for the latest claim: accept/land need --verdict-id or an ' +
          'explicit --verification-exception; retry/abandon cite --attempt-end-id and/or --blocker.',
      requires: ['--decision', '--rationale'],
    };
  }
  return null;
}

function buildTaskView(snapshot: Snapshot, task: Task, projections: ProjectionValues): TaskView {
  const declaration = effectiveRecords(snapshot.declarations).find(
    (d) => d.task_id === task.task_id,
  );

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

  const effectiveSettlements = effectiveRecords(snapshot.settlements).filter(
    (s) => s.task_id === task.task_id,
  );
  const settlement = pickLatest(
    effectiveSettlements,
    (s) => s.decided_at,
    (s) => s.settlement_id,
  );

  const nextAction = deriveNextAction(snapshot, task, projections);
  const status: TaskViewStatus = {
    blocked: (projections.blocked[task.task_id]?.length ?? 0) > 0,
    // `verified` means positive verification (isPositiveVerification), never merely
    // "a Verdict was recorded" — a preliminary/unsupported/contradicted/low-confidence
    // Verdict must not read as `verified: true`. `projections.verified` (all applicable
    // Verdicts regardless of conclusion) still backs `TaskView.verification` above, so a
    // consumer can always see the full judgment history even when none of it is positive.
    verified: (projections.verified_positive[task.task_id]?.length ?? 0) > 0,
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
      ? {
          declaration_id: declaration.declaration_id,
          objective: declaration.objective,
          criteria: declaration.criteria,
        }
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
    next_action: nextAction,
    next_command: deriveNextCommand(snapshot, task, projections, nextAction, status),
  };
}

/**
 * Build one `TaskView` per target task (design §3/§5). `taskIds` omitted covers every task
 * in the snapshot; given, narrows to exactly those (backing the CLI's `--task-id`).
 * `policy` drives the `stale` status field via `computeProjectionValues`; omitted, `stale`
 * reads `false` for every task rather than guessing a time reference.
 *
 * View is a pure-Snapshot projection — it does not implement a Task lifecycle policy
 * (SPEC §5.11: Settlement is not a Task status). Effective Settlements are surfaced
 * via `next_action: "settled: <decision>"` and `status.settled`, exactly as v1 did.
 * Active-vs-historical filtering is an open retention-design question and is NOT
 * applied here.
 */
export function buildTaskViews(
  snapshot: Snapshot,
  taskIds?: string[],
  policy?: StalePolicy,
): TaskView[] {
  const wanted = taskIds ? new Set(taskIds) : null;
  const tasks = wanted ? snapshot.tasks.filter((t) => wanted.has(t.task_id)) : snapshot.tasks;
  const projections = computeProjectionValues(snapshot, policy);
  return tasks.map((task) => buildTaskView(snapshot, task, projections));
}

/**
 * Ledger-level guidance for an initialized ledger that has no Task yet, when the next
 * missing accountability record is mechanically identifiable. Advice, never a transition:
 * nothing here writes, and a value the caller must choose is named in `requires` as a
 * `<placeholder>` in `command` rather than invented.
 */
export interface LedgerNextAction {
  /** Exactly one command. `<…>` placeholders are values only the caller can supply. */
  command: string;
  reason: string;
  /** The flags whose `<…>` placeholder values the caller must supply. */
  requires: string[];
}

/**
 * The next missing record before any per-task `next_action` can exist: a Topic, then a
 * Task. Null once the ledger has a Task — from there each TaskView's own `next_action`
 * (declare, dispatch, …) is the guidance.
 */
export function deriveLedgerNextAction(snapshot: Snapshot): LedgerNextAction | null {
  if (snapshot.tasks.length > 0) return null;
  if (snapshot.topics.length === 0) {
    return {
      command: 'tallyback topic --name <name>',
      reason: 'No Topic exists yet; every Task belongs to a Topic.',
      requires: ['--name'],
    };
  }
  if (snapshot.topics.length === 1) {
    return {
      command: `tallyback task --topic-id ${snapshot.topics[0]!.topic_id} --title <title>`,
      reason: 'No Task exists yet; create one to declare and track delegated work against.',
      requires: ['--title'],
    };
  }
  return {
    command: 'tallyback task --topic-id <topic-id> --title <title>',
    reason:
      `No Task exists yet, and ${snapshot.topics.length} Topics exist; choose one ` +
      '(`tallyback list --what topics`).',
    requires: ['--topic-id', '--title'],
  };
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
