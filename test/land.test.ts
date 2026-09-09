/**
 * Land: the Git-reality cross-check over `ready_to_land` (`docs/land-design.md`).
 *
 * `src/land/report.ts`'s unit tests drive `buildLandReport` with a fake, injected
 * `GitResolver` — mirroring how `test/check-flow.test.ts` drives `runCheck` against a fake
 * `Checker` — so none of these need a real `git` worktree. Only the last (CLI-level) test
 * proves the command wires up end to end; it is fine for that one to report everything
 * unresolved since there is no real git worktree bound in the test tmp dir.
 */

import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { buildLandReport, type GitResolver } from '../src/land/report.js';
import { ALICE, buildLedger, type LedgerFixture } from './helpers/ledger.js';

const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const TSX = join(ROOT, 'node_modules', '.bin', 'tsx');
const CLI = join(ROOT, 'src', 'cli.ts');

/** Settle `fixture`'s attempt as `land`, via a verification_exception basis (TB-LC-005). */
async function settleLand(fixture: LedgerFixture): Promise<void> {
  const outcome = await fixture.store.settle({
    task_id: fixture.task_id,
    attempt_id: fixture.attempt_id,
    decision: 'land',
    decided_by: ALICE,
    basis: { verdict_id: null, attempt_end_id: null, blocker_ids: [] },
    verification_exception: 'accepted by hand for land test fixture',
    rationale: 'test fixture: land settlement without a full check/verdict chain',
  });
  if (!outcome.ok) {
    throw new Error(`settle(land) failed: ${String((outcome as { code?: string }).code)}`);
  }
}

const TARGET_BRANCH = 'main';

describe('buildLandReport', () => {
  it('reports a ready_to_land task with a resolvable, ahead branch as ready', async () => {
    const fixture = await buildLedger('tallyback-land-ready-');
    await settleLand(fixture);

    const resolver: GitResolver = () => ({ status: 'ready', files: ['src/a.ts'] });
    const report = await buildLandReport(fixture.store.currentSnapshot(), resolver, TARGET_BRANCH);

    expect(report.unresolved).toHaveLength(0);
    expect(report.ready).toHaveLength(1);
    expect(report.ready[0]).toMatchObject({
      task_id: fixture.task_id,
      attempt_id: fixture.attempt_id,
      branch: 'main',
      status: 'git_ready',
      overlapping_files: ['src/a.ts'],
    });
    expect(report.conflicts).toHaveLength(0);
  });

  it('reports git_unresolved when the Workspace has no branch field', async () => {
    const fixture = await buildLedger('tallyback-land-nobranch-');

    // A second workspace with no `branch`, dispatched to a fresh attempt of the same task.
    const ws = await fixture.store.registerWorkspace({ repository_id: fixture.repository_id });
    if (!ws.ok) throw new Error('registerWorkspace failed');
    const dispatched = await fixture.store.dispatch({
      task_id: fixture.task_id,
      declaration_id: fixture.declaration_id,
      repository_id: fixture.repository_id,
      workspace_id: ws.workspace.workspace_id,
      executor: { kind: 'executor', id: 'agent-7' },
      dispatched_by: ALICE,
    });
    if (!dispatched.ok) throw new Error('dispatch failed');

    const settled = await fixture.store.settle({
      task_id: fixture.task_id,
      attempt_id: dispatched.attempt.attempt_id,
      decision: 'land',
      decided_by: ALICE,
      basis: { verdict_id: null, attempt_end_id: null, blocker_ids: [] },
      verification_exception: 'accepted by hand for land test fixture',
      rationale: 'no-branch workspace',
    });
    expect(settled.ok).toBe(true);

    const resolver: GitResolver = () => {
      throw new Error('resolver must not be called when the branch field is absent');
    };
    const report = await buildLandReport(fixture.store.currentSnapshot(), resolver, TARGET_BRANCH);

    expect(report.ready).toHaveLength(0);
    expect(report.unresolved).toHaveLength(1);
    expect(report.unresolved[0]).toMatchObject({
      task_id: fixture.task_id,
      status: 'git_unresolved',
      code: 'land.workspace_branch_missing',
    });
  });

  it('flags two ready candidates with overlapping touched files as a conflict', async () => {
    const a = await buildLedger('tallyback-land-conflict-a-');
    await settleLand(a);

    // A second, independent task/attempt/settlement in the SAME ledger, so both land
    // candidates are evaluated together by one buildLandReport call.
    const { topic } = unwrap<{ topic: { topic_id: string } }>(
      await a.store.createTopic({ name: 't2', goal: 'g', created_by: ALICE }),
    );
    const { task } = unwrap<{ task: { task_id: string } }>(
      await a.store.createTask({ topic_id: topic.topic_id, title: 'Second task', alias: 'T2' }),
    );
    const { declaration } = unwrap<{ declaration: { declaration_id: string } }>(
      await a.store.declare({
        task_id: task.task_id,
        objective: 'Second objective.',
        criteria: [{ code: 'c2', statement: 'Second criterion.' }],
        declared_by: ALICE,
      }),
    );
    const { workspace } = unwrap<{ workspace: { workspace_id: string } }>(
      await a.store.registerWorkspace({ repository_id: a.repository_id, branch: 'feature/two' }),
    );
    const { attempt } = unwrap<{ attempt: { attempt_id: string } }>(
      await a.store.dispatch({
        task_id: task.task_id,
        declaration_id: declaration.declaration_id,
        repository_id: a.repository_id,
        workspace_id: workspace.workspace_id,
        executor: { kind: 'executor', id: 'agent-7' },
        dispatched_by: ALICE,
      }),
    );
    const settled = await a.store.settle({
      task_id: task.task_id,
      attempt_id: attempt.attempt_id,
      decision: 'land',
      decided_by: ALICE,
      basis: { verdict_id: null, attempt_end_id: null, blocker_ids: [] },
      verification_exception: 'accepted by hand',
      rationale: 'second land settlement',
    });
    expect(settled.ok).toBe(true);

    const resolver: GitResolver = (input) => ({
      status: 'ready',
      files: input.branch === 'main' ? ['src/shared.ts', 'src/a.ts'] : ['src/shared.ts', 'src/b.ts'],
    });
    const report = await buildLandReport(a.store.currentSnapshot(), resolver, TARGET_BRANCH);

    expect(report.ready).toHaveLength(2);
    expect(report.conflicts).toHaveLength(1);
    expect(report.conflicts[0]!.task_ids.sort()).toEqual([a.task_id, task.task_id].sort());
    expect(report.conflicts[0]!.overlapping_files).toEqual(['src/shared.ts']);
  });

  it('classifies a ready_to_land task as git_behind when the resolver reports no ahead commits', async () => {
    const fixture = await buildLedger('tallyback-land-behind-');
    await settleLand(fixture);

    const resolver: GitResolver = () => ({ status: 'behind' });
    const report = await buildLandReport(fixture.store.currentSnapshot(), resolver, TARGET_BRANCH);

    expect(report.ready).toHaveLength(0);
    expect(report.unresolved).toHaveLength(1);
    expect(report.unresolved[0]).toMatchObject({ task_id: fixture.task_id, status: 'git_behind' });
  });
});

function unwrap<T extends object>(outcome: { ok: boolean; code?: string } & Partial<T>): T {
  if (!outcome.ok) {
    throw new Error(`store command failed: ${String(outcome.code)}`);
  }
  return outcome as unknown as T;
}

// ---------------------------------------------------------------------------
// CLI wiring
// ---------------------------------------------------------------------------

interface CliRun {
  code: number;
  stdout: string;
  stderr: string;
}

async function runRaw(projectRoot: string, args: string[]): Promise<CliRun> {
  try {
    const { stdout, stderr } = await execFileAsync(TSX, [CLI, ...args, '--project-root', projectRoot], {
      cwd: ROOT,
    });
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return { code: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

describe('tallyback land (CLI)', () => {
  it('runs against an open ledger and returns valid JSON, read-only', async () => {
    const { tempRoot } = await import('./helpers/ledger.js');
    const root = await tempRoot('tallyback-land-cli-');

    const initRun = await runRaw(root, ['init', '--repository', 'main']);
    expect(initRun.code).toBe(0);

    // No dispatch/settle/binding set up here — there is nothing in `ready_to_land`, and no
    // real git worktree is bound, so this proves the command wires up end to end without
    // needing full ledger + git plumbing.
    const run = await runRaw(root, ['land', '--target-branch', 'main']);
    expect(run.code).toBe(0);

    const parsed = JSON.parse(run.stdout) as {
      target_branch: string;
      ready: unknown[];
      unresolved: unknown[];
      conflicts: unknown[];
    };
    expect(parsed.target_branch).toBe('main');
    expect(parsed.ready).toEqual([]);
    expect(parsed.unresolved).toEqual([]);
    expect(parsed.conflicts).toEqual([]);
  }, 30_000);
});
