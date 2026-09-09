/**
 * Regressions for the five defects found by the second Codex review.
 *
 * One of them (finding 3) was a regression introduced by the *previous* round's fix: the
 * occupancy guard added to `migration commit` blocked the resumable path it was supposed
 * to protect. That is exactly the class of thing a second review pass is for.
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { applyMigration, stageMigration } from '../src/check/migration-workflow.js';
import { acquireLock } from '../src/ledger/lock.js';
import { Store } from '../src/ledger/index.js';
import { lastActivityAt } from '../src/ledger/projections.js';
import type { Snapshot } from '../src/contract/index.js';
import { buildLedger, tempRoot } from './helpers/ledger.js';

const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const TSX = join(ROOT, 'node_modules', '.bin', 'tsx');
const CLI = join(ROOT, 'src', 'cli.ts');

async function cli(root: string, args: string[]): Promise<{ code: number; stdout: string }> {
  try {
    const { stdout } = await execFileAsync(TSX, [CLI, ...args, '--project-root', root], {
      cwd: ROOT,
    });
    return { code: 0, stdout };
  } catch (err) {
    const e = err as { code?: number; stdout?: string };
    return { code: e.code ?? 1, stdout: e.stdout ?? '' };
  }
}

describe('codex-2 finding 1 — a rejected mutation exits non-zero', () => {
  it('fails the shell when a command returns ok:false', async () => {
    const root = await tempRoot('tallyback-c2a-');
    await cli(root, ['init', '--repository', 'main']);

    const rejected = await cli(root, [
      'task',
      '--topic-id',
      'top_00000000-0000-7000-8000-000000000000',
      '--title',
      'a task on a topic that does not exist',
    ]);
    expect(rejected.code).toBe(1);
    // The machine-readable body is still on stdout for a caller that wants it.
    const body = JSON.parse(rejected.stdout) as { ok: boolean; code: string };
    expect(body.ok).toBe(false);
    expect(body.code).toBe('invariant.reference_unresolved');
  }, 60_000);

  it('still exits zero when the mutation lands', async () => {
    const root = await tempRoot('tallyback-c2a-');
    const init = await cli(root, ['init', '--repository', 'main', '--topic', 'release']);
    const topicId = (JSON.parse(init.stdout) as { topics: { topic_id: string }[] }).topics[0]!
      .topic_id;
    const ok = await cli(root, ['task', '--topic-id', topicId, '--title', 'a real task']);
    expect(ok.code).toBe(0);
    expect((JSON.parse(ok.stdout) as { ok: boolean }).ok).toBe(true);
  }, 60_000);

  it('chains correctly in a shell: a rejected step stops the sequence', async () => {
    const root = await tempRoot('tallyback-c2a-');
    await cli(root, ['init', '--repository', 'main']);
    // `cmd1 && cmd2` must not run cmd2 — the whole point of the exit code.
    const chained = await execFileAsync(
      '/bin/sh',
      [
        '-c',
        `"${TSX}" "${CLI}" task --topic-id top_00000000-0000-7000-8000-000000000000 ` +
          `--title x --project-root "${root}" > /dev/null 2>&1 && echo RAN_SECOND || echo STOPPED`,
      ],
      { cwd: ROOT },
    );
    expect(chained.stdout.trim()).toBe('STOPPED');
  }, 60_000);
});

describe('codex-2 finding 2 — stale-lock breaking is serialized', () => {
  it('lets exactly one of many contenders break and hold an abandoned lock', async () => {
    const root = await tempRoot('tallyback-c2b-');
    const lockPath = join(root, 'runtime', 'store.lock');
    await mkdir(join(root, 'runtime'), { recursive: true });
    // A dead local holder: every contender will judge it abandoned at the same moment.
    await writeFile(
      lockPath,
      JSON.stringify({
        nonce: 'abandoned',
        pid: 2 ** 30,
        host: hostname(),
        acquired_at: new Date().toISOString(),
      }),
      'utf8',
    );

    const contenders = await Promise.all(
      Array.from({ length: 8 }, () =>
        acquireLock(lockPath, { timeoutMs: 4_000, pollMs: 1, staleMs: 0 })
          .then((h) => ({ ok: true as const, h }))
          .catch(() => ({ ok: false as const })),
      ),
    );
    const winners = contenders.filter((c) => c.ok);
    // Whoever believes they hold the lock must actually own the file on disk.
    for (const winner of winners) {
      if (!winner.ok) continue;
      const onDisk = JSON.parse(await readFile(lockPath, 'utf8')) as { nonce: string };
      expect(onDisk.nonce).toBe(winner.h.holder.nonce);
      await winner.h.release();
    }
    expect(winners).toHaveLength(1);
  }, 30_000);

  it('cleans up the break lock it uses', async () => {
    const root = await tempRoot('tallyback-c2b-');
    const lockPath = join(root, 'runtime', 'store.lock');
    await mkdir(join(root, 'runtime'), { recursive: true });
    await writeFile(
      lockPath,
      JSON.stringify({
        nonce: 'dead',
        pid: 2 ** 30,
        host: hostname(),
        acquired_at: new Date().toISOString(),
      }),
      'utf8',
    );
    const handle = await acquireLock(lockPath, { timeoutMs: 2_000, pollMs: 5, staleMs: 0 });
    await handle.release();
    expect(existsSync(`${lockPath}.break`)).toBe(false);
  });
});

describe('codex-2 finding 3 — a migration interrupted after the snapshot write resumes', () => {
  const LEGACY = { topics: [{ name: 'legacy', tasks: [{ id: 'T1', title: 'a legacy task' }] }] };

  it('completes when state.json is already the staged snapshot', async () => {
    const root = await tempRoot('tallyback-c2c-');
    expect((await stageMigration({ projectRoot: root, legacy: LEGACY, source: 'l.json' })).ok).toBe(
      true,
    );
    const staged = (await import('../src/check/migration-workflow.js')).readStagedMigration;
    const marker = await staged(root);
    expect(marker).not.toBeNull();

    // Reproduce the crash point: the snapshot landed, the report and marker did not.
    const { writeProject, writeSnapshot, ledgerRoot } = await import('../src/ledger/snapshot.js');
    await writeProject(ledgerRoot(root), marker!.manifest);
    await writeSnapshot(ledgerRoot(root), marker!.snapshot);
    expect(existsSync(join(root, '.tallyback', 'state.json'))).toBe(true);
    expect(existsSync(join(root, '.tallyback', 'migration-report.json'))).toBe(false);

    const resumed = await applyMigration({ projectRoot: root, legacy: LEGACY, source: 'l.json' });
    expect(resumed.ok).toBe(true);
    if (!resumed.ok) return;
    expect(resumed.resumed).toBe(true);
    // The migration is now genuinely finished: report written, marker gone, ledger opens.
    expect(existsSync(join(root, '.tallyback', 'migration-report.json'))).toBe(true);
    expect(await staged(root)).toBeNull();
    expect((await Store.open(root)).resolveTaskAlias('T1')).not.toBeNull();
  });

  it('still refuses when the occupying ledger is somebody else’s', async () => {
    const root = await tempRoot('tallyback-c2c-');
    expect((await stageMigration({ projectRoot: root, legacy: LEGACY, source: 'l.json' })).ok).toBe(
      true,
    );
    // A different ledger appears — not the staged snapshot.
    await Store.init(root, { repositories: [{ alias: 'main' }] });
    const outcome = await applyMigration({ projectRoot: root, legacy: LEGACY, source: 'l.json' });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('mutation.migration_target_occupied');
  });

  it('still refuses a plain re-run over an unrelated ledger', async () => {
    const { root } = await buildLedger('tallyback-c2c-');
    const outcome = await applyMigration({ projectRoot: root, legacy: LEGACY, source: 'l.json' });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('mutation.migration_target_occupied');
  });
});

describe('codex-2 finding 4 — a changed state.json is revalidated before it is adopted', () => {
  it('refuses to append onto a snapshot that was edited into invalidity', async () => {
    const fixture = await buildLedger('tallyback-c2d-');
    const path = join(fixture.root, '.tallyback', 'state.json');
    const snapshot = JSON.parse(await readFile(path, 'utf8')) as Snapshot;
    (snapshot.tasks[0] as unknown as Record<string, unknown>)['bogus_property'] = 'injected';
    snapshot.revision += 1;
    snapshot.included_through = snapshot.revision;
    await writeFile(path, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

    await expect(
      fixture.store.createTask({ topic_id: fixture.topic_id, title: 'built on tampered state' }),
    ).rejects.toMatchObject({ code: 'schema.unknown_property' });

    // The tampered property was never carried forward and re-persisted.
    const after = JSON.parse(await readFile(path, 'utf8')) as Snapshot;
    expect(after.tasks).toHaveLength(snapshot.tasks.length);
  });

  it('refuses when a fork is merged into state.json under a live Store', async () => {
    const fixture = await buildLedger('tallyback-c2d-');
    const path = join(fixture.root, '.tallyback', 'state.json');
    const snapshot = JSON.parse(await readFile(path, 'utf8')) as Snapshot;
    const branch = structuredClone(snapshot.declarations[0]!);
    branch.declaration_id = 'dcl_0190b1c0-0000-7000-8000-00000000000a';
    branch.supersedes = fixture.declaration_id;
    branch.criteria = [
      { ...branch.criteria[0]!, criterion_id: 'cri_0190b1c0-0000-7000-8000-00000000000a' },
    ];
    const other = structuredClone(branch);
    other.declaration_id = 'dcl_0190b1c0-0000-7000-8000-00000000000b';
    other.criteria = [
      { ...branch.criteria[0]!, criterion_id: 'cri_0190b1c0-0000-7000-8000-00000000000b' },
    ];
    snapshot.declarations.push(branch, other);
    snapshot.declarations.sort((a, b) => (a.declaration_id < b.declaration_id ? -1 : 1));
    snapshot.revision += 1;
    snapshot.included_through = snapshot.revision;
    await writeFile(path, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

    await expect(
      fixture.store.createTask({ topic_id: fixture.topic_id, title: 'after a merge' }),
    ).rejects.toMatchObject({ code: 'invariant.supersession_conflict' });
  });

  it('still adopts a legitimate concurrent write from another Store', async () => {
    const fixture = await buildLedger('tallyback-c2d-');
    const other = await Store.open(fixture.root);
    expect(
      (await other.createTask({ topic_id: fixture.topic_id, title: 'from elsewhere' })).ok,
    ).toBe(true);
    // The first Store reloads, revalidates, and appends on top without complaint.
    const mine = await fixture.store.createTask({ topic_id: fixture.topic_id, title: 'from me' });
    expect(mine.ok).toBe(true);
    expect(fixture.store.listTasks().map((t) => t.title)).toEqual(
      expect.arrayContaining(['from elsewhere', 'from me']),
    );
  });

  it('refuses when project.json stops agreeing with a reloaded state.json', async () => {
    const fixture = await buildLedger('tallyback-c2d-');
    const path = join(fixture.root, '.tallyback', 'state.json');
    const snapshot = JSON.parse(await readFile(path, 'utf8')) as Snapshot;
    snapshot.project.project_id = 'prj_0190b1c0-0000-7000-8000-0000000000ff';
    for (const topic of snapshot.topics) topic.project_id = snapshot.project.project_id;
    snapshot.revision += 1;
    snapshot.included_through = snapshot.revision;
    await writeFile(path, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

    await expect(
      fixture.store.createTask({ topic_id: fixture.topic_id, title: 'x' }),
    ).rejects.toMatchObject({ code: 'invariant.project_identity_mismatch' });
  });
});

describe('codex-2 finding 5 — activity timestamps compare as instants', () => {
  /**
   * `lastActivityAt` scans every record type that references the task, so the fixture's
   * own wall-clock timestamps have to be pinned out of the way first; otherwise the test
   * measures "now" rather than the comparison under test.
   */
  async function pinnedSnapshot(): Promise<{ snapshot: Snapshot; taskId: string }> {
    const fixture = await buildLedger('tallyback-c2e-');
    const snapshot = structuredClone(fixture.store.currentSnapshot()) as Snapshot;
    const FLOOR = '2020-01-01T00:00:00Z';
    for (const attempt of snapshot.attempts) attempt.dispatched_at = FLOOR;
    for (const declaration of snapshot.declarations) declaration.declared_at = FLOOR;
    for (const claim of snapshot.claims) claim.claimed_at = FLOOR;
    for (const end of snapshot.attempt_ends) end.ended_at = FLOOR;
    for (const settlement of snapshot.settlements) settlement.decided_at = FLOOR;
    for (const blocker of snapshot.blockers) blocker.raised_at = FLOOR;
    for (const resolution of snapshot.blocker_resolutions) resolution.resolved_at = FLOOR;
    for (const decision of snapshot.decisions) decision.decided_at = FLOOR;
    return { snapshot, taskId: fixture.task_id };
  }

  it('orders offset timestamps chronologically, not lexicographically', async () => {
    const { snapshot, taskId } = await pinnedSnapshot();

    // `+02:00` sorts AFTER `Z` as a string but happens 90 minutes EARLIER.
    const earlierInstant = '2026-01-01T01:00:00+02:00'; // = 2025-12-31T23:00:00Z
    const laterInstant = '2026-01-01T00:30:00Z';
    expect(earlierInstant > laterInstant).toBe(true); // the trap
    expect(Date.parse(earlierInstant) < Date.parse(laterInstant)).toBe(true);

    snapshot.declarations[0]!.declared_at = earlierInstant;
    snapshot.claims[0]!.claimed_at = laterInstant;

    // String order would answer with the `+02:00` value; instant order answers correctly.
    expect(lastActivityAt(snapshot, taskId)).toBe(laterInstant);
  });

  it('is symmetric — the same pair in the other position gives the same answer', async () => {
    const { snapshot, taskId } = await pinnedSnapshot();
    snapshot.declarations[0]!.declared_at = '2026-01-01T00:30:00Z';
    snapshot.claims[0]!.claimed_at = '2026-01-01T01:00:00+02:00';
    expect(lastActivityAt(snapshot, taskId)).toBe('2026-01-01T00:30:00Z');
  });

  it('falls back to string order for an unparseable timestamp rather than dropping it', async () => {
    const { snapshot, taskId } = await pinnedSnapshot();
    snapshot.declarations[0]!.declared_at = 'not-a-timestamp';
    snapshot.claims[0]!.claimed_at = '2026-01-01T00:00:00Z';
    expect(lastActivityAt(snapshot, taskId)).toBeTruthy();
  });

  it('ignores a null timestamp (legacy provenance) without crashing', async () => {
    const { snapshot, taskId } = await pinnedSnapshot();
    snapshot.declarations[0]!.declared_at = null;
    snapshot.claims[0]!.claimed_at = '2026-01-01T00:00:00Z';
    expect(lastActivityAt(snapshot, taskId)).toBe('2026-01-01T00:00:00Z');
  });
});

void rm;
