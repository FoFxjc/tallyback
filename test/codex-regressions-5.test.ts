/**
 * Regressions for the six defects found by the fifth Codex review.
 *
 * This round's fixes:
 *
 * 1. `acquireLock` enforces `timeoutMs` on EVERY retry path, not only the "still held,
 *    not stale" branch. A stale lock that cannot actually be unlinked (a read-only
 *    filesystem, or a lost break-lock race) no longer spins forever.
 * 2. `scripts/manifest.ts`'s `listFiles` computes every file's path relative to the
 *    ORIGINAL directory the caller asked about, not the immediate subdirectory a
 *    recursive call happens to be scanning — so `fixtures/mutations/accepted/foo.json`
 *    is recorded as that full relative path, not just `foo.json`.
 * 3. `appendNow` skips the `state.json` write entirely for a fully idempotent replay
 *    (`appendedCount === 0`): TB-ID-003 promises a no-op, and a no-op must not depend on
 *    the file being writable at all.
 * 4. `reloadUnderLock` refreshes the journal sequence counter on EVERY reload, not only
 *    when `state.json`'s revision changed — a journal-only event (a rejection, or a
 *    replay) can land without moving that revision at all.
 * 5. `resolveWorkspace` reports a missing bindings file as `repository_unbound` (the
 *    documented "nothing bound yet" state), reserving `environment_unavailable` for a
 *    bindings file that exists but could not be read or parsed.
 * 6. `ready_to_land` additionally requires the cited Verdict (when the basis is
 *    verdict-based) to be `finality: 'final'` — a `land` Settlement built on a still-
 *    preliminary Verdict is no longer reported as ready.
 */

import { execFile } from 'node:child_process';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { resolveWorkspace } from '../src/check/resolution.js';
import { acquireLock, LockError } from '../src/ledger/lock.js';
import { Store } from '../src/ledger/index.js';
import { computeProjectionValues } from '../src/ledger/projections.js';
import { newId } from '../src/ledger/snapshot.js';
import { buildManifest, CONTRACT } from '../scripts/manifest.js';
import type { Settlement, Snapshot, Verdict } from '../src/contract/index.js';
import { buildLedger, tempRoot } from './helpers/ledger.js';

const execFileAsync = promisify(execFile);

async function initGitRepo(root: string): Promise<void> {
  await execFileAsync('git', ['-C', root, 'init', '-q']);
  await execFileAsync('git', ['-C', root, 'config', 'user.email', 'a@b.c']);
  await execFileAsync('git', ['-C', root, 'config', 'user.name', 'x']);
  await writeFile(join(root, 'f.txt'), 'x', 'utf8');
  await execFileAsync('git', ['-C', root, 'add', '.']);
  await execFileAsync('git', ['-C', root, 'commit', '-q', '-m', 'init']);
}

describe('codex-5 finding 1 — the lock timeout is enforced on every retry path', () => {
  it('fails within timeoutMs when a stale lock cannot actually be broken', async () => {
    const root = await tempRoot('tallyback-c5a-');
    const dir = join(root, 'runtime');
    await mkdir(dir, { recursive: true });
    const lockPath = join(dir, 'store.lock');
    await writeFile(
      lockPath,
      JSON.stringify({
        nonce: 'dead',
        pid: 2 ** 30,
        host: 'nonexistent-host',
        acquired_at: new Date().toISOString(),
      }),
      'utf8',
    );
    // A read-only directory: `unlink` inside `breakIfUnchanged` will fail every time.
    await chmod(dir, 0o555);

    const start = Date.now();
    try {
      await expect(
        acquireLock(lockPath, { timeoutMs: 400, pollMs: 5, staleMs: 0 }),
      ).rejects.toBeInstanceOf(LockError);
      expect(Date.now() - start).toBeLessThan(3000);
    } finally {
      await chmod(dir, 0o755);
    }
  }, 10_000);

  it('still succeeds normally once the stale lock CAN be broken', async () => {
    const root = await tempRoot('tallyback-c5a-');
    const dir = join(root, 'runtime');
    await mkdir(dir, { recursive: true });
    const lockPath = join(dir, 'store.lock');
    await writeFile(
      lockPath,
      JSON.stringify({
        nonce: 'dead',
        pid: 2 ** 30,
        host: 'somehost',
        acquired_at: new Date().toISOString(),
      }),
      'utf8',
    );
    const handle = await acquireLock(lockPath, { timeoutMs: 2000, pollMs: 5, staleMs: 0 });
    expect(handle.holder.pid).toBe(process.pid);
    await handle.release();
  });
});

describe('codex-5 finding 2 — manifest directory digests preserve subdirectory prefixes', () => {
  it('records fixture paths with their full relative subdirectory prefix', async () => {
    const manifest = buildManifest();
    expect(manifest.artifacts['fixtures']).toBeDefined();
    // The committed manifest.json must be exactly what the (now-fixed) generator produces.
    const committed = JSON.parse(await readFile(join(CONTRACT, 'manifest.json'), 'utf8')) as {
      artifacts: { fixtures: { digest: { value: string } } };
    };
    expect(committed.artifacts.fixtures.digest.value).toBe(
      manifest.artifacts['fixtures']!.digest.value,
    );
  });
});

describe('codex-5 finding 3 — an idempotent replay never touches state.json', () => {
  class FaultyStore extends Store {
    failSnapshotWrite = false;
    protected override async writeSnapshotFile(snapshot: Snapshot): Promise<void> {
      if (this.failSnapshotWrite) throw new Error('injected write failure');
      await super.writeSnapshotFile(snapshot);
    }
  }

  it('succeeds even when writeSnapshotFile would throw', async () => {
    const fixture = await buildLedger('tallyback-c5c-');
    const store = new FaultyStore(fixture.root);
    await store.load();
    const existingTask = store.currentSnapshot().tasks[0]!;

    store.failSnapshotWrite = true;
    const outcome = await store.append({
      kind: 'append_records',
      expected_revision: store.currentRevision(),
      records: [existingTask],
      provenance: { submitted_by: { kind: 'tool', id: 'tallyback' } },
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.appendedCount).toBe(0);
  });

  it('does not change state.json bytes for a pure replay', async () => {
    const fixture = await buildLedger('tallyback-c5c-');
    const path = join(fixture.root, '.tallyback', 'state.json');
    const before = await readFile(path, 'utf8');
    const existingTask = fixture.store.currentSnapshot().tasks[0]!;
    const outcome = await fixture.store.append({
      kind: 'append_records',
      expected_revision: fixture.store.currentRevision(),
      records: [existingTask],
      provenance: { submitted_by: { kind: 'tool', id: 'tallyback' } },
    });
    expect(outcome.ok).toBe(true);
    expect(await readFile(path, 'utf8')).toBe(before);
  });

  it('still persists normally when there IS something new to append', async () => {
    const fixture = await buildLedger('tallyback-c5c-');
    const outcome = await fixture.store.createTask({ topic_id: fixture.topic_id, title: 'real' });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.revision).toBe(fixture.store.currentRevision());
  });
});

describe('codex-5 finding 4 — journal sequence never collides across Store instances', () => {
  it('does not reuse a seq after a rejected append on another instance', async () => {
    const fixture = await buildLedger('tallyback-c5d-');
    const a = fixture.store;
    const b = await Store.open(fixture.root);

    const rejected = await a.createTask({ topic_id: fixture.topic_id, title: 'x' }, 999999);
    expect(rejected.ok).toBe(false);

    const accepted = await b.createTask({ topic_id: fixture.topic_id, title: 'y' });
    expect(accepted.ok).toBe(true);

    const lines = (await readFile(join(fixture.root, '.tallyback', 'history.jsonl'), 'utf8'))
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as { seq: number });
    const seqs = lines.map((l) => l.seq);
    expect(new Set(seqs).size).toBe(seqs.length);
  });

  it('does not reuse a seq after an idempotent replay on another instance', async () => {
    const fixture = await buildLedger('tallyback-c5d-');
    const a = fixture.store;
    const b = await Store.open(fixture.root);
    const existingTask = a.currentSnapshot().tasks[0]!;

    const replayed = await a.append({
      kind: 'append_records',
      expected_revision: a.currentRevision(),
      records: [existingTask],
      provenance: { submitted_by: { kind: 'tool', id: 'tallyback' } },
    });
    expect(replayed.ok).toBe(true);

    const accepted = await b.createTask({ topic_id: fixture.topic_id, title: 'y' });
    expect(accepted.ok).toBe(true);

    const lines = (await readFile(join(fixture.root, '.tallyback', 'history.jsonl'), 'utf8'))
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as { seq: number });
    const seqs = lines.map((l) => l.seq);
    expect(new Set(seqs).size).toBe(seqs.length);
  });
});

describe('codex-5 finding 5 — a missing bindings file is repository_unbound', () => {
  it('reports repository_unbound, not environment_unavailable, when the file is absent', async () => {
    const root = await tempRoot('tallyback-c5e-');
    const missingPath = join(root, 'runtime', 'bindings.json');
    const result = await resolveWorkspace(
      'repo_0190b1c0-0000-7000-8000-000000000001',
      'wsp_0190b1c0-0000-7000-8000-000000000001',
      { bindingsPath: missingPath },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('repository_unbound');
  });

  it('still reports environment_unavailable for a bindings file that exists but is malformed', async () => {
    const root = await tempRoot('tallyback-c5e-');
    const path = join(root, 'runtime', 'bindings.json');
    await mkdir(join(root, 'runtime'), { recursive: true });
    await writeFile(path, '{ not json', 'utf8');
    const result = await resolveWorkspace(
      'repo_0190b1c0-0000-7000-8000-000000000001',
      'wsp_0190b1c0-0000-7000-8000-000000000001',
      { bindingsPath: path },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('environment_unavailable');
  });

  it('still resolves when a well-formed bindings file is provided', async () => {
    const root = await tempRoot('tallyback-c5e-');
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
});

describe('codex-5 finding 6 — ready_to_land requires a final verdict, not just decision:land', () => {
  function verdict(
    overrides: Partial<Verdict> & Pick<Verdict, 'verdict_id' | 'finality'>,
  ): Verdict {
    return {
      subject: { kind: 'claim', id: 'clm_0190b1c0-0000-7000-8000-000000000001' },
      declaration_id: 'dcl_0190b1c0-0000-7000-8000-000000000001',
      scope: { evaluated_criteria: [], unevaluated_criteria: [] },
      conclusion: 'supported',
      basis: { evidence_ids: [], reconciliation_ids: [] },
      findings: [
        {
          criterion_id: 'cri_0190b1c0-0000-7000-8000-000000000001',
          assessment: 'supported',
          summary: 's',
          basis_refs: [],
        },
      ],
      confidence: { level: 'high', rationale: 'r' },
      rationale: 'r',
      uncertainty: [],
      limitations: [],
      issued_by: { kind: 'tool', id: 'tallyback-check' },
      issued_at: null,
      ...overrides,
    };
  }

  function landSettlement(overrides: Partial<Settlement>): Settlement {
    return {
      settlement_id: newId('set_'),
      task_id: 'tsk_0190b1c0-0000-7000-8000-000000000001',
      attempt_id: 'att_0190b1c0-0000-7000-8000-000000000001',
      decision: 'land',
      decided_by: { kind: 'human', id: 'alice' },
      decided_at: null,
      basis: { verdict_id: null, attempt_end_id: null, blocker_ids: [] },
      verification_exception: null,
      rationale: 'r',
      ...overrides,
    };
  }

  it('does not mark ready_to_land for a preliminary verdict basis', async () => {
    const fixture = await buildLedger('tallyback-c5f-');
    const snap = structuredClone(fixture.store.currentSnapshot()) as Snapshot;
    const v = verdict({ verdict_id: newId('ver_'), finality: 'preliminary' });
    snap.verdicts.push(v);
    snap.settlements.push(
      landSettlement({
        task_id: fixture.task_id,
        attempt_id: fixture.attempt_id,
        basis: { verdict_id: v.verdict_id, attempt_end_id: null, blocker_ids: [] },
      }),
    );
    const values = computeProjectionValues(snap);
    expect(values.ready_to_land).not.toContain(fixture.task_id);
    // But it still counts as settled — that projection is unaffected.
    expect(values.settled[fixture.task_id]).toBeTruthy();
  });

  it('marks ready_to_land for a final verdict basis', async () => {
    const fixture = await buildLedger('tallyback-c5f-');
    const snap = structuredClone(fixture.store.currentSnapshot()) as Snapshot;
    const v = verdict({ verdict_id: newId('ver_'), finality: 'final' });
    snap.verdicts.push(v);
    snap.settlements.push(
      landSettlement({
        task_id: fixture.task_id,
        attempt_id: fixture.attempt_id,
        basis: { verdict_id: v.verdict_id, attempt_end_id: null, blocker_ids: [] },
      }),
    );
    const values = computeProjectionValues(snap);
    expect(values.ready_to_land).toContain(fixture.task_id);
  });

  it('marks ready_to_land for an explicit verification_exception, with no verdict at all', async () => {
    const fixture = await buildLedger('tallyback-c5f-');
    const snap = structuredClone(fixture.store.currentSnapshot()) as Snapshot;
    snap.settlements.push(
      landSettlement({
        task_id: fixture.task_id,
        attempt_id: fixture.attempt_id,
        basis: { verdict_id: null, attempt_end_id: null, blocker_ids: [] },
        verification_exception: 'manually verified',
      }),
    );
    const values = computeProjectionValues(snap);
    expect(values.ready_to_land).toContain(fixture.task_id);
  });

  it('does not mark ready_to_land for a non-land decision regardless of finality', async () => {
    const fixture = await buildLedger('tallyback-c5f-');
    const snap = structuredClone(fixture.store.currentSnapshot()) as Snapshot;
    const v = verdict({ verdict_id: newId('ver_'), finality: 'final' });
    snap.verdicts.push(v);
    snap.settlements.push(
      landSettlement({
        task_id: fixture.task_id,
        attempt_id: fixture.attempt_id,
        decision: 'accept',
        basis: { verdict_id: v.verdict_id, attempt_end_id: null, blocker_ids: [] },
      }),
    );
    const values = computeProjectionValues(snap);
    expect(values.ready_to_land).not.toContain(fixture.task_id);
  });
});
