/**
 * Regressions for the nine defects found in code review.
 *
 * Each test failed against the code as reviewed and passes against the fix. They live in
 * one file so the review's findings stay individually traceable.
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import {
  applyMigration,
  MIGRATION_CODES,
  stageMigration,
} from '../src/check/migration-workflow.js';
import { validate_snapshot } from '../src/contract/index.js';
import { applyAppend } from '../src/ledger/append.js';
import { Store, StoreError } from '../src/ledger/index.js';
import { supersessionSubject } from '../src/ledger/supersession.js';
import type { AnyRecord, Snapshot } from '../src/contract/index.js';
import { buildLedger, tempRoot } from './helpers/ledger.js';

const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const ALICE = { kind: 'human', id: 'alice' } as const;

describe('finding 1 — init must not destroy an existing ledger', () => {
  it('refuses a second initialize and leaves every record intact', async () => {
    const { root, store, topic_id } = await buildLedger('tallyback-rr1-');
    expect((await store.createTask({ topic_id, title: 'precious' })).ok).toBe(true);
    const before = await readFile(join(root, '.tallyback', 'state.json'), 'utf8');

    await expect(Store.init(root, { repositories: [{ alias: 'main' }] })).rejects.toMatchObject({
      code: 'mutation.ledger_already_initialized',
    });

    // Byte-identical: the refusal wrote nothing at all.
    expect(await readFile(join(root, '.tallyback', 'state.json'), 'utf8')).toBe(before);
    const reopened = await Store.open(root);
    expect(reopened.listTasks().map((t) => t.title)).toContain('precious');
  });

  it('refuses rather than clobbering a state.json it cannot read', async () => {
    const { root } = await buildLedger('tallyback-rr1-');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(root, '.tallyback', 'state.json'), '{ corrupt', 'utf8');
    await expect(Store.init(root)).rejects.toMatchObject({
      code: 'mutation.ledger_already_initialized',
    });
    expect(await readFile(join(root, '.tallyback', 'state.json'), 'utf8')).toBe('{ corrupt');
  });

  it('still initializes a genuinely empty directory', async () => {
    const root = await tempRoot('tallyback-rr1-');
    await expect(Store.init(root, { repositories: [{ alias: 'main' }] })).resolves.toBeInstanceOf(
      Store,
    );
  });

  it('surfaces the refusal through the CLI', async () => {
    const root = await tempRoot('tallyback-rr1-');
    const tsx = join(ROOT, 'node_modules', '.bin', 'tsx');
    const cli = join(ROOT, 'src', 'cli.ts');
    await execFileAsync(tsx, [cli, 'init', '--repository', 'main', '--project-root', root], {
      cwd: ROOT,
    });
    await expect(
      execFileAsync(tsx, [cli, 'init', '--repository', 'main', '--project-root', root], {
        cwd: ROOT,
      }),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining('mutation.ledger_already_initialized'),
    });
  }, 60_000);
});

describe('finding 2 — a correcting AttemptEnd must be appendable', () => {
  it('accepts an AttemptEnd that supersedes the effective end, keeping both bodies', async () => {
    const { root, store, attempt_id } = await buildLedger('tallyback-rr2-');
    const first = await store.endAttempt({
      attempt_id,
      outcome: 'returned',
      reported_by: ALICE,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const correcting = await store.endAttempt({
      attempt_id,
      outcome: 'failed',
      reported_by: ALICE,
      reason: 'the earlier report was wrong',
      supersedes: first.attempt_end.attempt_end_id,
    });
    expect(correcting.ok).toBe(true);

    // The state the contract's own `superseded-attemptend` fixture declares valid is now
    // reachable through an ordinary append, and both bodies remain in the graph.
    const reopened = await Store.open(root);
    expect(reopened.currentSnapshot().attempt_ends).toHaveLength(2);
    expect(reopened.validate_snapshot().ok).toBe(true);
  });

  it('still refuses a second, independent end (the original TB-LC-001 case)', async () => {
    const { store, attempt_id } = await buildLedger('tallyback-rr2-');
    expect(
      (await store.endAttempt({ attempt_id, outcome: 'returned', reported_by: ALICE })).ok,
    ).toBe(true);
    const second = await store.endAttempt({ attempt_id, outcome: 'failed', reported_by: ALICE });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe('invariant.attempt_already_ended');
  });

  it('refuses a correction aimed at an already-superseded end (no concurrent heads)', async () => {
    const { store, attempt_id } = await buildLedger('tallyback-rr2-');
    const first = await store.endAttempt({ attempt_id, outcome: 'returned', reported_by: ALICE });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(
      (
        await store.endAttempt({
          attempt_id,
          outcome: 'failed',
          reported_by: ALICE,
          supersedes: first.attempt_end.attempt_end_id,
        })
      ).ok,
    ).toBe(true);

    // Superseding the ORIGINAL again would fork the lineage.
    const forking = await store.endAttempt({
      attempt_id,
      outcome: 'cancelled',
      reported_by: ALICE,
      supersedes: first.attempt_end.attempt_end_id,
    });
    expect(forking.ok).toBe(false);
    if (!forking.ok) expect(forking.code).toBe('invariant.attempt_already_ended');
  });
});

describe('finding 3 — append reports, never throws, on an unserializable record', () => {
  it('returns a schema failure for a property present with an undefined value', async () => {
    const { store, topic_id } = await buildLedger('tallyback-rr3-');
    const outcome = await store.append({
      kind: 'append_records',
      expected_revision: store.currentRevision(),
      records: [
        {
          task_id: 'tsk_0190b1c0-0000-7000-8000-0000000000aa',
          topic_id,
          title: 'has an undefined alias',
          alias: undefined,
        } as unknown as AnyRecord,
      ],
      provenance: { submitted_by: { kind: 'tool', id: 'tallyback' } },
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('schema.undefined_value');
  });

  it('catches a nested undefined too', () => {
    const before = { schema_version: '1.0.0', revision: 0 } as unknown as Snapshot;
    const result = applyAppend(
      {
        ...(before as object),
        included_through: 0,
        project: { project_id: 'prj_0190b1c0-0000-7000-8000-000000000001', repositories: [] },
        repositories: [],
        workspaces: [],
        topics: [],
        tasks: [],
        declarations: [],
        attempts: [],
        attempt_ends: [],
        claims: [],
        evidence: [],
        reconciliations: [],
        check_invocations: [],
        check_results: [],
        verdicts: [],
        settlements: [],
        blockers: [],
        blocker_resolutions: [],
        decisions: [],
      } as unknown as Snapshot,
      {
        kind: 'append_records',
        expected_revision: 0,
        records: [
          {
            evidence_id: 'evi_0190b1c0-0000-7000-8000-000000000001',
            kind: 'observation',
            submitted_by: { kind: 'executor', id: 'a' },
            submitted_at: null,
            payload: { text: 'x', observer: undefined },
          } as unknown as AnyRecord,
        ],
        provenance: { submitted_by: { kind: 'tool', id: 'tallyback' } },
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('schema.undefined_value');
  });

  it('normalizes undefined away for records the Store itself builds, at any depth', async () => {
    const { store } = await buildLedger('tallyback-rr3-');
    const outcome = await store.observeEvidence({
      kind: 'observation',
      submitted_by: { kind: 'executor', id: 'agent-7' },
      note: undefined,
      payload: { text: 'a note', observer: undefined } as never,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect('note' in outcome.evidence).toBe(false);
      expect('observer' in (outcome.evidence.payload as object)).toBe(false);
    }
  });
});

describe('finding 4 — the package barrel loads in a transpile-only runtime', () => {
  it('imports under tsx without a missing-export error', async () => {
    const tsx = join(ROOT, 'node_modules', '.bin', 'tsx');
    const probe = join(ROOT, 'test', 'helpers', 'barrel-probe.ts');
    const { stdout } = await execFileAsync(tsx, [probe], { cwd: ROOT });
    const report = JSON.parse(stdout) as { exports: number; hasStore: boolean };
    expect(report.hasStore).toBe(true);
    expect(report.exports).toBeGreaterThan(50);
  }, 60_000);
});

describe('finding 5 — a committed record is not aliased to the caller', () => {
  it('does not let a post-commit mutation change the snapshot', async () => {
    const { store, topic_id } = await buildLedger('tallyback-rr5-');
    const outcome = await store.createTask({ topic_id, title: 'original' });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    (outcome.task as { title: string }).title = 'mutated after the commit returned';
    const stored = store.listTasks().find((t) => t.task_id === outcome.task.task_id);
    expect(stored?.title).toBe('original');
  });

  it('keeps a frozen evaluated_snapshot digest honest', async () => {
    const fixture = await buildLedger('tallyback-rr5-');
    const created = await fixture.store.createTask({ topic_id: fixture.topic_id, title: 'stable' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const begun = await fixture.store.beginCheckFor({
      claim_id: fixture.claim_id,
      checker: { id: 'done-or-not', version: '1' },
    });
    expect(begun.ok).toBe(true);
    if (!begun.ok) return;

    // Mutating the object the earlier command handed back must not change what the
    // invocation froze, nor what is on disk.
    (created.task as { title: string }).title = 'tampered';
    const onDisk = JSON.parse(
      await readFile(join(fixture.root, '.tallyback', 'state.json'), 'utf8'),
    ) as Snapshot;
    expect(onDisk.tasks.map((t) => t.title)).toContain('stable');
    expect(onDisk.tasks.map((t) => t.title)).not.toContain('tampered');
    expect(validate_snapshot(onDisk).ok).toBe(true);
  });
});

describe('finding 6 — migration must not overwrite a live ledger', () => {
  const LEGACY = { topics: [{ name: 'legacy', tasks: [{ id: 'T1', title: 'a legacy task' }] }] };

  it('refuses to apply over an existing ledger', async () => {
    const { root, store, topic_id } = await buildLedger('tallyback-rr6-');
    expect((await store.createTask({ topic_id, title: 'real work' })).ok).toBe(true);
    const before = await readFile(join(root, '.tallyback', 'state.json'), 'utf8');

    const outcome = await applyMigration({
      projectRoot: root,
      legacy: LEGACY,
      source: 'legacy.json',
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe(MIGRATION_CODES.TARGET_OCCUPIED);
    expect(await readFile(join(root, '.tallyback', 'state.json'), 'utf8')).toBe(before);
  });

  it('refuses to stage over an existing ledger', async () => {
    const { root } = await buildLedger('tallyback-rr6-');
    const outcome = await stageMigration({ projectRoot: root, legacy: LEGACY, source: 'l.json' });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe(MIGRATION_CODES.TARGET_OCCUPIED);
    expect(existsSync(join(root, '.tallyback', 'runtime', 'migration.state.json'))).toBe(false);
  });

  it('still migrates into an empty directory, and still resumes its own staged plan', async () => {
    const root = await tempRoot('tallyback-rr6-');
    expect((await stageMigration({ projectRoot: root, legacy: LEGACY, source: 'l.json' })).ok).toBe(
      true,
    );
    const resumed = await applyMigration({ projectRoot: root, legacy: LEGACY, source: 'l.json' });
    expect(resumed.ok).toBe(true);
    if (resumed.ok) expect(resumed.resumed).toBe(true);
  });
});

describe('finding 7 — an option value may begin with "--"', () => {
  const tsx = join(ROOT, 'node_modules', '.bin', 'tsx');
  const cli = join(ROOT, 'src', 'cli.ts');

  it('records the literal value instead of silently substituting "true"', async () => {
    const root = await tempRoot('tallyback-rr7-');
    const run = async (...args: string[]): Promise<Record<string, never>> => {
      const { stdout } = await execFileAsync(tsx, [cli, ...args, '--project-root', root], {
        cwd: ROOT,
      });
      return JSON.parse(stdout) as Record<string, never>;
    };
    const init = (await run('init', '--repository', 'main', '--topic', 't')) as unknown as {
      topics: { topic_id: string }[];
    };
    await run('task', '--topic-id', init.topics[0]!.topic_id, '--title', 'x', '--alias', 'T1');

    const declared = (await run(
      'declare',
      '--task-id',
      'T1',
      '--objective',
      '--wip, needs rebase',
      '--criterion',
      'c:a statement',
    )) as unknown as { declaration: { objective: string } };
    expect(declared.declaration.objective).toBe('--wip, needs rebase');
  }, 60_000);

  it('accepts the unambiguous --key=value form', async () => {
    const root = await tempRoot('tallyback-rr7-');
    const { stdout } = await execFileAsync(
      tsx,
      [cli, 'init', '--repository=main', '--topic=release', `--project-root=${root}`],
      { cwd: ROOT },
    );
    const init = JSON.parse(stdout) as {
      repositories: { alias: string }[];
      topics: { name: string }[];
    };
    expect(init.repositories[0]?.alias).toBe('main');
    expect(init.topics[0]?.name).toBe('release');
  }, 60_000);

  it('errors rather than guessing when a value-taking flag has no value', async () => {
    const root = await tempRoot('tallyback-rr7-');
    await expect(
      execFileAsync(tsx, [cli, 'init', '--project-root', root, '--topic'], { cwd: ROOT }),
    ).rejects.toMatchObject({ stderr: expect.stringContaining('--topic requires a value') });
  }, 60_000);
});

describe('finding 8 — an explicit null timestamp survives', () => {
  it('does not fabricate a clock reading for legacy provenance', async () => {
    const { store } = await buildLedger('tallyback-rr8-');
    const outcome = await store.observeEvidence({
      kind: 'observation',
      submitted_by: { kind: 'unknown', id: 'unknown' },
      submitted_at: null,
      payload: { text: 'a legacy note with no known time' },
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.evidence.submitted_at).toBeNull();
  });

  it('still defaults to now when the field is simply omitted', async () => {
    const { store } = await buildLedger('tallyback-rr8-');
    const outcome = await store.observeEvidence({
      kind: 'observation',
      submitted_by: { kind: 'executor', id: 'agent-7' },
      payload: { text: 'an ordinary observation' },
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.evidence.submitted_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('preserves a null decided_at on a Decision', async () => {
    const fixture = await buildLedger('tallyback-rr8-');
    const outcome = await fixture.store.recordDecision({
      subject: { kind: 'task', id: fixture.task_id },
      role: 'execution_choice',
      question: '',
      choice: 'migrated choice',
      rationale: '',
      decided_by: { kind: 'unknown', id: 'unknown' },
      decided_at: null,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.decision.decided_at).toBeNull();
  });
});

describe('finding 9 — the supersession helper agrees with the validator', () => {
  it('treats a Settlement lineage as (task, attempt), as the validator does', async () => {
    const base = {
      settlement_id: 'set_0190b1c0-0000-7000-8000-000000000001',
      task_id: 'tsk_0190b1c0-0000-7000-8000-000000000001',
      attempt_id: 'att_0190b1c0-0000-7000-8000-000000000001',
      decision: 'retry',
      decided_by: ALICE,
      decided_at: null,
      basis: {},
      rationale: 'r',
    } as unknown as AnyRecord;
    const otherAttempt = {
      ...(base as object),
      settlement_id: 'set_0190b1c0-0000-7000-8000-000000000002',
      attempt_id: 'att_0190b1c0-0000-7000-8000-000000000002',
    } as unknown as AnyRecord;

    // Same task, different attempt: NOT one lineage — matching TB-SUP-002.
    expect(supersessionSubject(base)).not.toBe(supersessionSubject(otherAttempt));
    expect(supersessionSubject(base)).toBe(
      supersessionSubject({ ...(base as object) } as AnyRecord),
    );
  });

  it('rejects a Decision supersession that changes role, as the helper already did', async () => {
    const fixture = await buildLedger('tallyback-rr9-');
    const first = await fixture.store.recordDecision({
      subject: { kind: 'task', id: fixture.task_id },
      role: 'next_action',
      question: 'what next?',
      choice: 'review the diff',
      rationale: 'r',
      decided_by: ALICE,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const crossRole = await fixture.store.recordDecision({
      subject: { kind: 'task', id: fixture.task_id },
      role: 'execution_choice',
      question: 'how?',
      choice: 'approach A',
      rationale: 'r',
      decided_by: ALICE,
      supersedes: first.decision.decision_id,
    });
    expect(crossRole.ok).toBe(false);
    if (!crossRole.ok) expect(crossRole.code).toBe('invariant.supersession_subject');

    // The helper and the validator now say the same thing.
    expect(supersessionSubject(first.decision as AnyRecord)).not.toBe(
      supersessionSubject({
        ...(first.decision as object),
        role: 'execution_choice',
      } as unknown as AnyRecord),
    );

    // A same-role supersession is still accepted.
    const sameRole = await fixture.store.recordDecision({
      subject: { kind: 'task', id: fixture.task_id },
      role: 'next_action',
      question: 'what next?',
      choice: 'ship it',
      rationale: 'r',
      decided_by: ALICE,
      supersedes: first.decision.decision_id,
    });
    expect(sameRole.ok).toBe(true);
  });
});

void StoreError;
