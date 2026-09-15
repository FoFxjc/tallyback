/**
 * Watch: on-demand lost/inconsistent detection over open Attempts
 * (`docs/watch-design.md`).
 *
 * `src/watch/report.ts`'s unit tests drive `buildWatchReport` with a fake, injected
 * `WatchResolver` — mirroring `test/land.test.ts` — so none of these need a real `git`
 * worktree. Only the real-git and CLI-level tests need the genuine article.
 */

import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { createWatchResolver } from '../src/watch/git.js';
import { buildWatchReport, type WatchResolver } from '../src/watch/report.js';
import { ALICE, buildLedger, tempRoot } from './helpers/ledger.js';

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

const NOT_STALE_POLICY = { now: new Date().toISOString(), staleAfterMs: 48 * 60 * 60 * 1000 };

/** A resolver that never flags lost/unresolved/inconsistent — always plenty of commits. */
const ALWAYS_FINE_RESOLVER: WatchResolver = () => ({ status: 'commits', count: 3 });

describe('buildWatchReport', () => {
  it('produces no findings for an open attempt with no claim and nothing else amiss', async () => {
    const fixture = await buildLedger('tallyback-watch-clean-');

    // A fresh attempt with no claim: buildLedger's fixture attempt already carries a claim,
    // and a Workspace can back at most one open Attempt at a time
    // (`invariant.workspace_exclusivity`), so this needs its own second workspace.
    const ws = await fixture.store.registerWorkspace({
      repository_id: fixture.repository_id,
      branch: 'main',
    });
    if (!ws.ok) throw new Error('registerWorkspace failed');
    const dispatched = await fixture.store.dispatch({
      task_id: fixture.task_id,
      declaration_id: fixture.declaration_id,
      repository_id: fixture.repository_id,
      workspace_id: ws.workspace.workspace_id,
      executor: { kind: 'executor', id: 'agent-8' },
      dispatched_by: ALICE,
    });
    if (!dispatched.ok) throw new Error('dispatch failed');

    const resolver: WatchResolver = () => ({ status: 'commits', count: 0 });
    const report = await buildWatchReport(
      fixture.store.currentSnapshot(),
      resolver,
      NOT_STALE_POLICY,
    );

    const forSecondAttempt = report.findings.filter(
      (f) => f.attempt_id === dispatched.attempt.attempt_id,
    );
    expect(forSecondAttempt).toHaveLength(0);
  });

  it('reports lost when the resolver reports the workspace does not resolve', async () => {
    const fixture = await buildLedger('tallyback-watch-lost-');

    const resolver: WatchResolver = () => ({
      status: 'unresolved',
      code: 'resolution.path_unavailable',
      reason: 'worktree root does not exist',
    });
    const report = await buildWatchReport(
      fixture.store.currentSnapshot(),
      resolver,
      NOT_STALE_POLICY,
    );

    const lost = report.findings.filter(
      (f) => f.attempt_id === fixture.attempt_id && f.kind === 'lost',
    );
    expect(lost).toHaveLength(1);
    expect(lost[0]).toMatchObject({
      task_id: fixture.task_id,
      code: 'resolution.path_unavailable',
    });
    expect(report.summary.lost).toBe(1);
  });

  it('reports inconsistent when a claim exists but the resolver reports zero commits since dispatch', async () => {
    const fixture = await buildLedger('tallyback-watch-inconsistent-');
    // buildLedger's fixture attempt already has a claim (fixture.claim_id).

    const resolver: WatchResolver = () => ({ status: 'commits', count: 0 });
    const report = await buildWatchReport(
      fixture.store.currentSnapshot(),
      resolver,
      NOT_STALE_POLICY,
    );

    const inconsistent = report.findings.filter(
      (f) => f.attempt_id === fixture.attempt_id && f.kind === 'inconsistent',
    );
    expect(inconsistent).toHaveLength(1);
    expect(inconsistent[0]!.detail).toMatchObject({ claim_count: 1 });
    expect(report.summary.inconsistent).toBe(1);
  });

  it('reports no inconsistent finding when the resolver reports commits since dispatch', async () => {
    const fixture = await buildLedger('tallyback-watch-consistent-');

    const report = await buildWatchReport(
      fixture.store.currentSnapshot(),
      ALWAYS_FINE_RESOLVER,
      NOT_STALE_POLICY,
    );

    const inconsistent = report.findings.filter(
      (f) => f.attempt_id === fixture.attempt_id && f.kind === 'inconsistent',
    );
    expect(inconsistent).toHaveLength(0);
    expect(report.summary.inconsistent).toBe(0);
  });

  it('excludes an ended attempt entirely, even one the resolver would otherwise flag', async () => {
    const fixture = await buildLedger('tallyback-watch-ended-');

    const ended = await fixture.store.endAttempt({
      attempt_id: fixture.attempt_id,
      outcome: 'returned',
      reported_by: ALICE,
    });
    expect(ended.ok).toBe(true);

    const resolver: WatchResolver = () => ({
      status: 'unresolved',
      code: 'resolution.path_unavailable',
      reason: 'would be lost, if considered',
    });
    const report = await buildWatchReport(
      fixture.store.currentSnapshot(),
      resolver,
      NOT_STALE_POLICY,
    );

    expect(report.findings.filter((f) => f.attempt_id === fixture.attempt_id)).toHaveLength(0);
    expect(report.summary.open_attempts).toBe(0);
  });

  it('excludes an attempt covered by an effective Settlement entirely', async () => {
    const fixture = await buildLedger('tallyback-watch-settled-');

    const settled = await fixture.store.settle({
      task_id: fixture.task_id,
      attempt_id: fixture.attempt_id,
      decision: 'accept',
      decided_by: ALICE,
      basis: { verdict_id: null, attempt_end_id: null, blocker_ids: [] },
      verification_exception: 'accepted by hand for watch test fixture',
      rationale: 'test fixture: settlement closes the attempt out',
    });
    expect(settled.ok).toBe(true);

    const resolver: WatchResolver = () => ({
      status: 'unresolved',
      code: 'resolution.path_unavailable',
      reason: 'would be lost, if considered',
    });
    const report = await buildWatchReport(
      fixture.store.currentSnapshot(),
      resolver,
      NOT_STALE_POLICY,
    );

    expect(report.findings.filter((f) => f.attempt_id === fixture.attempt_id)).toHaveLength(0);
    expect(report.summary.open_attempts).toBe(0);
  });

  it('reports stale for a task past the stale policy window', async () => {
    const fixture = await buildLedger('tallyback-watch-stale-');

    // Every record in this ledger is timestamped "now" at fixture build time, so a
    // far-future `now` with a zero window makes the task unconditionally stale.
    const policy = { now: '2100-01-01T00:00:00.000Z', staleAfterMs: 0 };
    const report = await buildWatchReport(
      fixture.store.currentSnapshot(),
      ALWAYS_FINE_RESOLVER,
      policy,
    );

    const stale = report.findings.filter(
      (f) => f.attempt_id === fixture.attempt_id && f.kind === 'stale',
    );
    expect(stale).toHaveLength(1);
    expect(report.summary.stale).toBe(1);
  });

  it('reports unresolved when the Workspace has no branch field', async () => {
    const fixture = await buildLedger('tallyback-watch-nobranch-');

    const ws = await fixture.store.registerWorkspace({ repository_id: fixture.repository_id });
    if (!ws.ok) throw new Error('registerWorkspace failed');
    const dispatched = await fixture.store.dispatch({
      task_id: fixture.task_id,
      declaration_id: fixture.declaration_id,
      repository_id: fixture.repository_id,
      workspace_id: ws.workspace.workspace_id,
      executor: { kind: 'executor', id: 'agent-9' },
      dispatched_by: ALICE,
    });
    if (!dispatched.ok) throw new Error('dispatch failed');

    // The fixture's own attempt is also open and calls the resolver with its bound branch
    // ("main") — only the new, branchless workspace's call should see `branch: undefined`.
    const resolver: WatchResolver = (input) => {
      if (input.workspace_id === ws.workspace.workspace_id) {
        expect(input.branch).toBeUndefined();
        return { status: 'no_branch' };
      }
      return { status: 'commits', count: 1 };
    };
    const report = await buildWatchReport(
      fixture.store.currentSnapshot(),
      resolver,
      NOT_STALE_POLICY,
    );

    const unresolved = report.findings.filter(
      (f) => f.attempt_id === dispatched.attempt.attempt_id && f.kind === 'unresolved',
    );
    expect(unresolved).toHaveLength(1);
    expect(report.summary.unresolved).toBe(1);
  });
});

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

describe('tallyback watch (CLI)', () => {
  it('runs against an open ledger and returns valid JSON, read-only', async () => {
    const root = await tempRoot('tallyback-watch-cli-');

    const initRun = await runRaw(root, ['init', '--repository', 'main']);
    expect(initRun.code).toBe(0);

    // No dispatch set up here — there are no open Attempts and no real git worktree bound,
    // so this proves the command wires up end to end without needing full ledger + git
    // plumbing (same posture as land's CLI test).
    const run = await runRaw(root, ['watch']);
    expect(run.code).toBe(0);

    const parsed = JSON.parse(run.stdout) as {
      generated_from_revision: number;
      policy: { stale_after_ms: number };
      findings: unknown[];
      summary: { open_attempts: number };
    };
    expect(typeof parsed.generated_from_revision).toBe('number');
    expect(parsed.findings).toEqual([]);
    expect(parsed.summary.open_attempts).toBe(0);
  }, 30_000);
});

describe('createWatchResolver — commits-since-dispatch check (real git)', () => {
  const REPO_ID = 'repo_0190b1c0-0000-7000-8000-000000000002';
  const WSP_ID = 'wsp_0190b1c0-0000-7000-8000-000000000002';

  function bindingsFor(root: string) {
    return {
      bindings: {
        repositories: { [REPO_ID]: { workspaces: { [WSP_ID]: { root } } } },
      },
    };
  }

  it('reports zero commits since a timestamp after the only commit', async () => {
    const root = await tempRoot('tallyback-watch-git-');
    await initGitRepo(root);

    const resolve = createWatchResolver(bindingsFor(root));
    const result = await resolve({
      repository_id: REPO_ID,
      workspace_id: WSP_ID,
      branch: 'main',
      // A minute after the commit, not a far-future date: some `git` builds mishandle
      // `--since` values in the far future (observed with year-2100 cutoffs) and fail to
      // filter at all, which would make this assertion pass for the wrong reason.
      since: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(result).toEqual({ status: 'commits', count: 0 });
  });

  it('reports nonzero commits since a timestamp before a new commit', async () => {
    const root = await tempRoot('tallyback-watch-git-');
    await initGitRepo(root);
    // `git --since` has one-second resolution, so without a gap the init commit and this
    // capture can land in the same second and both get counted.
    await new Promise((r) => setTimeout(r, 1100));
    const since = new Date().toISOString();
    await writeFile(join(root, 'g.txt'), 'y', 'utf8');
    await execFileAsync('git', ['-C', root, 'add', '.']);
    await execFileAsync('git', ['-C', root, 'commit', '-q', '-m', 'later work']);

    const resolve = createWatchResolver(bindingsFor(root));
    const result = await resolve({
      repository_id: REPO_ID,
      workspace_id: WSP_ID,
      branch: 'main',
      since,
    });
    expect(result).toEqual({ status: 'commits', count: 1 });
  });

  it('reports unresolved when the workspace binding does not exist', async () => {
    const resolve = createWatchResolver({ bindings: { repositories: {} } });
    const result = await resolve({
      repository_id: REPO_ID,
      workspace_id: WSP_ID,
      branch: 'main',
      since: new Date().toISOString(),
    });
    expect(result.status).toBe('unresolved');
  });
});
