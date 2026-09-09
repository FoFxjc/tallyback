/**
 * Regressions for the eight defects found by the second (Codex) review.
 *
 * Each test failed against the code as reviewed and passes against the fix.
 */

import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  applyMigration,
  MIGRATION_CODES,
  stageMigration,
} from '../src/check/migration-workflow.js';
import {
  produceCheckOutput,
  runCheck,
  type Checker,
  type CheckerInput,
} from '../src/check/flow.js';
import {
  digest,
  semanticSnapshotDigest,
  validate_snapshot,
  type Snapshot,
} from '../src/contract/index.js';
import { acquireLock, LockError } from '../src/ledger/lock.js';
import { Store } from '../src/ledger/index.js';
import { buildLedger, tempRoot } from './helpers/ledger.js';

const CHECKER = { id: 'done-or-not', version: '1' } as const;
const FIXTURES = join('contract', 'fixtures', 'snapshots');

const load = (kind: 'valid' | 'invalid', name: string): Snapshot =>
  JSON.parse(readFileSync(join(FIXTURES, kind, `${name}.json`), 'utf8')) as Snapshot;

describe('codex 1 — the checker evaluates the snapshot its invocation froze', () => {
  it('hands the checker revision N, not the N+1 the invocation itself created', async () => {
    const fixture = await buildLedger('tallyback-cx1-');
    let seen: CheckerInput | undefined;
    const checkerFn: Checker = (input) => {
      seen = input;
      return { kind: 'failed', reason: 'x', reconciliations: [], evidence: [] };
    };

    const produced = await produceCheckOutput({
      subject: { kind: 'claim', id: fixture.claim_id },
      checker: CHECKER,
      checkerFn,
      store: fixture.store,
      resolution: {} as never,
    });

    const frozen = produced.invocation.evaluated_snapshot;
    expect(seen).toBeDefined();
    expect((seen!.snapshot as Snapshot).revision).toBe(frozen.revision);
    // And the digest the invocation recorded really is this snapshot's digest.
    expect(semanticSnapshotDigest(seen!.snapshot as Snapshot)).toEqual(frozen.digest);
    // Recording the invocation did advance the ledger — the point is that the checker was
    // not handed that later state.
    expect(fixture.store.currentRevision()).toBe(frozen.revision + 1);
  });

  it('holds for the full runCheck path too', async () => {
    const fixture = await buildLedger('tallyback-cx1-');
    let seenRevision = -1;
    const checkerFn: Checker = (input) => {
      seenRevision = (input.snapshot as Snapshot).revision;
      return {
        kind: 'withheld',
        code: 'check.checker_semantics_missing',
        reason: 'none installed',
        reconciliations: [],
        evidence: [],
      };
    };
    const outcome = await runCheck({
      subject: { kind: 'claim', id: fixture.claim_id },
      checker: CHECKER,
      checkerFn,
      store: fixture.store,
      resolution: {} as never,
    });
    expect(seenRevision).toBe(outcome.invocation.evaluated_snapshot.revision);
    expect(outcome.recorded).toBe(true);
  });
});

describe('codex 2 — migration cannot replace a ledger that appeared after staging', () => {
  const LEGACY = { topics: [{ name: 'legacy', tasks: [{ id: 'T1', title: 'a legacy task' }] }] };

  it('refuses at commit time when the target gained a ledger while staged', async () => {
    const root = await tempRoot('tallyback-cx2-');
    expect((await stageMigration({ projectRoot: root, legacy: LEGACY, source: 'l.json' })).ok).toBe(
      true,
    );

    // Another process initializes a ledger in the window between staging and commit.
    const store = await Store.init(root, { repositories: [{ alias: 'main' }] });
    const projectId = store.currentSnapshot().project.project_id;
    const before = await readFile(join(root, '.tallyback', 'state.json'), 'utf8');

    const resumed = await applyMigration({ projectRoot: root, legacy: LEGACY, source: 'l.json' });
    expect(resumed.ok).toBe(false);
    if (!resumed.ok) expect(resumed.code).toBe(MIGRATION_CODES.TARGET_OCCUPIED);

    // The ledger that was there first is untouched.
    expect(await readFile(join(root, '.tallyback', 'state.json'), 'utf8')).toBe(before);
    expect((await Store.open(root)).currentSnapshot().project.project_id).toBe(projectId);
  });
});

describe('codex 3 — a live local lock holder is never expired by age', () => {
  it('refuses to steal a lock from a process that is provably alive', async () => {
    const root = await tempRoot('tallyback-cx3-');
    const lockPath = join(root, 'runtime', 'store.lock');
    await mkdir(join(root, 'runtime'), { recursive: true });
    await writeFile(
      lockPath,
      JSON.stringify({
        nonce: 'live-holder',
        pid: process.pid, // this very process
        host: hostname(),
        acquired_at: new Date(Date.now() - 10 * 60_000).toISOString(), // held ten minutes
      }),
      'utf8',
    );

    await expect(
      acquireLock(lockPath, { timeoutMs: 150, pollMs: 10, staleMs: 1 }),
    ).rejects.toBeInstanceOf(LockError);
    // The holder's record is intact.
    expect(JSON.parse(await readFile(lockPath, 'utf8')).nonce).toBe('live-holder');
  });

  it('still reclaims a lock whose local holder is gone, however recent', async () => {
    const root = await tempRoot('tallyback-cx3-');
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
    const handle = await acquireLock(lockPath, { timeoutMs: 2_000, pollMs: 5, staleMs: 60_000 });
    expect(handle.holder.pid).toBe(process.pid);
    await handle.release();
  });

  it('still expires a remote holder by age, since its liveness is unobservable', async () => {
    const root = await tempRoot('tallyback-cx3-');
    const lockPath = join(root, 'runtime', 'store.lock');
    await mkdir(join(root, 'runtime'), { recursive: true });
    await writeFile(
      lockPath,
      JSON.stringify({
        nonce: 'remote',
        pid: process.pid,
        host: 'some-other-host',
        acquired_at: new Date(Date.now() - 60_000).toISOString(),
      }),
      'utf8',
    );
    const handle = await acquireLock(lockPath, { timeoutMs: 2_000, pollMs: 5, staleMs: 1_000 });
    expect(handle.holder.host).toBe(hostname());
    await handle.release();
  });
});

describe('codex 4 — TB-SUP-005 concurrent unsuperseded heads are rejected', () => {
  it('rejects two live declaration heads for one task', () => {
    const result = validate_snapshot(load('invalid', 'concurrent-declaration-heads'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invariant.supersession_conflict');
  });

  it('accepts a properly superseded lineage', () => {
    expect(validate_snapshot(load('valid', 'superseded-declaration')).ok).toBe(true);
    expect(validate_snapshot(load('valid', 'superseding-declaration-retains-criterion')).ok).toBe(
      true,
    );
  });

  it('refuses a second declaration that supersedes nothing, through the Store', async () => {
    const fixture = await buildLedger('tallyback-cx4-');
    const competing = await fixture.store.declare({
      task_id: fixture.task_id,
      objective: 'a competing declaration that supersedes nothing',
      criteria: [{ code: 'c', statement: 's' }],
      declared_by: { kind: 'human', id: 'alice' },
    });
    expect(competing.ok).toBe(false);
    if (!competing.ok) expect(competing.code).toBe('invariant.supersession_conflict');

    // Declaring the revision explicitly is accepted.
    const revised = await fixture.store.declare({
      task_id: fixture.task_id,
      objective: 'the revised declaration',
      criteria: [{ code: 'c', statement: 's' }],
      declared_by: { kind: 'human', id: 'alice' },
      supersedes: fixture.declaration_id,
    });
    expect(revised.ok).toBe(true);
  });

  it('keeps separate lineages separate', async () => {
    const fixture = await buildLedger('tallyback-cx4-');
    const other = await fixture.store.createTask({
      topic_id: fixture.topic_id,
      title: 'a different task',
    });
    expect(other.ok).toBe(true);
    if (!other.ok) return;
    // A declaration for a *different* task is its own lineage, not a competing head.
    const declared = await fixture.store.declare({
      task_id: other.task.task_id,
      objective: 'its own objective',
      criteria: [{ code: 'c', statement: 's' }],
      declared_by: { kind: 'human', id: 'alice' },
    });
    expect(declared.ok).toBe(true);
  });
});

describe('codex 5 — an absolute path is rejected at validation, not only on write', () => {
  it('rejects a schema-valid snapshot carrying a machine-local path', () => {
    const result = validate_snapshot(load('invalid', 'absolute-path-in-evidence'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invariant.absolute_path_in_portable_file');
  });

  it('makes Store.open refuse a hand-written state.json containing one', async () => {
    const { root } = await buildLedger('tallyback-cx5-');
    const path = join(root, '.tallyback', 'state.json');
    const snapshot = JSON.parse(await readFile(path, 'utf8')) as Snapshot;
    (snapshot.evidence[0] as { kind: string; payload: unknown }).kind = 'file_snapshot';
    (snapshot.evidence[0] as { payload: unknown }).payload = {
      repository_id: snapshot.repositories[0]!.repository_id,
      path: '/Users/alice/secret/notes.md',
    };
    await writeFile(path, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

    await expect(Store.open(root)).rejects.toMatchObject({
      code: 'invariant.absolute_path_in_portable_file',
    });
  });

  it('leaves a repository-relative path alone', () => {
    const snapshot = structuredClone(load('invalid', 'absolute-path-in-evidence'));
    (snapshot.evidence[0] as { payload: { path: string } }).payload.path = 'src/validate.ts';
    expect(validate_snapshot(snapshot).ok).toBe(true);
  });
});

describe('codex 6 — the default evaluated_snapshot digest is the semantic one', () => {
  it('excludes the discardable projections section', async () => {
    const fixture = await buildLedger('tallyback-cx6-');
    const checkerFn: Checker = () => ({
      kind: 'failed',
      reason: 'x',
      reconciliations: [],
      evidence: [],
    });
    // No digestFn supplied: the documented default must be the §10 semantic digest.
    const produced = await produceCheckOutput({
      subject: { kind: 'claim', id: fixture.claim_id },
      checker: CHECKER,
      checkerFn,
      store: fixture.store,
      resolution: {} as never,
    });
    const snapshot = fixture.store.currentSnapshot();
    const withProjections = {
      ...structuredClone(snapshot),
      revision: produced.invocation.evaluated_snapshot.revision,
      projections: { computed_from_revision: 0, policy_id: 'default-v1', values: { x: 1 } },
    } as unknown as Snapshot;

    // Same revision, projections materialized or not ⇒ same recorded digest.
    const base = {
      ...structuredClone(snapshot),
      revision: produced.invocation.evaluated_snapshot.revision,
    } as Snapshot;
    expect(semanticSnapshotDigest(withProjections)).toEqual(semanticSnapshotDigest(base));
    // The generic digest would NOT have been stable across that difference.
    expect(digest(withProjections).value).not.toBe(digest(base).value);
  });
});

describe('codex 7 — the canonical snapshot is not mutable through currentSnapshot()', () => {
  it('throws rather than letting a reader edit canonical state', async () => {
    const fixture = await buildLedger('tallyback-cx7-');
    const snapshot = fixture.store.currentSnapshot() as unknown as { tasks: { title: string }[] };
    expect(() => {
      snapshot.tasks[0]!.title = 'tampered';
    }).toThrow(TypeError);
    expect(fixture.store.listTasks()[0]!.title).not.toBe('tampered');
  });

  it('refuses an injected in-memory repository when binding a workspace', async () => {
    const fixture = await buildLedger('tallyback-cx7-');
    const snapshot = fixture.store.currentSnapshot() as unknown as {
      repositories: unknown[];
      workspaces: unknown[];
    };
    expect(() => {
      snapshot.repositories.push({
        repository_id: 'repo_0190b1c0-0000-7000-8000-0000000000ff',
        alias: 'fake',
      });
    }).toThrow(TypeError);

    const bound = await fixture.store.bindWorkspace({
      repository_id: 'repo_0190b1c0-0000-7000-8000-0000000000ff',
      workspace_id: fixture.workspace_id,
      root: '/tmp/anywhere',
    });
    expect(bound.ok).toBe(false);
  });

  it('still lets the Store itself advance the revision', async () => {
    const fixture = await buildLedger('tallyback-cx7-');
    const before = fixture.store.currentRevision();
    expect((await fixture.store.createTask({ topic_id: fixture.topic_id, title: 't' })).ok).toBe(
      true,
    );
    expect(fixture.store.currentRevision()).toBe(before + 1);
  });
});

describe('codex 8 — a resumed migration reports the source it actually committed', () => {
  const LEGACY = { topics: [{ name: 'legacy', tasks: [{ id: 'T1', title: 'a legacy task' }] }] };

  it('keeps the staged source and records the ignored one as a diagnostic', async () => {
    const root = await tempRoot('tallyback-cx8-');
    expect(
      (await stageMigration({ projectRoot: root, legacy: LEGACY, source: 'source-A.json' })).ok,
    ).toBe(true);

    const resumed = await applyMigration({
      projectRoot: root,
      legacy: LEGACY,
      source: 'source-B.json',
    });
    expect(resumed.ok).toBe(true);
    if (!resumed.ok) return;
    expect(resumed.resumed).toBe(true);
    // The committed data came from source A, so the permanent report says source A.
    expect(resumed.report.source.store).toBe('source-A.json');
    expect(resumed.report.diagnostics.map((d) => d.message).join(' ')).toContain('source-B.json');
  });

  it('reports the given source when there is nothing staged', async () => {
    const root = await tempRoot('tallyback-cx8-');
    const applied = await applyMigration({
      projectRoot: root,
      legacy: LEGACY,
      source: 'only-source.json',
    });
    expect(applied.ok).toBe(true);
    if (applied.ok) expect(applied.report.source.store).toBe('only-source.json');
  });
});
