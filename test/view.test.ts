/**
 * View: the compact per-task tallyback projection (`docs/view-design.md`).
 *
 * Mirrors `test/land.test.ts`'s structure: unit tests drive `buildTaskViews` directly over
 * a real ledger built through the public `Store` command surface (`buildLedger`), and one
 * CLI-level test proves `tallyback view` wires up end to end.
 */

import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { Store } from '../src/ledger/index.js';
import { buildTaskViews, summarizeTaskViews } from '../src/view/report.js';
import { ALICE, AGENT, buildLedger, tempRoot } from './helpers/ledger.js';

const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const TSX = join(ROOT, 'node_modules', '.bin', 'tsx');
const CLI = join(ROOT, 'src', 'cli.ts');

function unwrap<T extends object>(outcome: { ok: boolean; code?: string } & Partial<T>): T {
  if (!outcome.ok) {
    throw new Error(`store command failed: ${String(outcome.code)}`);
  }
  return outcome as unknown as T;
}

describe('buildTaskViews', () => {
  it('reports "observe (claim)" for a freshly dispatched task with no claim yet', async () => {
    const root = await tempRoot('tallyback-view-observe-');
    const store = await Store.init(root, { repositories: [{ alias: 'main' }] });
    const repository_id = store.listRepositories()[0]!.repository_id;

    const { topic } = unwrap<{ topic: { topic_id: string } }>(
      await store.createTopic({ name: 't', goal: 'g', created_by: ALICE }),
    );
    const { task } = unwrap<{ task: { task_id: string } }>(
      await store.createTask({
        topic_id: topic.topic_id,
        title: 'Undispatched claim',
        alias: 'T1',
      }),
    );
    const { declaration } = unwrap<{ declaration: { declaration_id: string } }>(
      await store.declare({
        task_id: task.task_id,
        objective: 'Do the thing.',
        criteria: [{ code: 'c1', statement: 'The thing is done.' }],
        declared_by: ALICE,
      }),
    );
    const { workspace } = unwrap<{ workspace: { workspace_id: string } }>(
      await store.registerWorkspace({ repository_id, branch: 'main' }),
    );
    await store.dispatch({
      task_id: task.task_id,
      declaration_id: declaration.declaration_id,
      repository_id,
      workspace_id: workspace.workspace_id,
      executor: AGENT,
      dispatched_by: ALICE,
    });

    const [view] = buildTaskViews(store.currentSnapshot());
    expect(view!.task_id).toBe(task.task_id);
    expect(view!.attempts).toHaveLength(1);
    expect(view!.claims).toHaveLength(0);
    expect(view!.next_action).toBe('observe (claim)');
  });

  it('reports "resolve blocker" regardless of loop position when a blocker is unresolved', async () => {
    const fixture = await buildLedger('tallyback-view-blocked-');
    const outcome = await fixture.store.raiseBlocker({
      task_id: fixture.task_id,
      description: 'Something is wrong.',
      raised_by: ALICE,
      attempt_id: fixture.attempt_id,
    });
    expect(outcome.ok).toBe(true);

    const [view] = buildTaskViews(fixture.store.currentSnapshot());
    expect(view!.status.blocked).toBe(true);
    expect(view!.next_action).toBe('resolve blocker');
    expect(view!.blockers).toHaveLength(1);
  });

  it('echoes the decision verbatim for a task with an effective settlement', async () => {
    const fixture = await buildLedger('tallyback-view-settled-');
    const settled = await fixture.store.settle({
      task_id: fixture.task_id,
      attempt_id: fixture.attempt_id,
      decision: 'land',
      decided_by: ALICE,
      basis: { verdict_id: null, attempt_end_id: null, blocker_ids: [] },
      verification_exception: 'accepted by hand for view test fixture',
      rationale: 'test fixture: settlement without a full check/verdict chain',
    });
    expect(settled.ok).toBe(true);

    const [view] = buildTaskViews(fixture.store.currentSnapshot());
    expect(view!.next_action).toBe('settled: land');
    expect(view!.settlement).toMatchObject({ decision: 'land' });
    expect(view!.status.settled).toBe(true);
  });

  it('never includes the Evidence `payload` field, even though the record carries one', async () => {
    const fixture = await buildLedger('tallyback-view-evidence-');
    const [view] = buildTaskViews(fixture.store.currentSnapshot());
    expect(view!.evidence).toHaveLength(1);
    const evidenceRecord = view!.evidence[0]!;
    expect(evidenceRecord).toMatchObject({
      evidence_id: fixture.evidence_id,
      kind: 'observation',
    });
    expect('payload' in evidenceRecord).toBe(false);

    // The underlying ledger record DOES carry a payload — proving View actively drops it,
    // not that the fixture happens not to have one.
    const rawEvidence = fixture.store
      .currentSnapshot()
      .evidence.find((e) => e.evidence_id === fixture.evidence_id);
    expect(rawEvidence).toMatchObject({ payload: { text: 'the validation logic was added' } });
  });

  it('narrows to exactly the requested --task-id when taskIds is given', async () => {
    const fixture = await buildLedger('tallyback-view-narrow-');
    const { topic } = unwrap<{ topic: { topic_id: string } }>(
      await fixture.store.createTopic({ name: 't2', goal: 'g2', created_by: ALICE }),
    );
    const { task: secondTask } = unwrap<{ task: { task_id: string } }>(
      await fixture.store.createTask({
        topic_id: topic.topic_id,
        title: 'Second task',
        alias: 'T2',
      }),
    );

    const allViews = buildTaskViews(fixture.store.currentSnapshot());
    expect(allViews.map((v) => v.task_id).sort()).toEqual(
      [fixture.task_id, secondTask.task_id].sort(),
    );

    const narrowed = buildTaskViews(fixture.store.currentSnapshot(), [secondTask.task_id]);
    expect(narrowed).toHaveLength(1);
    expect(narrowed[0]!.task_id).toBe(secondTask.task_id);
  });
});

describe('summarizeTaskViews', () => {
  it('is a literal count rollup over the given views', async () => {
    const fixture = await buildLedger('tallyback-view-summary-');
    const views = buildTaskViews(fixture.store.currentSnapshot());
    const summary = summarizeTaskViews(views);
    expect(summary).toEqual({
      task_count: 1,
      blocked: 0,
      ready_to_land: 0,
      stale: 0,
      settled: 0,
    });
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

describe('tallyback view (CLI)', () => {
  it('runs against an open ledger and returns valid JSON', async () => {
    const root = await tempRoot('tallyback-view-cli-');

    const initRun = await runRaw(root, ['init', '--repository', 'main']);
    expect(initRun.code).toBe(0);

    const topicRun = await runRaw(root, ['topic', '--name', 't', '--goal', 'g']);
    expect(topicRun.code).toBe(0);
    const topicId = (JSON.parse(topicRun.stdout) as { topic: { topic_id: string } }).topic.topic_id;

    const taskRun = await runRaw(root, [
      'task',
      '--topic-id',
      topicId,
      '--title',
      'T',
      '--alias',
      'T1',
    ]);
    expect(taskRun.code).toBe(0);

    const run = await runRaw(root, ['view']);
    expect(run.code).toBe(0);

    const parsed = JSON.parse(run.stdout) as {
      generated_from_revision: number;
      tasks: unknown[];
      summary: { task_count: number };
    };
    expect(typeof parsed.generated_from_revision).toBe('number');
    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.summary.task_count).toBe(1);
    expect(run.stderr).toMatch(/^view: /);
  }, 30_000);
});
