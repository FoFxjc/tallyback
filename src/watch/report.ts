/**
 * Watch: on-demand detection of open work whose ledger state and live Git/worktree
 * reality have drifted apart (`docs/watch-design.md`).
 *
 * `docs/watch-design.md` (§1) frames this as the host-layer half of README's "Optional
 * external detection of stale, lost, or inconsistent execution": `stale` is already fully
 * derivable from the ledger alone (`computeProjectionValues(...).stale`), so Watch only
 * adds the two checks that require live I/O — `lost` (the bound workspace no longer
 * resolves) and `inconsistent` (a Claim exists but the branch shows no commits since
 * dispatch). Both are new work exactly the way Land's Git half is: a pure `Snapshot`
 * function cannot perform live I/O, so the resolver is dependency-injected (mirroring
 * `src/land/report.ts`'s `GitResolver`) and `src/watch/git.ts` supplies the real,
 * Git-backed implementation.
 *
 * Read-only and advisory only (design §2): no Blocker is raised, nothing is written to the
 * ledger. `stale` is surfaced from `computeProjectionValues`, never recomputed here.
 */

import type { Attempt, Snapshot, Timestamp, Workspace } from '../contract/index.js';
import { computeProjectionValues, lastActivityAt, type StalePolicy } from '../ledger/projections.js';
import { effectiveRecords } from '../ledger/supersession.js';

/** One Watch observation kind (design §4). */
export type WatchFindingKind = 'stale' | 'lost' | 'inconsistent' | 'unresolved';

export interface WatchFinding {
  task_id: string;
  attempt_id: string;
  kind: WatchFindingKind;
  /** Present on `lost`/`unresolved`: a `resolution.*`- or `watch.*`-style diagnostic code. */
  code?: string;
  reason?: string;
  /** Kind-specific, informational only (design §4) — never re-consumed by Watch itself. */
  detail?: Record<string, unknown>;
}

export interface WatchSummary {
  open_attempts: number;
  stale: number;
  lost: number;
  inconsistent: number;
  unresolved: number;
}

export interface WatchReport {
  generated_from_revision: number;
  policy: { stale_after_ms: number };
  findings: WatchFinding[];
  summary: WatchSummary;
}

/** One resolver query: is the workspace resolvable, and how many commits since `since`? */
export interface WatchResolveInput {
  repository_id: string;
  workspace_id: string;
  /** From the ledger's `Workspace.branch` — absent when the Workspace has no branch hint. */
  branch?: string;
  /** The Attempt's `dispatched_at` — nullable per the contract's `Timestamp` type. */
  since: Timestamp;
}

export interface WatchUnresolvedResult {
  status: 'unresolved';
  code: string;
  reason: string;
}

/** The workspace resolved, but there is no `branch` to run `git log --since` against. */
export interface WatchNoBranchResult {
  status: 'no_branch';
}

/** `git log --since=<since> --oneline <branch>` line count in the resolved worktree. */
export interface WatchCommitsResult {
  status: 'commits';
  count: number;
}

export type WatchResolveResult = WatchUnresolvedResult | WatchNoBranchResult | WatchCommitsResult;

/**
 * A pluggable, injectable resolver: `(input) => result`. Bundles workspace resolution and
 * the commits-since-dispatch check behind one call, exactly as Land's `GitResolver` bundles
 * branch/target resolution and the diff check — so this module is unit-testable without
 * shelling out to `git`.
 */
export type WatchResolver = (input: WatchResolveInput) => WatchResolveResult | Promise<WatchResolveResult>;

const WATCH_CODES = {
  WORKSPACE_NOT_FOUND: 'watch.workspace_not_found',
} as const;

function findWorkspace(snapshot: Snapshot, workspaceId: string): Workspace | undefined {
  return snapshot.workspaces.find((w) => w.workspace_id === workspaceId);
}

/**
 * Attempts with no `AttemptEnd` and no effective Settlement for their `(task_id,
 * attempt_id)` pair — the "not yet at rest" condition design §3 defines directly over
 * Attempts/AttemptEnds/Settlements, rather than inferred from `ready_to_land`'s absence (a
 * task can be open without ever having a `land`-decision Settlement).
 */
function openAttempts(snapshot: Snapshot): Attempt[] {
  const endedAttemptIds = new Set(effectiveRecords(snapshot.attempt_ends).map((e) => e.attempt_id));
  const settledPairs = new Set(
    effectiveRecords(snapshot.settlements).map((s) => `${s.task_id}:${s.attempt_id}`),
  );
  return snapshot.attempts.filter(
    (a) => !endedAttemptIds.has(a.attempt_id) && !settledPairs.has(`${a.task_id}:${a.attempt_id}`),
  );
}

async function classify(
  snapshot: Snapshot,
  attempt: Attempt,
  staleTaskIds: ReadonlySet<string>,
  resolve: WatchResolver,
): Promise<WatchFinding[]> {
  const findings: WatchFinding[] = [];

  if (staleTaskIds.has(attempt.task_id)) {
    findings.push({
      task_id: attempt.task_id,
      attempt_id: attempt.attempt_id,
      kind: 'stale',
      detail: { last_activity_at: lastActivityAt(snapshot, attempt.task_id) ?? null },
    });
  }

  const workspace = findWorkspace(snapshot, attempt.workspace_id);
  if (!workspace) {
    findings.push({
      task_id: attempt.task_id,
      attempt_id: attempt.attempt_id,
      kind: 'lost',
      code: WATCH_CODES.WORKSPACE_NOT_FOUND,
      reason: `no Workspace ${attempt.workspace_id} referenced by attempt ${attempt.attempt_id}`,
    });
    return findings;
  }

  const result = await resolve({
    repository_id: attempt.repository_id,
    workspace_id: attempt.workspace_id,
    branch: workspace.branch,
    since: attempt.dispatched_at,
  });

  if (result.status === 'unresolved') {
    findings.push({
      task_id: attempt.task_id,
      attempt_id: attempt.attempt_id,
      kind: 'lost',
      code: result.code,
      reason: result.reason,
    });
    return findings;
  }

  if (result.status === 'no_branch') {
    findings.push({
      task_id: attempt.task_id,
      attempt_id: attempt.attempt_id,
      kind: 'unresolved',
      reason: `Workspace ${workspace.workspace_id} has no branch field`,
    });
    return findings;
  }

  // `inconsistent`: a claim exists on this attempt but the branch shows nothing new since
  // dispatch — the founding thesis (README: "a claim, not a fact") made concrete.
  if (result.count === 0) {
    const claimCount = snapshot.claims.filter((c) => c.attempt_id === attempt.attempt_id).length;
    if (claimCount > 0) {
      findings.push({
        task_id: attempt.task_id,
        attempt_id: attempt.attempt_id,
        kind: 'inconsistent',
        detail: { claim_count: claimCount },
      });
    }
  }

  return findings;
}

/**
 * Build a `WatchReport` over every open Attempt in `snapshot` (design §3-4), using
 * `resolve` for the live workspace/Git half. Never mutates the snapshot or anything else;
 * a pure fold over ledger facts plus resolver answers.
 */
export async function buildWatchReport(
  snapshot: Snapshot,
  resolve: WatchResolver,
  policy: StalePolicy,
): Promise<WatchReport> {
  const { stale } = computeProjectionValues(snapshot, policy);
  const staleTaskIds = new Set(stale ?? []);

  const attempts = openAttempts(snapshot);
  const findings = (
    await Promise.all(attempts.map((attempt) => classify(snapshot, attempt, staleTaskIds, resolve)))
  ).flat();

  const summary: WatchSummary = {
    open_attempts: attempts.length,
    stale: findings.filter((f) => f.kind === 'stale').length,
    lost: findings.filter((f) => f.kind === 'lost').length,
    inconsistent: findings.filter((f) => f.kind === 'inconsistent').length,
    unresolved: findings.filter((f) => f.kind === 'unresolved').length,
  };

  return {
    generated_from_revision: snapshot.revision,
    policy: { stale_after_ms: policy.staleAfterMs },
    findings,
    summary,
  };
}
