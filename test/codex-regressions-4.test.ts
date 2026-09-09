/**
 * Regressions for the five defects found by the fourth Codex review.
 *
 * This round's fixes:
 *
 * 1. `Store.beginCheckFor` pins its append to exactly the revision it hashed into
 *    `evaluated_snapshot`, rather than letting `submit` resolve "current" fresh inside
 *    the lock. A concurrent writer now forces `mutation.revision_conflict` instead of
 *    silently recording an invocation whose `evaluated_snapshot` names a revision the
 *    Store no longer retains anywhere.
 * 2. `produceCheckOutput` validates a caller-supplied `options.snapshot` override against
 *    the invocation's frozen `evaluated_snapshot` (project, revision, digest) before
 *    handing it to the checker, throwing `MismatchedEvaluatedSnapshotError` on a mismatch.
 * 3. `reconcileLedger`'s write path now plans and writes from ONE snapshot read under ONE
 *    lock acquisition, instead of planning outside the lock and only comparing conflict
 *    *keys* on the way back in — which could discard unrelated out-of-band content whose
 *    presence didn't change the conflict key set.
 * 4. `verifyRepositoryIdentity` validates `.tallyback/project.json` against
 *    `project.schema.json` before reading any field off it, so a structurally malformed
 *    manifest (`repositories` not an array, or containing `null`) returns the documented
 *    `observed_context_mismatch` instead of throwing out of a resolution path.
 * 5. `Store.currentManifest()` returns a deeply frozen object, matching
 *    `currentSnapshot()`, so a caller cannot mutate the header `assertHeadersAgree` later
 *    compares a reloaded `state.json` against.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { produceCheckOutput, runCheck, type Checker } from '../src/check/flow.js';
import { resolveWorkspace } from '../src/check/resolution.js';
import { acquireLock } from '../src/ledger/lock.js';
import { reconcileLedger, Store } from '../src/ledger/index.js';
import { storeLockPath } from '../src/ledger/snapshot.js';
import type { Snapshot } from '../src/contract/index.js';
import { buildLedger, tempRoot } from './helpers/ledger.js';

const execFileAsync = promisify(execFile);
const CHECKER = { id: 'done-or-not', version: '1' } as const;

async function initGitRepo(root: string): Promise<void> {
  await execFileAsync('git', ['-C', root, 'init', '-q']);
  await execFileAsync('git', ['-C', root, 'config', 'user.email', 'a@b.c']);
  await execFileAsync('git', ['-C', root, 'config', 'user.name', 'x']);
  await writeFile(join(root, 'f.txt'), 'x', 'utf8');
  await execFileAsync('git', ['-C', root, 'add', '.']);
  await execFileAsync('git', ['-C', root, 'commit', '-q', '-m', 'init']);
}

describe('codex-4 finding 1 — beginCheckFor is pinned to the revision it hashed', () => {
  it('forces a revision conflict when another writer already advanced the ledger', async () => {
    const fixture = await buildLedger('tallyback-c4a-');
    const readRevision = fixture.store.currentRevision();

    // A second, independent Store instance commits FIRST, fully sequenced (no race). Its
    // write does not touch `fixture.store`'s in-memory copy — that only refreshes on
    // `fixture.store`'s own next append or explicit reload, exactly the staleness window
    // a genuine concurrent writer would also see.
    const interloper = await Store.open(fixture.root);
    expect(
      (await interloper.createTask({ topic_id: fixture.topic_id, title: 'committed first' })).ok,
    ).toBe(true);

    // `fixture.store` still believes it is at `readRevision`, and beginCheckFor reads its
    // (stale) in-memory snapshot synchronously before ever touching the lock.
    expect(fixture.store.currentRevision()).toBe(readRevision);
    const begun = await fixture.store.beginCheckFor({
      claim_id: fixture.claim_id,
      checker: CHECKER,
    });

    expect(begun.ok).toBe(false);
    if (!begun.ok) expect(begun.code).toBe('mutation.revision_conflict');
    // Only the interloper's commit advanced the ledger; the rejected attempt added nothing.
    expect((await Store.open(fixture.root)).currentRevision()).toBe(readRevision + 1);
  });

  it('succeeds normally with no contention, and evaluated_snapshot matches reality', async () => {
    const fixture = await buildLedger('tallyback-c4a-');
    const before = fixture.store.currentRevision();
    const begun = await fixture.store.beginCheckFor({
      claim_id: fixture.claim_id,
      checker: CHECKER,
    });
    expect(begun.ok).toBe(true);
    if (!begun.ok) return;
    expect(begun.evaluated_snapshot.revision).toBe(before);
    expect(begun.revision).toBe(before + 1);
  });

  it('rejects a caller-supplied expected_revision that is already stale', async () => {
    const fixture = await buildLedger('tallyback-c4a-');
    const stale = fixture.store.currentRevision() - 0; // pretend caller read an old value
    await fixture.store.createTask({ topic_id: fixture.topic_id, title: 'advance first' });
    const begun = await fixture.store.beginCheckFor({
      claim_id: fixture.claim_id,
      checker: CHECKER,
      expected_revision: stale,
    });
    expect(begun.ok).toBe(false);
    if (!begun.ok) expect(begun.code).toBe('mutation.revision_conflict');
  });
});

describe('codex-4 finding 2 — a supplied snapshot override is verified against evaluated_snapshot', () => {
  it('throws when the override is from an unrelated ledger', async () => {
    const fixture = await buildLedger('tallyback-c4b-');
    const unrelated = await buildLedger('tallyback-c4b-other-');
    const checkerFn: Checker = () => ({
      kind: 'failed',
      reason: 'should never run',
      reconciliations: [],
      evidence: [],
    });

    await expect(
      produceCheckOutput({
        subject: { kind: 'claim', id: fixture.claim_id },
        checker: CHECKER,
        checkerFn,
        store: fixture.store,
        resolution: {} as never,
        snapshot: unrelated.store.currentSnapshot(),
      }),
    ).rejects.toMatchObject({ name: 'MismatchedEvaluatedSnapshotError' });
  });

  it('throws when the override is a stale revision of the SAME ledger', async () => {
    const fixture = await buildLedger('tallyback-c4b-');
    const staleSnapshot = fixture.store.currentSnapshot();
    // Advance the ledger so `staleSnapshot` is genuinely behind current.
    await fixture.store.createTask({ topic_id: fixture.topic_id, title: 'advance' });

    const checkerFn: Checker = () => ({
      kind: 'failed',
      reason: 'x',
      reconciliations: [],
      evidence: [],
    });
    await expect(
      produceCheckOutput({
        subject: { kind: 'claim', id: fixture.claim_id },
        checker: CHECKER,
        checkerFn,
        store: fixture.store,
        resolution: {} as never,
        snapshot: staleSnapshot,
      }),
    ).rejects.toMatchObject({ name: 'MismatchedEvaluatedSnapshotError' });
  });

  it('still accepts a genuinely matching override', async () => {
    const fixture = await buildLedger('tallyback-c4b-');
    let sawProjectId: string | null = null;
    const checkerFn: Checker = (input) => {
      sawProjectId = (input.snapshot as Snapshot).project.project_id;
      return { kind: 'failed', reason: 'x', reconciliations: [], evidence: [] };
    };
    const outcome = await runCheck({
      subject: { kind: 'claim', id: fixture.claim_id },
      checker: CHECKER,
      checkerFn,
      store: fixture.store,
      resolution: {} as never,
      snapshot: fixture.store.currentSnapshot(),
    });
    expect(outcome.recorded).toBe(true);
    expect(sawProjectId).toBe(fixture.project_id);
  });

  it('does not validate anything when no override is supplied (the frozen snapshot is used)', async () => {
    const fixture = await buildLedger('tallyback-c4b-');
    const checkerFn: Checker = () => ({
      kind: 'failed',
      reason: 'x',
      reconciliations: [],
      evidence: [],
    });
    const outcome = await runCheck({
      subject: { kind: 'claim', id: fixture.claim_id },
      checker: CHECKER,
      checkerFn,
      store: fixture.store,
      resolution: {} as never,
    });
    expect(outcome.recorded).toBe(true);
  });
});

describe('codex-4 finding 3 — reconcile plans and writes from one locked read', () => {
  const A = 'dcl_0190b1c0-0000-7000-8000-00000000000a';
  const B = 'dcl_0190b1c0-0000-7000-8000-00000000000b';

  async function forkOnDisk(
    root: string,
    task_id: string,
    keptDeclarationId: string,
  ): Promise<void> {
    const path = join(root, '.tallyback', 'state.json');
    const snapshot = JSON.parse(await readFile(path, 'utf8')) as Snapshot;
    const base = snapshot.declarations[0]!;
    for (const [id, suffix] of [
      [A, 'a'],
      [B, 'b'],
    ] as const) {
      const branch = structuredClone(base);
      branch.declaration_id = id;
      branch.task_id = task_id;
      branch.supersedes = keptDeclarationId;
      branch.criteria = [
        {
          ...branch.criteria[0]!,
          criterion_id: `cri_0190b1c0-0000-7000-8000-00000000000${suffix}`,
        },
      ];
      snapshot.declarations.push(branch);
    }
    snapshot.declarations.sort((x, y) => (x.declaration_id < y.declaration_id ? -1 : 1));
    await writeFile(path, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  }

  it('preserves an out-of-band addition that lands after planning but before the lock', async () => {
    const fixture = await buildLedger('tallyback-c4c-');
    await forkOnDisk(fixture.root, fixture.task_id, fixture.declaration_id);
    const path = join(fixture.root, '.tallyback', 'state.json');

    // Hold the lock so reconcileLedger's write path blocks at acquireLock — precisely
    // the window between "read snapshot" and "write it back" that must not lose data.
    const held = await acquireLock(storeLockPath(join(fixture.root, '.tallyback')), {});
    const reconcilePromise = reconcileLedger({ projectRoot: fixture.root, keep: [A] });
    await new Promise((r) => setTimeout(r, 50));

    const snapshot = JSON.parse(await readFile(path, 'utf8')) as Snapshot & {
      tasks: { task_id: string }[];
    };
    snapshot.tasks.push({
      task_id: 'tsk_0190b1c0-0000-7000-8000-0000000000cc',
      topic_id: fixture.topic_id,
      title: 'appeared out-of-band while reconciliation was planning',
    } as never);
    snapshot.tasks.sort((x, y) => (x.task_id < y.task_id ? -1 : 1));
    await writeFile(path, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    await held.release();

    const result = await reconcilePromise;
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.wrote).toBe(true);

    const after = JSON.parse(await readFile(path, 'utf8')) as { tasks: unknown[] };
    expect(after.tasks).toHaveLength(2); // both the original task AND the out-of-band one
  });

  it('still refuses a genuinely stale plan whose conflict itself changed underneath it', async () => {
    const fixture = await buildLedger('tallyback-c4d-');
    await forkOnDisk(fixture.root, fixture.task_id, fixture.declaration_id);
    const path = join(fixture.root, '.tallyback', 'state.json');

    const held = await acquireLock(storeLockPath(join(fixture.root, '.tallyback')), {});
    const reconcilePromise = reconcileLedger({ projectRoot: fixture.root, keep: [A] });
    await new Promise((r) => setTimeout(r, 50));

    // Someone else resolves the SAME fork differently while this one was planning.
    const snapshot = JSON.parse(await readFile(path, 'utf8')) as Snapshot;
    const bDecl = snapshot.declarations.find((d) => d.declaration_id === B)!;
    bDecl.supersedes = A; // already resolved the other way
    await writeFile(path, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    await held.release();

    const result = await reconcilePromise;
    // Either it re-derives successfully against the now-different (already resolved)
    // state, or it reports there is nothing left to reconcile — either is correct, but
    // it must never blindly overwrite with the STALE plan's snapshot body.
    if (result.ok) {
      const after = JSON.parse(await readFile(path, 'utf8')) as Snapshot;
      const a = after.declarations.find((d) => d.declaration_id === A)!;
      expect(a.supersedes).toBe(B);
    }
  });

  it('a normal dry run still works without touching the lock', async () => {
    const fixture = await buildLedger('tallyback-c4e-');
    await forkOnDisk(fixture.root, fixture.task_id, fixture.declaration_id);
    const outcome = await reconcileLedger({ projectRoot: fixture.root, keep: [A], dryRun: true });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.wrote).toBe(false);
  });
});

describe('codex-4 finding 4 — a malformed project.json manifest fails closed, not open', () => {
  it('returns observed_context_mismatch for repositories that is not an array', async () => {
    const root = await tempRoot('tallyback-c4f-');
    await initGitRepo(root);
    await mkdir(join(root, '.tallyback'), { recursive: true });
    await writeFile(
      join(root, '.tallyback', 'project.json'),
      JSON.stringify({ project_id: 'prj_x', repositories: {} }),
      'utf8',
    );
    const result = await resolveWorkspace(
      'repo_0190b1c0-0000-7000-8000-000000000001',
      'wsp_0190b1c0-0000-7000-8000-000000000001',
      {
        bindings: {
          repositories: {
            'repo_0190b1c0-0000-7000-8000-000000000001': {
              workspaces: { 'wsp_0190b1c0-0000-7000-8000-000000000001': { root } },
            },
          },
        },
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('observed_context_mismatch');
  });

  it('returns observed_context_mismatch for a repositories array containing null', async () => {
    const root = await tempRoot('tallyback-c4f-');
    await initGitRepo(root);
    await mkdir(join(root, '.tallyback'), { recursive: true });
    await writeFile(
      join(root, '.tallyback', 'project.json'),
      JSON.stringify({ project_id: 'prj_x', repositories: [null] }),
      'utf8',
    );
    const result = await resolveWorkspace(
      'repo_0190b1c0-0000-7000-8000-000000000001',
      'wsp_0190b1c0-0000-7000-8000-000000000001',
      {
        bindings: {
          repositories: {
            'repo_0190b1c0-0000-7000-8000-000000000001': {
              workspaces: { 'wsp_0190b1c0-0000-7000-8000-000000000001': { root } },
            },
          },
        },
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('observed_context_mismatch');
  });

  it('still resolves normally when no manifest is present', async () => {
    const root = await tempRoot('tallyback-c4f-');
    await initGitRepo(root);
    const result = await resolveWorkspace(
      'repo_0190b1c0-0000-7000-8000-000000000001',
      'wsp_0190b1c0-0000-7000-8000-000000000001',
      {
        bindings: {
          repositories: {
            'repo_0190b1c0-0000-7000-8000-000000000001': {
              workspaces: { 'wsp_0190b1c0-0000-7000-8000-000000000001': { root } },
            },
          },
        },
      },
    );
    expect(result.ok).toBe(true);
  });

  it('still resolves normally when the manifest correctly declares the repository', async () => {
    const root = await tempRoot('tallyback-c4f-');
    await initGitRepo(root);
    await mkdir(join(root, '.tallyback'), { recursive: true });
    await writeFile(
      join(root, '.tallyback', 'project.json'),
      JSON.stringify({
        project_id: 'prj_0190b1c0-0000-7000-8000-000000000001',
        repositories: [
          { repository_id: 'repo_0190b1c0-0000-7000-8000-000000000001', alias: 'main' },
        ],
      }),
      'utf8',
    );
    const result = await resolveWorkspace(
      'repo_0190b1c0-0000-7000-8000-000000000001',
      'wsp_0190b1c0-0000-7000-8000-000000000001',
      {
        bindings: {
          repositories: {
            'repo_0190b1c0-0000-7000-8000-000000000001': {
              workspaces: { 'wsp_0190b1c0-0000-7000-8000-000000000001': { root } },
            },
          },
        },
      },
    );
    expect(result.ok).toBe(true);
  });
});

describe('codex-4 finding 5 — currentManifest() is deeply frozen', () => {
  it('throws when a caller tries to mutate it', async () => {
    const fixture = await buildLedger('tallyback-c4g-');
    const manifest = fixture.store.currentManifest() as unknown as { project_id: string };
    const before = manifest.project_id;
    expect(() => {
      manifest.project_id = 'prj_TAMPERED';
    }).toThrow(TypeError);
    expect(fixture.store.currentManifest().project_id).toBe(before);
  });

  it('cannot have its repositories array mutated either', async () => {
    const fixture = await buildLedger('tallyback-c4g-');
    const manifest = fixture.store.currentManifest();
    expect(() => {
      (manifest.repositories as unknown[]).push({ repository_id: 'x', alias: 'y' });
    }).toThrow(TypeError);
  });
});
