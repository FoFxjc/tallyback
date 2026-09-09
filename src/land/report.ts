/**
 * Land: Git-reality cross-check over the ledger's `ready_to_land` projection.
 *
 * `docs/land-design.md` (§1) frames this as the host-layer half of SPEC §7.2's
 * `ready_to_land`: "an effective Settlement combined with current Git … facts." The Git
 * half is a live check `computeProjectionValues` cannot perform over a pure `Snapshot`, so
 * Land takes the ledger's answer as given — it never re-derives or overrides
 * `ready_to_land` — and asks a caller-supplied resolver whether each candidate's branch is
 * actually landable right now.
 *
 * Read-only and advisory only (design §2/§6): no merge, no rebase, no ledger write, no
 * invented `depends_on` field. The resolver is dependency-injected (mirroring
 * `src/check/flow.ts`'s `Checker`) so this module is unit-testable without shelling out to
 * `git`; `src/land/git.ts` supplies the real, Git-backed implementation.
 */

import type { Attempt, Settlement, Snapshot, Verdict, Workspace } from '../contract/index.js';
import { computeProjectionValues, isLandSettlementVerificationReady } from '../ledger/projections.js';
import { effectiveRecords } from '../ledger/supersession.js';

/** Why a candidate could not be classified `git_ready` (design §4). */
export type LandUnresolvedStatus = 'git_unresolved' | 'git_behind';

export type LandStatus = 'git_ready' | LandUnresolvedStatus;

/**
 * One `ready_to_land` task, cross-checked against live Git state for one attempt's
 * settlement. A task with more than one effective `land` Settlement (distinct attempts)
 * yields one candidate per settlement.
 */
export interface LandCandidate {
  task_id: string;
  settlement_id: string;
  attempt_id: string;
  repository_id?: string;
  workspace_id?: string;
  branch?: string;
  target_branch: string;
  status: LandStatus;
  /** Present on `git_unresolved`: a `resolution.*`-style or `land.*` diagnostic code. */
  code?: string;
  reason?: string;
  /** Present on `git_ready`: files touched relative to `target_branch` (design §5). */
  overlapping_files?: string[];
}

export interface LandConflict {
  task_ids: string[];
  overlapping_files: string[];
}

export interface LandReport {
  ready: LandCandidate[];
  unresolved: LandCandidate[];
  conflicts: LandConflict[];
}

/** One resolver query: is `branch` ahead of `target_branch`, and what files differ? */
export interface GitResolveInput {
  repository_id: string;
  workspace_id: string;
  branch: string;
  target_branch: string;
}

export interface GitReadyResult {
  status: 'ready';
  /** `git diff --name-only <target>...<branch>` (design §5). */
  files: string[];
}

export interface GitBehindResult {
  status: 'behind';
}

export interface GitUnresolvedResult {
  status: 'unresolved';
  code: string;
  reason: string;
}

export type GitResolveResult = GitReadyResult | GitBehindResult | GitUnresolvedResult;

/** A pluggable, injectable Git resolver: `(input) => result`. Never a shell string. */
export type GitResolver = (input: GitResolveInput) => GitResolveResult | Promise<GitResolveResult>;

const LAND_CODES = {
  ATTEMPT_NOT_FOUND: 'land.attempt_not_found',
  WORKSPACE_NOT_FOUND: 'land.workspace_not_found',
  WORKSPACE_BRANCH_MISSING: 'land.workspace_branch_missing',
} as const;

/**
 * A task's effective `land` Settlements that individually clear the verification bar
 * (`isLandSettlementVerificationReady`) — the same per-settlement check
 * `computeProjectionValues` used to decide the task belongs in `ready_to_land` at all.
 * A task can have more than one effective `land` Settlement (distinct attempts); being in
 * `ready_to_land` only promises ONE of them is ready, so this must not return every
 * settlement of the task — that would let a still-`preliminary`-verdict settlement of a
 * second attempt ride along as `git_ready` merely because a *different* attempt's
 * settlement was what made the task qualify.
 */
function findEffectiveLandSettlements(
  snapshot: Snapshot,
  taskId: string,
  verdictById: ReadonlyMap<string, Verdict>,
): Settlement[] {
  return effectiveRecords(snapshot.settlements).filter(
    (s) =>
      s.task_id === taskId &&
      s.decision === 'land' &&
      isLandSettlementVerificationReady(s, verdictById),
  );
}

function findAttempt(snapshot: Snapshot, attemptId: string): Attempt | undefined {
  return snapshot.attempts.find((a) => a.attempt_id === attemptId);
}

function findWorkspace(snapshot: Snapshot, workspaceId: string): Workspace | undefined {
  return snapshot.workspaces.find((w) => w.workspace_id === workspaceId);
}

async function classify(
  snapshot: Snapshot,
  settlement: Settlement,
  targetBranch: string,
  resolve: GitResolver,
): Promise<LandCandidate> {
  const base = {
    task_id: settlement.task_id,
    settlement_id: settlement.settlement_id,
    attempt_id: settlement.attempt_id,
    target_branch: targetBranch,
  };

  const attempt = findAttempt(snapshot, settlement.attempt_id);
  if (!attempt) {
    return {
      ...base,
      status: 'git_unresolved',
      code: LAND_CODES.ATTEMPT_NOT_FOUND,
      reason: `no Attempt ${settlement.attempt_id} referenced by settlement ${settlement.settlement_id}`,
    };
  }

  const workspace = findWorkspace(snapshot, attempt.workspace_id);
  if (!workspace) {
    return {
      ...base,
      repository_id: attempt.repository_id,
      workspace_id: attempt.workspace_id,
      status: 'git_unresolved',
      code: LAND_CODES.WORKSPACE_NOT_FOUND,
      reason: `no Workspace ${attempt.workspace_id} referenced by attempt ${attempt.attempt_id}`,
    };
  }

  const withWorkspace = {
    ...base,
    repository_id: attempt.repository_id,
    workspace_id: attempt.workspace_id,
  };

  // Workspace.branch is optional (contract/schemas/records.schema.json) — absence means
  // Land cannot resolve a branch to check, so it reports `git_unresolved` rather than
  // guessing one (design §3.3).
  if (!workspace.branch) {
    return {
      ...withWorkspace,
      status: 'git_unresolved',
      code: LAND_CODES.WORKSPACE_BRANCH_MISSING,
      reason: `Workspace ${workspace.workspace_id} has no branch field`,
    };
  }

  const branch = workspace.branch;
  const result = await resolve({
    repository_id: attempt.repository_id,
    workspace_id: attempt.workspace_id,
    branch,
    target_branch: targetBranch,
  });

  if (result.status === 'unresolved') {
    return {
      ...withWorkspace,
      branch,
      status: 'git_unresolved',
      code: result.code,
      reason: result.reason,
    };
  }

  if (result.status === 'behind') {
    return { ...withWorkspace, branch, status: 'git_behind' };
  }

  return {
    ...withWorkspace,
    branch,
    status: 'git_ready',
    overlapping_files: [...result.files].sort(),
  };
}

/**
 * A file only identifies a candidate's change when paired with the repository it was
 * touched in — two different repos can each have their own unrelated `README.md`, and
 * bucketing on the bare path alone would wrongly merge them into one conflict group.
 */
function fileBucketKey(repositoryId: string | undefined, file: string): string {
  return `${repositoryId ?? ''} ${file}`;
}

function computeConflicts(ready: LandCandidate[]): LandConflict[] {
  // Bucket candidates by (repository, touched file), then walk the "shares a file"
  // adjacency those buckets imply. This finds the same connected components as a
  // union-find would — two candidates only ever need to merge because they share a file
  // in the same repository — without a manual parent map, and without the separate O(n²)
  // pairwise overlap scan: file buckets already group everyone who overlaps with everyone
  // else on that file.
  const fileToCandidates = new Map<string, LandCandidate[]>();
  for (const c of ready) {
    for (const f of c.overlapping_files ?? []) {
      const key = fileBucketKey(c.repository_id, f);
      const list = fileToCandidates.get(key) ?? [];
      list.push(c);
      fileToCandidates.set(key, list);
    }
  }

  // Visited by `settlement_id`, not `task_id`: a task can have more than one effective
  // land Settlement (distinct attempts, each its own LandCandidate — design §7's "one
  // candidate per settlement"). Marking a whole task_id visited after its first candidate
  // silently skipped every later candidate of that same task, and with it any conflict
  // that candidate alone would have surfaced.
  const visited = new Set<string>();
  const conflicts: LandConflict[] = [];
  for (const start of ready) {
    if (visited.has(start.settlement_id)) continue;
    visited.add(start.settlement_id);
    const group: LandCandidate[] = [];
    const stack = [start];
    while (stack.length > 0) {
      const c = stack.pop()!;
      group.push(c);
      for (const f of c.overlapping_files ?? []) {
        const key = fileBucketKey(c.repository_id, f);
        for (const neighbor of fileToCandidates.get(key) ?? []) {
          if (!visited.has(neighbor.settlement_id)) {
            visited.add(neighbor.settlement_id);
            stack.push(neighbor);
          }
        }
      }
    }
    if (group.length < 2) continue;
    // A group can legitimately contain two candidates for the same task_id (two attempts
    // of one task both touching the conflicting file) — de-duplicate before reporting.
    const taskIds = [...new Set(group.map((c) => c.task_id))].sort();
    // Only files touched by MORE THAN ONE member of the group are "overlapping" — a file
    // one candidate alone touches is not part of what makes the group collide.
    const counts = new Map<string, number>();
    for (const c of group) {
      for (const f of c.overlapping_files ?? []) counts.set(f, (counts.get(f) ?? 0) + 1);
    }
    const overlapping = [...counts.entries()].filter(([, n]) => n > 1).map(([f]) => f);
    conflicts.push({ task_ids: taskIds, overlapping_files: overlapping.sort() });
  }
  // Deterministic order: by the first (lexically smallest) task_id in each group.
  conflicts.sort((a, b) => a.task_ids[0]!.localeCompare(b.task_ids[0]!));
  return conflicts;
}

/**
 * Build a `LandReport` for `snapshot`'s `ready_to_land` tasks against `targetBranch`,
 * using `resolve` for the live Git half (design §7). Never mutates the snapshot or
 * anything else; a pure fold over ledger facts plus resolver answers.
 */
export async function buildLandReport(
  snapshot: Snapshot,
  resolve: GitResolver,
  targetBranch: string,
): Promise<LandReport> {
  const { ready_to_land } = computeProjectionValues(snapshot);
  const taskIds = [...ready_to_land].sort();
  const verdictById = new Map(snapshot.verdicts.map((v) => [v.verdict_id, v]));

  const settlements = taskIds.flatMap((taskId) =>
    findEffectiveLandSettlements(snapshot, taskId, verdictById),
  );
  const candidates = await Promise.all(
    settlements.map((settlement) => classify(snapshot, settlement, targetBranch, resolve)),
  );

  const ready = candidates
    .filter((c) => c.status === 'git_ready')
    .sort((a, b) => a.task_id.localeCompare(b.task_id));
  const unresolved = candidates
    .filter((c) => c.status !== 'git_ready')
    .sort((a, b) => a.task_id.localeCompare(b.task_id));
  const conflicts = computeConflicts(ready);

  return { ready, unresolved, conflicts };
}
