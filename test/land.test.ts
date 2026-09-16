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
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { createGitResolver } from '../src/land/git.js';
import { buildLandReport, type GitResolver } from '../src/land/report.js';
import { ALICE, buildLedger, tempRoot, type LedgerFixture } from './helpers/ledger.js';

const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const TSX = join(ROOT, 'node_modules', '.bin', 'tsx');
const CLI = join(ROOT, 'src', 'cli.ts');

async function initGitRepo(root: string): Promise<void> {
  await execFileAsync('git', ['-C', root, 'init', '-q', '-b', 'main']);
  await execFileAsync('git', ['-C', root, 'config', 'user.email', 'a@b.c']);
  await execFileAsync('git', ['-C', root, 'config', 'user.name', 'x']);
  await writeFile(join(root, 'f.txt'), 'x', 'utf8');
  await execFileAsync('git', ['-C', root, 'add', '.']);
  await execFileAsync('git', ['-C', root, 'commit', '-q', '-m', 'init']);
}

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
      files:
        input.branch === 'main' ? ['src/shared.ts', 'src/a.ts'] : ['src/shared.ts', 'src/b.ts'],
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
    const { stdout, stderr } = await execFileAsync(
      TSX,
      [CLI, ...args, '--project-root', projectRoot],
      {
        cwd: ROOT,
      },
    );
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return { code: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

describe('tallyback land (CLI)', () => {
  it('runs against an open ledger and returns valid JSON, read-only', async () => {
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

  it('default `tallyback land` omits the `historical` field; `--all` emits it (but never folds integrated candidates into `ready`)', async () => {
    // The CLI's `tallyback land` calls `createGitResolver` against the project root's
    // runtime/bindings.json. With no bindings configured, every candidate lands in
    // `unresolved` (path_unavailable), so this test verifies JSON shape rather than
    // the resolver classification. The classification itself is covered by the
    // `buildLandReport` unit tests + the real-git sibling-fallback tests.
    const snapshot = await (async () => {
      const root = await tempRoot('tallyback-land-cli-all-');
      const init = await runRaw(root, ['init', '--repository', 'main']);
      expect(init.code).toBe(0);
      return root;
    })();

    // Default invocation: omit `historical` entirely from the JSON output. The
    // actionable surface is the only thing the operator needs to see.
    const defaultRun = await runRaw(snapshot, ['land']);
    expect(defaultRun.code).toBe(0);
    const defaultParsed = JSON.parse(defaultRun.stdout) as Record<string, unknown>;
    expect(defaultParsed).not.toHaveProperty('historical');
    expect(defaultParsed).toHaveProperty('ready');
    expect(defaultParsed).toHaveProperty('unresolved');
    expect(defaultParsed).toHaveProperty('conflicts');

    // `--all`: emit `historical` (even when empty), as a sibling of `ready` /
    // `unresolved` — never folded into `ready`. Folding would be a lie (telling the
    // operator to "land me" work that has already landed).
    const allRun = await runRaw(snapshot, ['land', '--all']);
    expect(allRun.code).toBe(0);
    const allParsed = JSON.parse(allRun.stdout) as Record<string, unknown>;
    expect(allParsed).toHaveProperty('historical');
    expect(Array.isArray(allParsed.historical)).toBe(true);
    // `ready` is still only `git_ready` candidates — never integrated ones.
    expect(allParsed).toHaveProperty('ready');
  }, 30_000);
});

describe('createGitResolver — commits-ahead check (real git)', () => {
  const REPO_ID = 'repo_0190b1c0-0000-7000-8000-000000000001';
  const WSP_ID = 'wsp_0190b1c0-0000-7000-8000-000000000001';

  function bindingsFor(root: string) {
    return {
      bindings: {
        repositories: { [REPO_ID]: { workspaces: { [WSP_ID]: { root } } } },
      },
    };
  }

  it('classifies a branch identical to target as git_integrated, not git_behind or git_ready', async () => {
    // Stabilization slice: when `branch` sits at the exact same commit as `target`, the
    // work is integrated (every commit on `branch` is reachable from `target`). This is
    // a deliberate change from the v1 "git_behind" classification — there is nothing
    // new to land, so the actionable surface should not advertise the candidate at all.
    const root = await tempRoot('tallyback-land-git-');
    await initGitRepo(root);
    // "feature" points at the exact same commit as "main".
    await execFileAsync('git', ['-C', root, 'branch', 'feature']);

    const resolve = createGitResolver(bindingsFor(root));
    const result = await resolve({
      repository_id: REPO_ID,
      workspace_id: WSP_ID,
      branch: 'feature',
      target_branch: 'main',
    });
    expect(result.status).toBe('integrated');
  });

  it('classifies a branch with a new commit ahead of target as ready', async () => {
    const root = await tempRoot('tallyback-land-git-');
    await initGitRepo(root);
    await execFileAsync('git', ['-C', root, 'checkout', '-q', '-b', 'feature']);
    await writeFile(join(root, 'g.txt'), 'y', 'utf8');
    await execFileAsync('git', ['-C', root, 'add', '.']);
    await execFileAsync('git', ['-C', root, 'commit', '-q', '-m', 'feature work']);

    const resolve = createGitResolver(bindingsFor(root));
    const result = await resolve({
      repository_id: REPO_ID,
      workspace_id: WSP_ID,
      branch: 'feature',
      target_branch: 'main',
    });
    expect(result.status).toBe('ready');
    if (result.status === 'ready') expect(result.files).toEqual(['g.txt']);
  });
});

describe('computeConflicts — grouping correctness', () => {
  it('finds a conflict through a second attempt of the same task, not just its first', async () => {
    // Task A has TWO effective land Settlements (two distinct attempts) — one candidate
    // touches a file no one else does, the other shares a file with task B. Grouping by
    // task_id alone marks A "visited" after its first candidate and would skip the second
    // entirely, missing the conflict with B.
    const a = await buildLedger('tallyback-land-multi-attempt-');
    await settleLand(a);

    const secondWorkspace = unwrap<{ workspace: { workspace_id: string } }>(
      await a.store.registerWorkspace({ repository_id: a.repository_id, branch: 'feature/a2' }),
    ).workspace;
    const secondAttempt = unwrap<{ attempt: { attempt_id: string } }>(
      await a.store.dispatch({
        task_id: a.task_id,
        declaration_id: a.declaration_id,
        repository_id: a.repository_id,
        workspace_id: secondWorkspace.workspace_id,
        executor: { kind: 'executor', id: 'agent-8' },
        dispatched_by: ALICE,
      }),
    ).attempt;
    expect(
      (
        await a.store.settle({
          task_id: a.task_id,
          attempt_id: secondAttempt.attempt_id,
          decision: 'land',
          decided_by: ALICE,
          basis: { verdict_id: null, attempt_end_id: null, blocker_ids: [] },
          verification_exception: 'accepted by hand',
          rationale: "task A's second attempt",
        })
      ).ok,
    ).toBe(true);

    const { topic } = unwrap<{ topic: { topic_id: string } }>(
      await a.store.createTopic({ name: 't2', goal: 'g', created_by: ALICE }),
    );
    const { task: taskB } = unwrap<{ task: { task_id: string } }>(
      await a.store.createTask({ topic_id: topic.topic_id, title: 'Task B', alias: 'TB' }),
    );
    const { declaration: declB } = unwrap<{ declaration: { declaration_id: string } }>(
      await a.store.declare({
        task_id: taskB.task_id,
        objective: 'B objective.',
        criteria: [{ code: 'cb', statement: 'B criterion.' }],
        declared_by: ALICE,
      }),
    );
    const { workspace: wsB } = unwrap<{ workspace: { workspace_id: string } }>(
      await a.store.registerWorkspace({ repository_id: a.repository_id, branch: 'feature/b' }),
    );
    const { attempt: attemptB } = unwrap<{ attempt: { attempt_id: string } }>(
      await a.store.dispatch({
        task_id: taskB.task_id,
        declaration_id: declB.declaration_id,
        repository_id: a.repository_id,
        workspace_id: wsB.workspace_id,
        executor: { kind: 'executor', id: 'agent-9' },
        dispatched_by: ALICE,
      }),
    );
    expect(
      (
        await a.store.settle({
          task_id: taskB.task_id,
          attempt_id: attemptB.attempt_id,
          decision: 'land',
          decided_by: ALICE,
          basis: { verdict_id: null, attempt_end_id: null, blocker_ids: [] },
          verification_exception: 'accepted by hand',
          rationale: 'task B',
        })
      ).ok,
    ).toBe(true);

    // First attempt of A touches only its own file; A's SECOND attempt shares a file with B.
    const resolver: GitResolver = (input) => {
      if (input.branch === 'main') return { status: 'ready', files: ['a1-only.ts'] };
      if (input.branch === 'feature/a2') return { status: 'ready', files: ['shared.ts'] };
      return { status: 'ready', files: ['shared.ts'] }; // feature/b
    };
    const report = await buildLandReport(a.store.currentSnapshot(), resolver, TARGET_BRANCH);

    expect(report.ready).toHaveLength(3);
    expect(report.conflicts).toHaveLength(1);
    expect(report.conflicts[0]!.task_ids.sort()).toEqual([a.task_id, taskB.task_id].sort());
    expect(report.conflicts[0]!.overlapping_files).toEqual(['shared.ts']);
  });

  it('does not flag the same filename in two different repositories as a conflict', async () => {
    const root = await tempRoot('tallyback-land-cross-repo-');
    const { Store } = await import('../src/ledger/index.js');
    const store = await Store.init(root, {
      repositories: [{ alias: 'repo-one' }, { alias: 'repo-two' }],
    });
    const [repoOne, repoTwo] = store.listRepositories();

    async function settleOnRepo(repositoryId: string, alias: string) {
      const { topic } = unwrap<{ topic: { topic_id: string } }>(
        await store.createTopic({ name: alias, goal: 'g', created_by: ALICE }),
      );
      const { task } = unwrap<{ task: { task_id: string } }>(
        await store.createTask({ topic_id: topic.topic_id, title: alias, alias }),
      );
      const { declaration } = unwrap<{ declaration: { declaration_id: string } }>(
        await store.declare({
          task_id: task.task_id,
          objective: `${alias} objective.`,
          criteria: [{ code: 'c', statement: 's' }],
          declared_by: ALICE,
        }),
      );
      const { workspace } = unwrap<{ workspace: { workspace_id: string } }>(
        await store.registerWorkspace({ repository_id: repositoryId, branch: 'feature' }),
      );
      const { attempt } = unwrap<{ attempt: { attempt_id: string } }>(
        await store.dispatch({
          task_id: task.task_id,
          declaration_id: declaration.declaration_id,
          repository_id: repositoryId,
          workspace_id: workspace.workspace_id,
          executor: { kind: 'executor', id: 'agent-7' },
          dispatched_by: ALICE,
        }),
      );
      const settled = await store.settle({
        task_id: task.task_id,
        attempt_id: attempt.attempt_id,
        decision: 'land',
        decided_by: ALICE,
        basis: { verdict_id: null, attempt_end_id: null, blocker_ids: [] },
        verification_exception: 'accepted by hand',
        rationale: alias,
      });
      expect(settled.ok).toBe(true);
    }

    await settleOnRepo(repoOne!.repository_id, 'repo-one-task');
    await settleOnRepo(repoTwo!.repository_id, 'repo-two-task');

    // Both repos independently touch a file with the SAME NAME — not the same file.
    const resolver: GitResolver = () => ({ status: 'ready', files: ['README.md'] });
    const report = await buildLandReport(store.currentSnapshot(), resolver, TARGET_BRANCH);

    expect(report.ready).toHaveLength(2);
    expect(report.conflicts).toHaveLength(0);
  });

  it("does not admit a task's preliminary-verdict land Settlement just because another attempt's Settlement made the task ready_to_land", async () => {
    // Task A: attempt 1 settles `land` citing a *preliminary* Verdict (ready_to_land's own
    // per-settlement rule says this one is NOT individually ready), attempt 2 settles
    // `land` via a verification_exception (this one IS ready). Both are effective
    // Settlements of the same task, so the task appears in `ready_to_land` -- but only
    // attempt 2's settlement should ever reach `git_ready`.
    const a = await buildLedger('tallyback-land-preliminary-');

    const verdictId = 'ver_0190b1c0-0000-7000-8000-0000000000aa';
    const appended = await a.store.append({
      kind: 'append_records',
      expected_revision: a.store.currentRevision(),
      records: [
        {
          verdict_id: verdictId,
          subject: { kind: 'claim', id: a.claim_id },
          declaration_id: a.declaration_id,
          scope: { evaluated_criteria: [a.criterion_id], unevaluated_criteria: [] },
          conclusion: 'supported',
          finality: 'preliminary',
          basis: { evidence_ids: [a.evidence_id], reconciliation_ids: [] },
          findings: [
            {
              criterion_id: a.criterion_id,
              assessment: 'supported',
              summary: 'still checking',
              basis_refs: [],
            },
          ],
          confidence: { level: 'low', rationale: 'preliminary pass' },
          rationale: 'not final yet',
          uncertainty: [],
          limitations: [],
          issued_by: { kind: 'tool', id: 'tallyback-check' },
          issued_at: null,
        },
      ],
      provenance: { submitted_by: { kind: 'tool', id: 'tallyback' } },
    });
    expect(appended.ok).toBe(true);

    const preliminarySettled = await a.store.settle({
      task_id: a.task_id,
      attempt_id: a.attempt_id,
      decision: 'land',
      decided_by: ALICE,
      basis: { verdict_id: verdictId, attempt_end_id: null, blocker_ids: [] },
      rationale: 'citing a still-preliminary verdict',
    });
    expect(preliminarySettled.ok).toBe(true);

    const secondWorkspace = unwrap<{ workspace: { workspace_id: string } }>(
      await a.store.registerWorkspace({ repository_id: a.repository_id, branch: 'feature/ready' }),
    ).workspace;
    const secondAttempt = unwrap<{ attempt: { attempt_id: string } }>(
      await a.store.dispatch({
        task_id: a.task_id,
        declaration_id: a.declaration_id,
        repository_id: a.repository_id,
        workspace_id: secondWorkspace.workspace_id,
        executor: { kind: 'executor', id: 'agent-8' },
        dispatched_by: ALICE,
      }),
    ).attempt;
    const exceptionSettled = await a.store.settle({
      task_id: a.task_id,
      attempt_id: secondAttempt.attempt_id,
      decision: 'land',
      decided_by: ALICE,
      basis: { verdict_id: null, attempt_end_id: null, blocker_ids: [] },
      verification_exception: 'accepted by hand',
      rationale: "the task's other attempt is ready",
    });
    expect(exceptionSettled.ok).toBe(true);

    const snapshot = a.store.currentSnapshot();
    expect(snapshot.tasks.some((t) => t.task_id === a.task_id)).toBe(true);

    const resolver: GitResolver = () => ({ status: 'ready', files: ['x.ts'] });
    const report = await buildLandReport(snapshot, resolver, TARGET_BRANCH);

    expect(report.ready).toHaveLength(1);
    expect(report.ready[0]!.attempt_id).toBe(secondAttempt.attempt_id);
  });
});

// ---------------------------------------------------------------------------
// Stabilization slice: integrated candidates (git merge-base --is-ancestor branch target)
// ---------------------------------------------------------------------------

describe('buildLandReport — already-integrated candidates (stabilization slice)', () => {
  it('routes a ready_to_land candidate whose branch is integrated into target into the historical bucket by default', async () => {
    const fixture = await buildLedger('tallyback-land-integrated-');
    await settleLand(fixture);

    const resolver: GitResolver = () => ({
      status: 'integrated',
      files: ['src/done.ts'],
      reason: `branch main is integrated into ${TARGET_BRANCH}`,
    });
    const report = await buildLandReport(fixture.store.currentSnapshot(), resolver, TARGET_BRANCH);

    // Default: integrated candidate is in `historical`, NOT in `ready` or `unresolved`.
    expect(report.historical).toHaveLength(1);
    expect(report.historical[0]).toMatchObject({
      task_id: fixture.task_id,
      status: 'git_integrated',
    });
    expect(report.ready).toHaveLength(0);
    expect(report.unresolved).toHaveLength(0);
    expect(report.conflicts).toHaveLength(0);
  });

  it('integrated candidates always go to historical — never folded into ready under any code path', async () => {
    // The semantic correction: `git_integrated` means historical/non-actionable.
    // Reclassifying it as `ready` (under a `land --all` flag or any other path) would be
    // a lie — the operator would be told to "land me" for work that has already landed.
    // This test is the explicit guardrail: integrated candidates always live in
    // `historical`, regardless of caller options.
    const fixture = await buildLedger('tallyback-land-integrated-never-folded-');
    await settleLand(fixture);

    const resolver: GitResolver = () => ({
      status: 'integrated',
      files: ['src/done.ts'],
      reason: 'branch main is integrated',
    });
    // `buildLandReport` no longer takes options; its routing is fixed at the resolver/
    // report boundary. Verify both that `ready` excludes the integrated candidate and
    // that `historical` includes it with the correct status.
    const report = await buildLandReport(
      fixture.store.currentSnapshot(),
      resolver,
      TARGET_BRANCH,
    );

    expect(report.ready).toHaveLength(0);
    expect(report.unresolved).toHaveLength(0);
    expect(report.historical).toHaveLength(1);
    expect(report.historical[0]).toMatchObject({
      task_id: fixture.task_id,
      status: 'git_integrated',
    });
    // Conflict detection operates strictly on `ready` candidates — `historical` does
    // not feed it, because historical candidates are not actionable to begin with.
    expect(report.conflicts).toHaveLength(0);
  });

  it('mixed: some candidates ready, some integrated, some genuinely unresolved', async () => {
    // Three tasks in one ledger: A (commits ahead of target → ready), B (fully
    // integrated → historical by default), C (resolver reports unresolved). Default
    // routing: A in `ready`, B in `historical`, C in `unresolved`.
    const a = await buildLedger('tallyback-land-mix-ready-');
    await settleLand(a);

    const { topic } = unwrap<{ topic: { topic_id: string } }>(
      await a.store.createTopic({ name: 't2', goal: 'g', created_by: ALICE }),
    );
    const { task: taskB } = unwrap<{ task: { task_id: string } }>(
      await a.store.createTask({ topic_id: topic.topic_id, title: 'B integrated', alias: 'TB' }),
    );
    const { declaration: declB } = unwrap<{ declaration: { declaration_id: string } }>(
      await a.store.declare({
        task_id: taskB.task_id,
        objective: 'B.',
        criteria: [{ code: 'cb', statement: 's' }],
        declared_by: ALICE,
      }),
    );
    const { workspace: wsB } = unwrap<{ workspace: { workspace_id: string } }>(
      await a.store.registerWorkspace({ repository_id: a.repository_id, branch: 'feature/b' }),
    );
    const { attempt: attemptB } = unwrap<{ attempt: { attempt_id: string } }>(
      await a.store.dispatch({
        task_id: taskB.task_id,
        declaration_id: declB.declaration_id,
        repository_id: a.repository_id,
        workspace_id: wsB.workspace_id,
        executor: { kind: 'executor', id: 'agent-b' },
        dispatched_by: ALICE,
      }),
    );
    const bSettled = await a.store.settle({
      task_id: taskB.task_id,
      attempt_id: attemptB.attempt_id,
      decision: 'land',
      decided_by: ALICE,
      basis: { verdict_id: null, attempt_end_id: null, blocker_ids: [] },
      verification_exception: 'accepted by hand',
      rationale: 'B will be integrated',
    });
    expect(bSettled.ok).toBe(true);

    // A third task whose branch the resolver reports as unresolved (e.g. worktree gone).
    const { task: taskC } = unwrap<{ task: { task_id: string } }>(
      await a.store.createTask({ topic_id: topic.topic_id, title: 'C unresolved', alias: 'TC' }),
    );
    const { declaration: declC } = unwrap<{ declaration: { declaration_id: string } }>(
      await a.store.declare({
        task_id: taskC.task_id,
        objective: 'C.',
        criteria: [{ code: 'cc', statement: 's' }],
        declared_by: ALICE,
      }),
    );
    const wsC = unwrap<{ workspace: { workspace_id: string } }>(
      await a.store.registerWorkspace({ repository_id: a.repository_id, branch: 'feature/c' }),
    ).workspace;
    const attemptC = unwrap<{ attempt: { attempt_id: string } }>(
      await a.store.dispatch({
        task_id: taskC.task_id,
        declaration_id: declC.declaration_id,
        repository_id: a.repository_id,
        workspace_id: wsC.workspace_id,
        executor: { kind: 'executor', id: 'agent-c' },
        dispatched_by: ALICE,
      }),
    ).attempt;
    const cSettled = await a.store.settle({
      task_id: taskC.task_id,
      attempt_id: attemptC.attempt_id,
      decision: 'land',
      decided_by: ALICE,
      basis: { verdict_id: null, attempt_end_id: null, blocker_ids: [] },
      verification_exception: 'accepted by hand',
      rationale: 'C will be unresolved (workspace gone)',
    });
    expect(cSettled.ok).toBe(true);

    const resolver: GitResolver = (input) => {
      if (input.branch === 'main') return { status: 'ready', files: ['src/a.ts'] };
      if (input.branch === 'feature/b') {
        return { status: 'integrated', files: [], reason: 'feature/b is integrated' };
      }
      return { status: 'unresolved', code: 'resolution.path_unavailable', reason: 'gone' };
    };

    const report = await buildLandReport(a.store.currentSnapshot(), resolver, TARGET_BRANCH);

    expect(report.ready.map((c) => c.task_id).sort()).toEqual([a.task_id]);
    expect(report.historical.map((c) => c.task_id).sort()).toEqual([taskB.task_id]);
    expect(report.unresolved.map((c) => c.task_id).sort()).toEqual([taskC.task_id]);
    expect(report.conflicts).toHaveLength(0);
  });
});

describe('createGitResolver — integration proof with sibling-workspace fallback (real git)', () => {
  const REPO_ID = 'repo_0190b1c0-0000-7000-8000-000000000001';
  const PRIMARY_WSP_ID = 'wsp_0190b1c0-0000-7000-8000-000000000001';
  const SIBLING_WSP_ID = 'wsp_0190b1c0-0000-7000-8000-000000000002';

  async function initRepoWithFeatureMerged(root: string): Promise<void> {
    await initGitRepo(root);
    // Create a feature branch with a commit, then merge it into main (fast-forward).
    await execFileAsync('git', ['-C', root, 'checkout', '-q', '-b', 'feature']);
    await writeFile(join(root, 'f.txt'), 'y', 'utf8');
    await execFileAsync('git', ['-C', root, 'add', '.']);
    await execFileAsync('git', ['-C', root, 'commit', '-q', '-m', 'feature work']);
    await execFileAsync('git', ['-C', root, 'checkout', '-q', 'main']);
    // Fast-forward merge by resetting main to feature (the merge IS the integration).
    await execFileAsync('git', ['-C', root, 'merge', '--ff-only', 'feature']);
  }

  function bindingsFor(primaryRoot: string | null, siblingRoot: string | null) {
    const entries: Record<string, { root: string }> = {};
    if (primaryRoot !== null) entries[PRIMARY_WSP_ID] = { root: primaryRoot };
    if (siblingRoot !== null) entries[SIBLING_WSP_ID] = { root: siblingRoot };
    return {
      bindings: {
        repositories: { [REPO_ID]: { workspaces: entries } },
      },
    };
  }

  it('classifies a branch already fast-forward-merged into target as integrated (primary worktree)', async () => {
    const root = await tempRoot('tallyback-land-int-merged-');
    await initRepoWithFeatureMerged(root);
    const resolve = createGitResolver(bindingsFor(root, null));
    const result = await resolve({
      repository_id: REPO_ID,
      workspace_id: PRIMARY_WSP_ID,
      branch: 'feature',
      target_branch: 'main',
    });
    expect(result.status).toBe('integrated');
    if (result.status === 'integrated') {
      expect(result.reason).toContain('integrated into main');
    }
  });

  it('proves integration via a sibling workspace when the primary worktree is gone', async () => {
    const primaryRoot = join(await tempRoot('tallyback-land-int-primary-'), 'worktree');
    const siblingRoot = await tempRoot('tallyback-land-int-sibling-');
    // The sibling gets a real git repo with the merged-into-main history.
    await initRepoWithFeatureMerged(siblingRoot);
    // The primary's bound path does NOT exist — the integration must come from the
    // sibling. We never call mkdir on `primaryRoot`; that's the point.
    await (await import('node:fs/promises')).rm(primaryRoot, { recursive: true, force: true });

    const resolve = createGitResolver(bindingsFor(primaryRoot, siblingRoot));
    const result = await resolve({
      repository_id: REPO_ID,
      workspace_id: PRIMARY_WSP_ID,
      branch: 'feature',
      target_branch: 'main',
    });
    expect(result.status).toBe('integrated');
    if (result.status === 'integrated') {
      // The reason names the sibling that proved it, not the primary that was gone.
      expect(result.reason).toContain('sibling');
      expect(result.reason).toContain(SIBLING_WSP_ID);
    }
  });

  it('fails closed (preserves path_unavailable) when the primary is gone and no sibling can prove integration', async () => {
    const primaryRoot = join(await tempRoot('tallyback-land-int-no-sib-primary-'), 'worktree');
    const siblingRoot = await tempRoot('tallyback-land-int-no-sib-sibling-');
    // Sibling gets a repo where `feature` is NOT in main's history (different commit).
    await initGitRepo(siblingRoot);
    await execFileAsync('git', ['-C', siblingRoot, 'checkout', '-q', '-b', 'feature']);
    await writeFile(join(siblingRoot, 'unrelated.txt'), 'z', 'utf8');
    await execFileAsync('git', ['-C', siblingRoot, 'add', '.']);
    await execFileAsync('git', ['-C', siblingRoot, 'commit', '-q', '-m', 'unrelated work']);
    // Primary's bound path does NOT exist (and never did).
    await (await import('node:fs/promises')).rm(primaryRoot, { recursive: true, force: true });

    const resolve = createGitResolver(bindingsFor(primaryRoot, siblingRoot));
    const result = await resolve({
      repository_id: REPO_ID,
      workspace_id: PRIMARY_WSP_ID,
      branch: 'feature',
      target_branch: 'main',
    });
    expect(result.status).toBe('unresolved');
    if (result.status === 'unresolved') {
      // Preserve the original primary failure code (fail closed).
      expect(result.code).toBe('path_unavailable');
    }
  });

  it('fails closed when the primary is gone and there are no sibling workspaces bound to the repository', async () => {
    const primaryRoot = join(await tempRoot('tallyback-land-int-sole-'), 'worktree');
    // Primary's bound path does NOT exist.
    await (await import('node:fs/promises')).rm(primaryRoot, { recursive: true, force: true });

    // Bindings: only the primary workspace for this repo — no sibling to ask.
    const resolve = createGitResolver(bindingsFor(primaryRoot, null));
    const result = await resolve({
      repository_id: REPO_ID,
      workspace_id: PRIMARY_WSP_ID,
      branch: 'feature',
      target_branch: 'main',
    });
    expect(result.status).toBe('unresolved');
    if (result.status === 'unresolved') {
      expect(result.code).toBe('path_unavailable');
    }
  });
});

// ---------------------------------------------------------------------------
// Sibling fallback: POSITIVE-PROOF ONLY (per SPEC §5.2 — Workspaces sharing a
// repository_id may be independent clones with different ref freshness).
// ---------------------------------------------------------------------------

describe('createGitResolver — sibling fallback is positive-proof only (independent clones)', () => {
  // Use workspace_ids whose lexical order DELIBERATELY puts the stale/non-proving
  // clone first, so the regression test proves the implementation does not stop after
  // the first negative sibling answer.
  const REPO_ID = 'repo_0190b1c0-0000-7000-8000-000000000099';
  const PRIMARY_WSP_ID = 'wsp_0190b1c0-0000-7000-8000-00000000zzzz'; // lexically LAST
  const SIBLING_STALE_WSP_ID = 'wsp_0190b1c0-0000-7000-8000-00000000aaaa'; // lexically FIRST
  const SIBLING_FRESH_WSP_ID = 'wsp_0190b1c0-0000-7000-8000-00000000bbbb'; // lexically SECOND

  /**
   * Build a source repository at `sourceRoot` with two branches:
   *   - main: starts at commit X
   *   - feature: commit Y on top of X
   * (Caller is responsible for the optional fast-forward of main to feature later.)
   */
  async function initSourceRepo(sourceRoot: string): Promise<void> {
    await initGitRepo(sourceRoot);
    await execFileAsync('git', ['-C', sourceRoot, 'checkout', '-q', '-b', 'feature']);
    await writeFile(join(sourceRoot, 'f.txt'), 'y', 'utf8');
    await execFileAsync('git', ['-C', sourceRoot, 'add', '.']);
    await execFileAsync('git', ['-C', sourceRoot, 'commit', '-q', '-m', 'feature work']);
    await execFileAsync('git', ['-C', sourceRoot, 'checkout', '-q', 'main']);
  }

  /**
   * `git clone <source> <dest>`. Local filesystem clone — no remote fetch required.
   * The clone sees main at whatever point the source was when this was called.
   */
  async function gitClone(source: string, dest: string): Promise<void> {
    await execFileAsync('git', ['clone', '-q', source, dest]);
  }

  function bindingsForTwoSiblings(
    primaryRoot: string | null,
    staleRoot: string,
    freshRoot: string,
  ) {
    const entries: Record<string, { root: string }> = {
      [SIBLING_STALE_WSP_ID]: { root: staleRoot },
      [SIBLING_FRESH_WSP_ID]: { root: freshRoot },
    };
    if (primaryRoot !== null) entries[PRIMARY_WSP_ID] = { root: primaryRoot };
    return {
      bindings: {
        repositories: { [REPO_ID]: { workspaces: entries } },
      },
    };
  }

  it('first sibling does not prove integration; later sibling does — still returns integrated', async () => {
    // Per SPEC §5.2: one `repository_id` may have multiple Workspaces that are
    // INDEPENDENT CLONES at different filesystem locations. They do NOT share one
    // object database or one ref namespace. This regression test reproduces the bug
    // where the fallback assumed all siblings share an object database and short-
    // circuited on the first negative sibling answer.
    //
    // Scenario:
    //   - source repo has main = X, feature = Y (Y branched from X).
    //   - clone-a is taken BEFORE the merge — its main = X (Y is not in main).
    //     `git merge-base --is-ancestor feature main` from clone-a returns false.
    //   - source merges feature into main → main = X+Y.
    //   - clone-b is taken AFTER the merge — its main = X+Y. After `git fetch origin
    //     feature:feature` (or a fresh clone of the post-merge state), the local
    //     `feature` ref exists, and `merge-base --is-ancestor feature main` is true.
    //
    // The lexical order of bindings is deliberate: `aaaa` < `bbbb`, so the iteration
    // order in `trySiblingIntegrationProof` is clone-a FIRST, then clone-b. The bug
    // would short-circuit on clone-a's negative answer and return `unresolved`. The
    // fix iterates past clone-a to clone-b and finds the integration proof.
    const sourceRoot = await tempRoot('tallyback-land-pp-source-');
    await initSourceRepo(sourceRoot);

    // Take clone-a BEFORE merging feature into main.
    const staleRoot = await tempRoot('tallyback-land-pp-stale-');
    await gitClone(sourceRoot, staleRoot);

    // Merge feature into main, then take clone-b AFTER the merge.
    await execFileAsync('git', ['-C', sourceRoot, 'merge', '--ff-only', 'feature']);
    const freshRoot = await tempRoot('tallyback-land-pp-fresh-');
    await gitClone(sourceRoot, freshRoot);
    // clone-b has `origin/main` and `origin/feature`; create a local `feature` ref so
    // `git merge-base --is-ancestor feature main` resolves it directly.
    await execFileAsync('git', ['-C', freshRoot, 'branch', 'feature', 'origin/feature']);

    // Primary worktree bound path does NOT exist — the integration must come from a
    // sibling workspace.
    const primaryRoot = join(await tempRoot('tallyback-land-pp-primary-'), 'worktree');
    await (await import('node:fs/promises')).rm(primaryRoot, { recursive: true, force: true });

    const resolve = createGitResolver(bindingsForTwoSiblings(primaryRoot, staleRoot, freshRoot));
    const result = await resolve({
      repository_id: REPO_ID,
      workspace_id: PRIMARY_WSP_ID,
      branch: 'feature',
      target_branch: 'main',
    });
    expect(result.status).toBe('integrated');
    if (result.status === 'integrated') {
      // The reason names the sibling that proved it. Critically, it must NOT name
      // the stale clone — the lexical-first sibling.
      expect(result.reason).toContain('sibling');
      expect(result.reason).toContain(SIBLING_FRESH_WSP_ID);
      expect(result.reason).not.toContain(SIBLING_STALE_WSP_ID);
    }
  });

  it('multiple siblings resolve but none proves integration → preserves original primary failure', async () => {
    // Two stale clones — neither has main containing feature. The fallback should
    // exhaust every sibling, find no positive proof, and preserve the primary's
    // original `path_unavailable`. It must NOT fabricate an "integrated" verdict out
    // of silence.
    const sourceRoot = await tempRoot('tallyback-land-multi-stale-source-');
    await initSourceRepo(sourceRoot);
    // Do NOT merge feature into main — both clones see main = X.
    const staleRootA = await tempRoot('tallyback-land-multi-stale-a-');
    const staleRootB = await tempRoot('tallyback-land-multi-stale-b-');
    await gitClone(sourceRoot, staleRootA);
    await gitClone(sourceRoot, staleRootB);

    const primaryRoot = join(await tempRoot('tallyback-land-multi-stale-primary-'), 'worktree');
    await (await import('node:fs/promises')).rm(primaryRoot, { recursive: true, force: true });

    const resolve = createGitResolver(bindingsForTwoSiblings(primaryRoot, staleRootA, staleRootB));
    const result = await resolve({
      repository_id: REPO_ID,
      workspace_id: PRIMARY_WSP_ID,
      branch: 'feature',
      target_branch: 'main',
    });
    expect(result.status).toBe('unresolved');
    if (result.status === 'unresolved') {
      expect(result.code).toBe('path_unavailable');
    }
  });

  it('Git unavailable on a sibling does not fabricate integration; later sibling still gets to try', async () => {
    // Create a "broken" sibling whose bound path is a directory but not a git
    // repository. The resolver's `checkIntegration` on this sibling returns null
    // (git-related failure treated as "cannot determine"). The fallback must skip
    // it (NOT return `{ integrated: false }`) and continue to the next sibling.
    // The next sibling (a real git clone with feature in main) provides the proof.
    const sourceRoot = await tempRoot('tallyback-land-unavail-source-');
    await initSourceRepo(sourceRoot);
    await execFileAsync('git', ['-C', sourceRoot, 'merge', '--ff-only', 'feature']);
    const freshRoot = await tempRoot('tallyback-land-unavail-fresh-');
    await gitClone(sourceRoot, freshRoot);
    await execFileAsync('git', ['-C', freshRoot, 'branch', 'feature', 'origin/feature']);

    const brokenRoot = await tempRoot('tallyback-land-unavail-broken-');
    // Just an empty directory — no git init. resolveWorkspace's `inspectWorktree`
    // path returns a `not_a_git_repository` resolution code; `runGit` here would
    // return `check_error` and `gitMergeBaseIsAncestor` returns `false` (NOT `null`,
    // because `check_error` is not `environment_unavailable`). Either way, the bug
    // would have stopped the loop on the first negative answer; the fix continues.
    const fs = await import('node:fs/promises');
    await fs.mkdir(brokenRoot, { recursive: true });
    await fs.writeFile(join(brokenRoot, '.placeholder'), 'x', 'utf8');

    const primaryRoot = join(await tempRoot('tallyback-land-unavail-primary-'), 'worktree');
    await fs.rm(primaryRoot, { recursive: true, force: true });

    const resolve = createGitResolver(bindingsForTwoSiblings(primaryRoot, brokenRoot, freshRoot));
    const result = await resolve({
      repository_id: REPO_ID,
      workspace_id: PRIMARY_WSP_ID,
      branch: 'feature',
      target_branch: 'main',
    });
    // Even if the broken sibling answers "not integrated" (or git errors out), the
    // fallback MUST continue to the fresh sibling and find the positive proof.
    expect(result.status).toBe('integrated');
    if (result.status === 'integrated') {
      expect(result.reason).toContain(SIBLING_FRESH_WSP_ID);
    }
  });
});
