/**
 * Migration as an actual migration workflow (SPEC §14).
 *
 * The defect this suite pins down: the implementation was a pure mapper, not the promised
 * one-time, persisted, atomic transaction. What is asserted here is the promise itself —
 * preview writes nothing, ids are deterministic and persisted, validation precedes any
 * write, a completed migration refuses to re-run, and an interrupted one resumes on the
 * identity it already staged rather than minting a second universe of ids.
 */

import { existsSync } from 'node:fs';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  applyMigration,
  MIGRATION_CODES,
  previewMigration,
  readLegacySource,
  readMigrationReport,
  readStagedMigration,
  stageMigration,
  deterministicMigrationId,
} from '../src/check/migration-workflow.js';
import { validate_migration_report, validate_snapshot } from '../src/contract/index.js';
import { Store } from '../src/ledger/index.js';
import { tempRoot } from './helpers/ledger.js';

const LEGACY = {
  active_topic: 'work',
  current_task: 'T1',
  topics: [
    {
      name: 'work',
      goal: 'ship it',
      status: 'active',
      tasks: [
        {
          id: 'T1',
          title: 'Implement validation',
          status: 'done',
          evidence: ['committed the validation logic'],
          attempts: [{ description: 'first pass', outcome: 'passed' }],
          next_action: 'review the diff',
          blockers: [{ description: 'blocked on review' }],
          decisions: [{ summary: 'chose approach A', rationale: 'simpler' }],
        },
        { id: 'T2', title: 'Write the docs', status: 'todo' },
      ],
    },
  ],
};

function options(projectRoot: string, legacy: unknown = LEGACY) {
  return { projectRoot, legacy, source: 'legacy-store.json' };
}

async function tallybackEntries(root: string): Promise<string[]> {
  try {
    return await readdir(join(root, '.tallyback'));
  } catch {
    return [];
  }
}

describe('preview', () => {
  it('produces a validated plan and writes nothing at all', async () => {
    const root = await tempRoot('tallyback-migrate-');
    const outcome = await previewMigration(options(root));

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.kind).toBe('preview');
    expect(validate_snapshot(outcome.snapshot).ok).toBe(true);
    expect(validate_migration_report(outcome.report).ok).toBe(true);
    expect(outcome.report.counts).toEqual({ topics: 1, tasks: 2, evidence: 3 });
    expect(outcome.report.mapping.tasks.map((t) => t.legacy_alias).sort()).toEqual(['T1', 'T2']);

    // No writes: not state.json, not the report, not even a staging marker.
    expect(await tallybackEntries(root)).toHaveLength(0);
    expect(await readMigrationReport(root)).toBeNull();
    expect(await readStagedMigration(root)).toBeNull();
  });

  it('mints the same canonical ids the apply will use', async () => {
    const root = await tempRoot('tallyback-migrate-');
    const preview = await previewMigration(options(root));
    const applied = await applyMigration(options(root));
    expect(preview.ok && applied.ok).toBe(true);
    if (!preview.ok || !applied.ok) return;
    expect(applied.report.mapping).toEqual(preview.report.mapping);
  });

  it('derives ids deterministically, independent of the clock', () => {
    const a = deterministicMigrationId('tsk_', 'topic:0:work|task:0:T1');
    const b = deterministicMigrationId('tsk_', 'topic:0:work|task:0:T1');
    expect(a).toBe(b);
    expect(a).toMatch(/^tsk_[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(deterministicMigrationId('tsk_', 'topic:0:work|task:1:T2')).not.toBe(a);
  });
});

describe('apply', () => {
  it('writes a valid, openable ledger plus a schema-conforming report', async () => {
    const root = await tempRoot('tallyback-migrate-');
    const outcome = await applyMigration(options(root));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.kind).toBe('applied');
    expect(outcome.resumed).toBe(false);
    expect(validate_migration_report(outcome.report).ok).toBe(true);
    expect(outcome.report.snapshot?.digest.value).toMatch(/^[0-9a-f]{64}$/);

    // The migrated ledger is a real ledger: it opens, validates, and keeps its aliases.
    const store = await Store.open(root);
    expect(store.validate_snapshot().ok).toBe(true);
    expect(
      store
        .listTasks()
        .map((t) => t.alias)
        .sort(),
    ).toEqual(['T1', 'T2']);
    expect(store.resolveTaskAlias('T1')).toBe(outcome.report.mapping.tasks[0]?.task_id);

    // The staging marker is cleared once the migration completes.
    expect(await readStagedMigration(root)).toBeNull();
    expect(existsSync(join(root, '.tallyback', 'migration-report.json'))).toBe(true);
  });

  it('fabricates no declarations, attempts, claims, or verdicts', async () => {
    const root = await tempRoot('tallyback-migrate-');
    expect((await applyMigration(options(root))).ok).toBe(true);
    const snapshot = (await Store.open(root)).currentSnapshot();
    expect(snapshot.declarations).toHaveLength(0);
    expect(snapshot.attempts).toHaveLength(0);
    expect(snapshot.claims).toHaveLength(0);
    expect(snapshot.verdicts).toHaveLength(0);
    expect(snapshot.settlements).toHaveLength(0);
    // Legacy attempts and `status: done` survive as observations, never as records that
    // assert something the legacy store never said.
    expect(snapshot.evidence.every((e) => e.kind === 'observation')).toBe(true);
    expect(snapshot.evidence.every((e) => e.submitted_by.kind === 'unknown')).toBe(true);
  });

  it('leaves no temp files behind', async () => {
    const root = await tempRoot('tallyback-migrate-');
    expect((await applyMigration(options(root))).ok).toBe(true);
    const entries = await tallybackEntries(root);
    expect(entries.filter((e) => e.endsWith('.tmp'))).toHaveLength(0);
  });
});

describe('rerun', () => {
  it('refuses a second migration instead of silently regenerating ids', async () => {
    const root = await tempRoot('tallyback-migrate-');
    const first = await applyMigration(options(root));
    expect(first.ok).toBe(true);
    const before = await readFile(join(root, '.tallyback', 'state.json'), 'utf8');

    const second = await applyMigration(options(root));
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.code).toBe(MIGRATION_CODES.ALREADY_APPLIED);
    expect(second.report?.kind).toBe('applied');

    // The refusal changed nothing.
    expect(await readFile(join(root, '.tallyback', 'state.json'), 'utf8')).toBe(before);
  });

  it('refuses even when the legacy source has since changed', async () => {
    const root = await tempRoot('tallyback-migrate-');
    expect((await applyMigration(options(root))).ok).toBe(true);
    const changed = structuredClone(LEGACY);
    changed.topics[0]!.tasks.push({ id: 'T3', title: 'Added after migrating', status: 'todo' });
    const second = await applyMigration(options(root, changed));
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe(MIGRATION_CODES.ALREADY_APPLIED);
  });
});

describe('malformed input', () => {
  it.each([
    ['not an object', 42],
    ['topics not an array', { topics: {} }],
    ['a topic that is not an object', { topics: ['work'] }],
    ['a topic with no name', { topics: [{ goal: 'x' }] }],
    ['a task with no string alias', { topics: [{ name: 'w', tasks: [{ title: 'x' }] }] }],
    [
      'a task whose evidence is not an array',
      {
        topics: [{ name: 'w', tasks: [{ id: 'T1', evidence: 'oops' }] }],
      },
    ],
  ])('rejects %s without writing anything', async (_label, legacy) => {
    const root = await tempRoot('tallyback-migrate-');
    const outcome = await applyMigration(options(root, legacy));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe(MIGRATION_CODES.MALFORMED_SOURCE);
    expect(await tallybackEntries(root)).toHaveLength(0);
  });

  it('reports an unreadable or non-JSON source file with the same code', async () => {
    const root = await tempRoot('tallyback-migrate-');
    const missing = await readLegacySource(join(root, 'nope.json'));
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.code).toBe(MIGRATION_CODES.MALFORMED_SOURCE);

    const path = join(root, 'legacy.json');
    await writeFile(path, '{ not json', 'utf8');
    const broken = await readLegacySource(path);
    expect(broken.ok).toBe(false);
    if (!broken.ok) expect(broken.code).toBe(MIGRATION_CODES.MALFORMED_SOURCE);
  });
});

describe('validation failure', () => {
  it('writes nothing when the migrated snapshot is not a valid canonical graph', async () => {
    const root = await tempRoot('tallyback-migrate-');
    // Structurally well-formed legacy data whose field types cannot become a valid
    // canonical Topic: migration reports that rather than guessing a repair.
    const legacy = { topics: [{ name: 42 as unknown as string, tasks: [] }] };

    const outcome = await applyMigration(options(root, legacy));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe(MIGRATION_CODES.VALIDATION_FAILED);
      expect(outcome.report?.status).toBe('failed');
    }
    expect(await tallybackEntries(root)).toHaveLength(0);

    // Preview reports the same failure, equally without writing.
    const preview = await previewMigration(options(root, legacy));
    expect(preview.ok).toBe(false);
    if (!preview.ok) expect(preview.code).toBe(MIGRATION_CODES.VALIDATION_FAILED);
    expect(await tallybackEntries(root)).toHaveLength(0);
  });
});

describe('interrupted migration', () => {
  it('resumes from the staged plan and reuses its identity', async () => {
    const root = await tempRoot('tallyback-migrate-');

    // Stage the plan, then "die" before the commit — exactly an interrupted run.
    const staged = await stageMigration(options(root));
    expect(staged.ok).toBe(true);
    const marker = await readStagedMigration(root);
    expect(marker).not.toBeNull();
    expect(existsSync(join(root, '.tallyback', 'state.json'))).toBe(false);
    expect(await readMigrationReport(root)).toBeNull();

    const resumed = await applyMigration(options(root));
    expect(resumed.ok).toBe(true);
    if (!resumed.ok || !marker) return;
    expect(resumed.resumed).toBe(true);
    // The ids are the staged ones — nothing was re-derived.
    expect(resumed.report.mapping).toEqual(marker.mapping);
    expect((await Store.open(root)).resolveTaskAlias('T1')).toBe(
      marker.mapping.tasks.find((t) => t.legacy_alias === 'T1')?.task_id,
    );
    expect(await readStagedMigration(root)).toBeNull();
  });

  it('resumes on the staged plan even if the legacy source changed in between', async () => {
    const root = await tempRoot('tallyback-migrate-');
    expect((await stageMigration(options(root))).ok).toBe(true);
    const marker = await readStagedMigration(root);

    const changed = structuredClone(LEGACY);
    changed.topics[0]!.tasks.push({ id: 'T9', title: 'Added mid-migration', status: 'todo' });
    const resumed = await applyMigration(options(root, changed));

    expect(resumed.ok).toBe(true);
    if (!resumed.ok || !marker) return;
    // The interrupted transaction completes as it was staged; the newer legacy data is a
    // separate reconciliation problem, never a heuristic merge (SPEC §14).
    expect(resumed.report.counts.tasks).toBe(marker.counts.tasks);
    expect(
      (await Store.open(root))
        .listTasks()
        .map((t) => t.alias)
        .sort(),
    ).toEqual(['T1', 'T2']);
  });

  it('keeps the staging marker out of the portable files', async () => {
    const root = await tempRoot('tallyback-migrate-');
    expect((await stageMigration(options(root))).ok).toBe(true);
    // The marker lives under runtime/, which is machine-local and never committed.
    expect(existsSync(join(root, '.tallyback', 'runtime', 'migration.state.json'))).toBe(true);
    const entries = await tallybackEntries(root);
    expect(entries).toEqual(['runtime']);
  });

  it('does not resume onto a ledger that already completed a migration', async () => {
    const root = await tempRoot('tallyback-migrate-');
    expect((await applyMigration(options(root))).ok).toBe(true);
    // A stray marker must not reopen a completed migration.
    await mkdir(join(root, '.tallyback', 'runtime'), { recursive: true });
    await writeFile(
      join(root, '.tallyback', 'runtime', 'migration.state.json'),
      JSON.stringify({ staged_at: '', source: '', mapping: {}, counts: {}, diagnostics: [] }),
      'utf8',
    );
    const again = await applyMigration(options(root));
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.code).toBe(MIGRATION_CODES.ALREADY_APPLIED);
  });
});
