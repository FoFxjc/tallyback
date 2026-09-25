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
// Regression: View surfaces every Task with every Settlement decision verbatim.
// SPEC §5.11 says Settlement is not a Task status; View must not invent a
// lifecycle policy that hides tasks based on Settlement decision. The four
// decisions are presentational only — they show up in `next_action` and
// `status.settled` exactly as v1 specified, and the task itself is always in
// the returned `tasks` array.
//
// Active-vs-historical View filtering is an open retention-design question for
// a future evidence-driven slice; it is intentionally NOT applied here.
// ---------------------------------------------------------------------------

describe('View — every Settlement decision is presentable; no Task-lifecycle filtering (rollback regression)', () => {
  // The Settlement basis matrix (TB-LC-005): `accept` and `land` accept
  // `verification_exception`; `retry` and `abandon` must NOT cite one. Build each
  // settle call with the shape the validator accepts.
  function settleInput(decision: 'accept' | 'retry' | 'abandon' | 'land') {
    const useVerificationException = decision === 'accept' || decision === 'land';
    return {
      decision,
      basis: { verdict_id: null, attempt_end_id: null, blocker_ids: [] },
      ...(useVerificationException ? { verification_exception: 'accepted by hand' } : {}),
      rationale: `settled with ${decision}`,
      decided_by: ALICE,
    };
  }

  it('`accept`-settled task is still surfaced by default View; `next_action` echoes the decision', async () => {
    const fixture = await buildLedger('tallyback-view-accept-present-');
    const settled = await fixture.store.settle({
      task_id: fixture.task_id,
      attempt_id: fixture.attempt_id,
      ...settleInput('accept'),
    });
    expect(settled.ok).toBe(true);

    const views = buildTaskViews(fixture.store.currentSnapshot());
    expect(views).toHaveLength(1);
    expect(views[0]!.task_id).toBe(fixture.task_id);
    expect(views[0]!.next_action).toBe('settled: accept');
    expect(views[0]!.settlement?.decision).toBe('accept');
    expect(views[0]!.status.settled).toBe(true);
  });

  it('`retry`-settled task is still surfaced by default View; `next_action` echoes the decision', async () => {
    const fixture = await buildLedger('tallyback-view-retry-present-');
    const settled = await fixture.store.settle({
      task_id: fixture.task_id,
      attempt_id: fixture.attempt_id,
      ...settleInput('retry'),
    });
    expect(settled.ok).toBe(true);

    const views = buildTaskViews(fixture.store.currentSnapshot());
    expect(views).toHaveLength(1);
    expect(views[0]!.next_action).toBe('settled: retry');
    expect(views[0]!.settlement?.decision).toBe('retry');
  });

  it('`retry` is not terminal: it points at a new Attempt, and guidance follows that Attempt (TB-LC-003)', async () => {
    const fixture = await buildLedger('tallyback-view-retry-continues-');
    const settled = await fixture.store.settle({
      task_id: fixture.task_id,
      attempt_id: fixture.attempt_id,
      ...settleInput('retry'),
    });
    expect(settled.ok).toBe(true);
    let view = buildTaskViews(fixture.store.currentSnapshot())[0]!;
    expect(view.next_action).toBe('settled: retry');
    // The retried Attempt is still open, and an open Attempt keeps its Workspace (TB-LC-004).
    expect(view.next_command?.command).toContain(
      `tallyback end --attempt-id ${fixture.attempt_id}`,
    );
    const ended = await fixture.store.endAttempt({
      attempt_id: fixture.attempt_id,
      outcome: 'returned',
      reported_by: AGENT,
    });
    expect(ended.ok).toBe(true);
    view = buildTaskViews(fixture.store.currentSnapshot())[0]!;
    expect(view.next_command?.command).toContain(`tallyback dispatch --task-id ${fixture.task_id}`);

    // Dispatch timestamps order attempts; make sure the second is strictly later.
    await new Promise((r) => setTimeout(r, 5));
    const second = await fixture.store.dispatch({
      task_id: fixture.task_id,
      declaration_id: fixture.declaration_id,
      repository_id: fixture.repository_id,
      workspace_id: fixture.workspace_id,
      executor: AGENT,
      dispatched_by: ALICE,
    });
    expect(second.ok, JSON.stringify(second)).toBe(true);
    view = buildTaskViews(fixture.store.currentSnapshot())[0]!;
    expect(view.next_action).toBe('observe (claim)');
    expect(view.next_command?.command).toContain(
      second.ok ? second.attempt.attempt_id : 'unreachable',
    );
  });

  it('execution_fit: a new executor sees the prior Fit and must supersede it, never share it', async () => {
    const fixture = await buildLedger('tallyback-view-execution-fit-');
    const before = buildTaskViews(fixture.store.currentSnapshot())[0]!;
    expect(before.attempts[0]!.execution_fit).toBeNull();

    const fit = (choice: string, decided_by: typeof AGENT, supersedes?: string) =>
      fixture.store.recordDecision({
        subject: { kind: 'attempt', id: fixture.attempt_id },
        role: 'execution_choice',
        question: 'Execution fit',
        choice,
        rationale: 'criteria: ok; capability: ok; verification: pytest; tools/authority: no land',
        decided_by,
        ...(supersedes ? { supersedes } : {}),
      });
    const first = await fit('FIT: small local fix', AGENT);
    expect(first.ok, JSON.stringify(first)).toBe(true);
    const firstId = first.ok ? first.decision.decision_id : 'unreachable';

    let view = buildTaskViews(fixture.store.currentSnapshot())[0]!;
    expect(view.attempts[0]!.execution_fit).toMatchObject({
      decision_id: firstId,
      decided_by: AGENT,
      assessment: 'FIT',
      choice: 'FIT: small local fix',
      supersedes: null,
      concurrent: [],
    });

    // A second executor cannot silently add a parallel Fit: the lineage refuses a second head.
    const NEXT = { kind: 'executor', id: 'resumed-session' } as const;
    const parallel = await fit('CONDITIONAL: cannot reach staging', NEXT);
    expect(parallel.ok).toBe(false);
    expect(parallel.ok ? '' : parallel.code).toBe('invariant.supersession_conflict');

    await new Promise((r) => setTimeout(r, 5));
    const own = await fit('CONDITIONAL: cannot reach staging', NEXT, firstId);
    expect(own.ok, JSON.stringify(own)).toBe(true);
    view = buildTaskViews(fixture.store.currentSnapshot())[0]!;
    expect(view.attempts[0]!.execution_fit).toMatchObject({
      decided_by: NEXT,
      assessment: 'CONDITIONAL',
      supersedes: firstId,
      concurrent: [],
    });
    // Projection only: Fit never changes lifecycle guidance.
    expect(view.next_action).toBe(before.next_action);
    expect(view.status).toEqual(before.status);
  });

  it('an Attempt that ended without a Claim is settled, not claimed on (NOT_FIT return)', async () => {
    const fixture = await buildLedger('tallyback-view-ended-no-claim-');
    // The fixture's Attempt carries a Claim; the NOT_FIT Attempt is a fresh one with none.
    expect(
      (
        await fixture.store.endAttempt({
          attempt_id: fixture.attempt_id,
          outcome: 'returned',
          reported_by: AGENT,
        })
      ).ok,
    ).toBe(true);
    await new Promise((r) => setTimeout(r, 5));
    const second = await fixture.store.dispatch({
      task_id: fixture.task_id,
      declaration_id: fixture.declaration_id,
      repository_id: fixture.repository_id,
      workspace_id: fixture.workspace_id,
      executor: AGENT,
      dispatched_by: ALICE,
    });
    expect(second.ok, JSON.stringify(second)).toBe(true);
    const attemptId = second.ok ? second.attempt.attempt_id : 'unreachable';
    const ended = await fixture.store.endAttempt({
      attempt_id: attemptId,
      outcome: 'returned',
      reason: 'NOT_FIT: needs an approval',
      reported_by: AGENT,
    });
    expect(ended.ok, JSON.stringify(ended)).toBe(true);
    const endId = ended.ok ? ended.attempt_end.attempt_end_id : 'unreachable';
    let view = buildTaskViews(fixture.store.currentSnapshot())[0]!;
    expect(view.next_action).toBe('settle');
    expect(view.next_command?.command).toContain('--decision <retry|abandon>');
    expect(view.next_command?.command).toContain(`--attempt-end-id ${endId}`);
    expect(view.next_command?.command).not.toContain('tallyback claim');

    const settled = await fixture.store.settle({
      task_id: fixture.task_id,
      attempt_id: attemptId,
      decision: 'retry',
      basis: { verdict_id: null, attempt_end_id: endId, blocker_ids: [] },
      rationale: 'approval now exists; new Attempt',
      decided_by: ALICE,
    });
    expect(settled.ok, JSON.stringify(settled)).toBe(true);
    view = buildTaskViews(fixture.store.currentSnapshot())[0]!;
    expect(view.next_command?.command).toContain(`tallyback dispatch --task-id ${fixture.task_id}`);
  });

  it('execution_fit: assessment parses NOT_FIT and leaves unlabelled choices null', async () => {
    const fixture = await buildLedger('tallyback-view-execution-fit-labels-');
    const decide = (choice: string, supersedes?: string) =>
      fixture.store.recordDecision({
        subject: { kind: 'attempt', id: fixture.attempt_id },
        role: 'execution_choice',
        question: 'Execution fit',
        choice,
        rationale: 'r',
        decided_by: AGENT,
        ...(supersedes ? { supersedes } : {}),
      });
    const a = await decide('NOT_FIT: needs a production secret');
    expect(a.ok).toBe(true);
    expect(
      buildTaskViews(fixture.store.currentSnapshot())[0]!.attempts[0]!.execution_fit?.assessment,
    ).toBe('NOT_FIT');
    await new Promise((r) => setTimeout(r, 5));
    const b = await decide('FITTING the cache first', a.ok ? a.decision.decision_id : undefined);
    expect(b.ok).toBe(true);
    expect(
      buildTaskViews(fixture.store.currentSnapshot())[0]!.attempts[0]!.execution_fit?.assessment,
    ).toBeNull();
  });

  it('`abandon`-settled task is still surfaced by default View; `next_action` echoes the decision', async () => {
    const fixture = await buildLedger('tallyback-view-abandon-present-');
    const settled = await fixture.store.settle({
      task_id: fixture.task_id,
      attempt_id: fixture.attempt_id,
      ...settleInput('abandon'),
    });
    expect(settled.ok).toBe(true);

    const views = buildTaskViews(fixture.store.currentSnapshot());
    expect(views).toHaveLength(1);
    expect(views[0]!.next_action).toBe('settled: abandon');
    expect(views[0]!.settlement?.decision).toBe('abandon');
  });

  it('`land`-settled task is still surfaced by default View; `next_action` echoes the decision', async () => {
    const fixture = await buildLedger('tallyback-view-land-present-');
    const settled = await fixture.store.settle({
      task_id: fixture.task_id,
      attempt_id: fixture.attempt_id,
      ...settleInput('land'),
    });
    expect(settled.ok).toBe(true);

    const views = buildTaskViews(fixture.store.currentSnapshot());
    expect(views).toHaveLength(1);
    expect(views[0]!.next_action).toBe('settled: land');
    expect(views[0]!.settlement?.decision).toBe('land');
  });

  it('a Task with multiple effective Settlements is still surfaced; `next_action` echoes the latest effective decision (v1 behavior)', async () => {
    // SPEC §5.11 says supersession is explicit. Multiple effective Settlements are
    // therefore a real state, and `next_action` already picks the latest by
    // `decided_at` (a presentation concern, NOT a Task-lifecycle concern). This test
    // proves that:
    //   - the task is in the View (no hiding)
    //   - the task's next_action reflects the latest effective Settlement decision
    //   - the older effective Settlement remains accessible via the underlying ledger
    //     (i.e. it was not silently superseded; only `next_action` prefers the latest)
    const fixture = await buildLedger('tallyback-view-multi-settle-');
    // First Settlement: `land`.
    const landSettled = await fixture.store.settle({
      task_id: fixture.task_id,
      attempt_id: fixture.attempt_id,
      ...settleInput('land'),
    });
    expect(landSettled.ok).toBe(true);
    // Dispatch a second Attempt and settle `accept`. Both Settlements remain effective
    // (no supersedes set), so both are retained in the ledger.
    const cur = fixture.store.currentSnapshot();
    const declaration = cur.declarations.find((d) => d.task_id === fixture.task_id)!;
    const { workspace } = unwrap<{ workspace: { workspace_id: string } }>(
      await fixture.store.registerWorkspace({
        repository_id: fixture.repository_id,
        branch: 'main',
      }),
    );
    const { attempt } = unwrap<{ attempt: { attempt_id: string } }>(
      await fixture.store.dispatch({
        task_id: fixture.task_id,
        declaration_id: declaration.declaration_id,
        repository_id: fixture.repository_id,
        workspace_id: workspace.workspace_id,
        executor: AGENT,
        dispatched_by: ALICE,
      }),
    );
    const acceptSettled = await fixture.store.settle({
      task_id: fixture.task_id,
      attempt_id: attempt.attempt_id,
      ...settleInput('accept'),
    });
    expect(acceptSettled.ok).toBe(true);

    // Default View: task is present (no hiding).
    const views = buildTaskViews(fixture.store.currentSnapshot());
    expect(views).toHaveLength(1);
    expect(views[0]!.task_id).toBe(fixture.task_id);

    // next_action echoes the latest effective decision (`accept` was appended after
    // `land`). The Task itself is not "filtered" — it just shows the latest presentation.
    expect(views[0]!.next_action).toBe('settled: accept');

    // Both Settlements are still effective in the ledger (none silently superseded):
    const settlementDecisions = fixture.store
      .currentSnapshot()
      .settlements.filter((s) => s.task_id === fixture.task_id)
      .map((s) => s.decision)
      .sort();
    expect(settlementDecisions).toEqual(['accept', 'land']);
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
