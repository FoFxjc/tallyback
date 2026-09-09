/**
 * Cross-process single-writer concurrency.
 *
 * The defect this suite pins down: with only an in-process mutex, two Store instances
 * opened at the same revision can both "successfully" write revision N+1, and the second
 * write silently destroys the first. The fix is a filesystem-backed lock plus an
 * expected-revision check against the snapshot re-read **from disk while holding it**.
 *
 * The tests below therefore assert the observable consequences, not the mechanism:
 * one writer wins, the stale writer is told `mutation.revision_conflict`, and reopening
 * the ledger still shows the winner's record.
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { Store } from '../src/ledger/index.js';
import { acquireLock, LockError, type LockOptions } from '../src/ledger/lock.js';
import { storeLockPath } from '../src/ledger/snapshot.js';
import { buildLedger, tempRoot } from './helpers/ledger.js';

const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

describe('two Store instances writing from the same starting revision', () => {
  it('lets the first win, rejects the stale writer, and preserves the first write', async () => {
    const { root, store: first, topic_id } = await buildLedger('tallyback-conc-');

    // A second, independently opened Store — the case an in-process mutex cannot see.
    const second = await Store.open(root);

    const startingRevision = first.currentRevision();
    expect(second.currentRevision()).toBe(startingRevision);

    // Both writers pin the SAME expected revision. Exactly one may win.
    const winner = await first.createTask({
      topic_id,
      title: 'written by the first store',
      alias: 'W1',
    });
    const loser = await second.createTask(
      { topic_id, title: 'written by the second store', alias: 'W2' },
      startingRevision,
    );

    expect(winner.ok).toBe(true);
    expect(loser.ok).toBe(false);
    if (winner.ok) expect(winner.revision).toBe(startingRevision + 1);
    if (!loser.ok) expect(loser.code).toBe('mutation.revision_conflict');

    // No lost update: reopening from disk shows the winner's record, and only one new task.
    const reopened = await Store.open(root);
    expect(reopened.currentRevision()).toBe(startingRevision + 1);
    const titles = reopened.listTasks().map((t) => t.title);
    expect(titles).toContain('written by the first store');
    expect(titles).not.toContain('written by the second store');
  });

  it('rejects a stale writer even when its own in-memory revision looks current', async () => {
    const { root, store: first, topic_id } = await buildLedger('tallyback-conc-');
    const stale = await Store.open(root);
    const startingRevision = stale.currentRevision();

    // The ledger advances twice behind `stale`'s back.
    expect((await first.createTask({ topic_id, title: 'a' })).ok).toBe(true);
    expect((await first.createTask({ topic_id, title: 'b' })).ok).toBe(true);

    // `stale` still believes it is at the starting revision.
    expect(stale.currentRevision()).toBe(startingRevision);
    const rejected = await stale.createTask({ topic_id, title: 'c' }, startingRevision);
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.code).toBe('mutation.revision_conflict');

    const reopened = await Store.open(root);
    expect(reopened.listTasks().map((t) => t.title)).toEqual(expect.arrayContaining(['a', 'b']));
    expect(reopened.listTasks().map((t) => t.title)).not.toContain('c');
  });

  it('serializes unpinned appends from two instances without losing either', async () => {
    const { root, store: first, topic_id } = await buildLedger('tallyback-conc-');
    const second = await Store.open(root);
    const startingRevision = first.currentRevision();

    // Neither pins a revision, so each resolves "current" under the lock. Both must land.
    const [a, b] = await Promise.all([
      first.createTask({ topic_id, title: 'unpinned-a' }),
      second.createTask({ topic_id, title: 'unpinned-b' }),
    ]);

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (a.ok && b.ok) {
      // Two distinct revisions: the revision increments exactly once per accepted append.
      expect(new Set([a.revision, b.revision]).size).toBe(2);
      expect(Math.max(a.revision, b.revision)).toBe(startingRevision + 2);
    }

    const reopened = await Store.open(root);
    const titles = reopened.listTasks().map((t) => t.title);
    expect(titles).toContain('unpinned-a');
    expect(titles).toContain('unpinned-b');
  });
});

describe('the lock is a real cross-process lock', () => {
  it('serializes writers in separate OS processes with no lost updates', async () => {
    const { root, store } = await buildLedger('tallyback-xproc-');
    const startingRevision = store.currentRevision();
    const perWriter = 4;
    const writer = join(HERE, 'helpers', 'concurrent-writer.ts');
    const tsx = join(ROOT, 'node_modules', '.bin', 'tsx');

    const runs = await Promise.all(
      ['p1', 'p2', 'p3'].map((label) =>
        execFileAsync(tsx, [writer, root, label, String(perWriter)], { cwd: ROOT }),
      ),
    );

    const reported = runs.map((r) => JSON.parse(r.stdout.trim()) as { revisions: number[] });
    const revisions = reported.flatMap((r) => r.revisions);
    expect(revisions).toHaveLength(3 * perWriter);
    // Every accepted append got its own revision: nothing was overwritten.
    expect(new Set(revisions).size).toBe(revisions.length);

    const reopened = await Store.open(root);
    expect(reopened.currentRevision()).toBe(startingRevision + 3 * perWriter);
    for (const label of ['p1', 'p2', 'p3']) {
      for (let i = 0; i < perWriter; i++) {
        expect(reopened.listTasks().map((t) => t.title)).toContain(`${label}-${i}`);
      }
    }
  }, 60_000);

  it('blocks an append while another holder owns the lock file', async () => {
    const { root, store, topic_id } = await buildLedger('tallyback-lockheld-');
    const held = await acquireLock(storeLockPath(join(root, '.tallyback')), {});

    // Keep the wait short: the point is that it waits at all rather than proceeding.
    const engine = store as unknown as { lockOptions: LockOptions };
    engine.lockOptions = { timeoutMs: 150, pollMs: 10, staleMs: 60_000 };

    await expect(store.createTask({ topic_id, title: 'blocked' })).rejects.toMatchObject({
      code: 'mutation.lock_unavailable',
    });

    await held.release();
    // With the lock released, the same append succeeds.
    const after = await store.createTask({ topic_id, title: 'unblocked' });
    expect(after.ok).toBe(true);
  });
});

describe('stale-lock policy', () => {
  it('breaks a lock whose holder process is gone on this host', async () => {
    const root = await tempRoot('tallyback-stale-');
    const lockPath = join(root, 'runtime', 'store.lock');
    await mkdir(dirname(lockPath), { recursive: true });
    // A holder record naming a PID that cannot exist: the writer died.
    await writeFile(
      lockPath,
      JSON.stringify({
        nonce: 'abandoned',
        pid: 2 ** 30,
        host: (await import('node:os')).hostname(),
        acquired_at: new Date().toISOString(),
      }),
      'utf8',
    );

    const handle = await acquireLock(lockPath, { timeoutMs: 2_000, pollMs: 5 });
    expect(handle.holder.pid).toBe(process.pid);
    await handle.release();
    expect(existsSync(lockPath)).toBe(false);
  });

  it('breaks an unreadable lock only once it is older than the stale window', async () => {
    const root = await tempRoot('tallyback-stale-');
    const lockPath = join(root, 'runtime', 'store.lock');
    await mkdir(dirname(lockPath), { recursive: true });
    await writeFile(lockPath, 'not json at all', 'utf8');

    // Fresh + unreadable: not yet assumed abandoned, so acquisition times out.
    await expect(
      acquireLock(lockPath, { timeoutMs: 120, pollMs: 10, staleMs: 60_000 }),
    ).rejects.toBeInstanceOf(LockError);

    // Past the stale window, the same lock is broken and acquired.
    const handle = await acquireLock(lockPath, { timeoutMs: 2_000, pollMs: 5, staleMs: 0 });
    await handle.release();
  });

  it('does not steal a lock that was re-taken between the decision and the delete', async () => {
    const root = await tempRoot('tallyback-stale-');
    const lockPath = join(root, 'runtime', 'store.lock');
    await mkdir(dirname(lockPath), { recursive: true });
    // A live holder from "another host" — not this host's PID space, and not yet stale.
    await writeFile(
      lockPath,
      JSON.stringify({
        nonce: 'other',
        pid: process.pid,
        host: 'some-other-host',
        acquired_at: new Date().toISOString(),
      }),
      'utf8',
    );
    await expect(
      acquireLock(lockPath, { timeoutMs: 100, pollMs: 10, staleMs: 60_000 }),
    ).rejects.toBeInstanceOf(LockError);
    // The other holder's lock file is untouched.
    expect(JSON.parse(await readFile(lockPath, 'utf8')).nonce).toBe('other');
  });

  it('releases the lock even when the guarded operation throws', async () => {
    const { root, store } = await buildLedger('tallyback-release-');
    const lockPath = storeLockPath(join(root, '.tallyback'));

    const engine = store as unknown as {
      withLock<T>(fn: () => Promise<T>): Promise<T>;
    };
    await expect(
      engine.withLock(async () => {
        expect(existsSync(lockPath)).toBe(true);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(existsSync(lockPath)).toBe(false);
  });
});
