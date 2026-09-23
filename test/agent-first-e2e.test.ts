/**
 * Agent-first acceptance: the operational loop this repository is built for is
 * Primary/Coordinating Agent -> Worker/Subagent, with the Human outside the loop
 * providing intent/oversight, not filling any operational Actor slot.
 *
 * Every other lifecycle test in this suite proves `dispatched_by = human:alice` /
 * `executor = subagent:agent-7` — human dispatches worker. This test locks down the
 * distinct claim that Tallyback does not require a human actor anywhere in the loop:
 * a coordinating agent (`kind: "executor"`) can declare, dispatch, decide, and settle
 * work it delegates to a `subagent` worker, verified by a `tool` checker, using only
 * the existing generic Actor model and CLI flags (`--actor`, `--dispatcher`,
 * `--executor`) — no new abstraction, no special-cased runtime behavior.
 *
 * Drives the real CLI as a subprocess against a real git repository, mirroring
 * `test/e2e.test.ts`'s golden-path scenario, and runs `tallyback land` afterward to
 * confirm the coordinator-authorized task is a valid land candidate under current
 * semantics.
 */

import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { buildReconciliation, reconcileGitObject } from '../src/check/reconcile.js';
import { tempRoot } from './helpers/ledger.js';

const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const TSX = join(ROOT, 'node_modules', '.bin', 'tsx');
const CLI = join(ROOT, 'src', 'cli.ts');

const COORDINATOR = 'executor:coordinator';
const WORKER = 'subagent:worker-1';
const CHECKER = 'tool:tallyback-check';

async function tb(projectRoot: string, ...args: string[]): Promise<Record<string, unknown>> {
  const { stdout } = await execFileAsync(TSX, [CLI, ...args, '--project-root', projectRoot], {
    cwd: ROOT,
  });
  return JSON.parse(stdout) as Record<string, unknown>;
}

async function git(root: string, ...args: string[]): Promise<void> {
  await execFileAsync('git', ['-C', root, ...args]);
}

async function gitText(root: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', root, ...args]);
  return stdout.trim();
}

async function initGitRepo(): Promise<{ root: string; newFile: string; featureCommit: string }> {
  const root = await tempRoot('tallyback-agent-first-git-');
  await git(root, 'init', '-q', '-b', 'main');
  await git(root, 'config', 'user.email', 'a@b.c');
  await git(root, 'config', 'user.name', 'x');
  await writeFile(join(root, 'base.txt'), 'base', 'utf8');
  await git(root, 'add', '.');
  await git(root, 'commit', '-q', '-m', 'init');

  const newFile = 'feature-a.txt';
  await git(root, 'checkout', '-q', '-b', 'feature');
  await writeFile(join(root, newFile), 'worker output', 'utf8');
  await git(root, 'add', '.');
  await git(root, 'commit', '-q', '-m', 'feature: worker commit');
  const featureCommit = await gitText(root, 'rev-parse', 'HEAD');
  await git(root, 'checkout', '-q', 'main');

  return { root, newFile, featureCommit };
}

async function stateOf(projectRoot: string): Promise<{
  declarations: { declaration_id: string; declared_by: { kind: string; id: string } }[];
  attempts: {
    attempt_id: string;
    dispatched_by: { kind: string; id: string };
    executor: { kind: string; id: string };
  }[];
  evidence: {
    evidence_id: string;
    kind: string;
    payload: Record<string, unknown>;
    submitted_by: { kind: string; id: string };
  }[];
  claims: { claim_id: string; claimed_by: { kind: string; id: string } }[];
  reconciliations: {
    reconciliation_id: string;
    evidence_id: string;
    checked_by: { kind: string; id: string };
    checks: { predicate: string; outcome: string; observed?: Record<string, unknown> }[];
  }[];
  verdicts: {
    verdict_id: string;
    issued_by: { kind: string; id: string };
    basis: { evidence_ids: string[]; reconciliation_ids: string[] };
  }[];
  settlements: { settlement_id: string; decided_by: { kind: string; id: string } }[];
}> {
  const raw = await readFile(join(projectRoot, '.tallyback', 'state.json'), 'utf8');
  return JSON.parse(raw) as never;
}

describe('agent-first acceptance — coordinator dispatches worker, no human actor required', () => {
  it('runs the full delegated loop with Primary Agent -> Worker provenance and lands', async () => {
    const projectRoot = await tempRoot('tallyback-agent-first-');

    const init = (await tb(
      projectRoot,
      'init',
      '--repository',
      'main',
      '--topic',
      'release',
    )) as unknown as {
      repositories: { repository_id: string }[];
      topics: { topic_id: string }[];
    };
    const repositoryId = init.repositories[0]!.repository_id;
    const topicId = init.topics[0]!.topic_id;

    const { root: gitRoot, newFile, featureCommit } = await initGitRepo();

    const workspace = (await tb(
      projectRoot,
      'workspace',
      '--repository-id',
      repositoryId,
      '--branch',
      'feature',
    )) as unknown as { workspace: { workspace_id: string } };
    const workspaceId = workspace.workspace.workspace_id;

    await tb(
      projectRoot,
      'bind',
      '--repository-id',
      repositoryId,
      '--workspace-id',
      workspaceId,
      '--root',
      gitRoot,
    );

    const task = (await tb(
      projectRoot,
      'task',
      '--topic-id',
      topicId,
      '--title',
      'Delegated agent-first task',
      '--alias',
      'T1',
    )) as unknown as { task: { task_id: string } };
    const taskId = task.task.task_id;

    // Primary Agent: Declare.
    const declared = (await tb(
      projectRoot,
      'declare',
      '--task-id',
      'T1',
      '--objective',
      'Implement the delegated change.',
      '--criterion',
      'done:The worker-submitted commit is the current feature branch head.',
      '--actor',
      COORDINATOR,
    )) as unknown as { declaration: { declaration_id: string } };
    const declarationId = declared.declaration.declaration_id;

    // Primary Agent: Dispatch to Worker.
    const dispatched = (await tb(
      projectRoot,
      'dispatch',
      '--task-id',
      'T1',
      '--declaration-id',
      declarationId,
      '--repository-id',
      repositoryId,
      '--workspace-id',
      workspaceId,
      '--executor',
      WORKER,
      '--dispatcher',
      COORDINATOR,
    )) as unknown as { attempt: { attempt_id: string } };
    const attemptId = dispatched.attempt.attempt_id;

    // Worker: typed Git evidence — the exact commit produced on the feature branch.
    const evidence = (await tb(
      projectRoot,
      'evidence',
      '--kind',
      'git_commit',
      '--payload',
      JSON.stringify({
        repository_id: repositoryId,
        object_id: featureCommit,
        object_format: 'sha1',
      }),
      '--note',
      'Worker-submitted commit for the delegated change.',
      '--actor',
      WORKER,
    )) as unknown as { evidence: { evidence_id: string } };

    // Worker: Claim.
    const claim = (await tb(
      projectRoot,
      'claim',
      '--task-id',
      'T1',
      '--attempt-id',
      attemptId,
      '--declaration-id',
      declarationId,
      '--statement',
      'The declared work is complete.',
      '--evidence',
      evidence.evidence.evidence_id,
      '--actor',
      WORKER,
    )) as unknown as { claim: { claim_id: string } };

    // Checker: mechanically reconcile the worker's Git evidence against the real repo.
    const objectCheck = await reconcileGitObject(gitRoot, featureCommit);
    expect(objectCheck).toMatchObject({
      predicate: 'git.object.exists',
      outcome: 'confirmed',
      observed: { object_id: featureCommit, object_type: 'commit' },
    });
    const featureHead = await gitText(gitRoot, 'rev-parse', 'feature');
    expect(featureHead).toBe(featureCommit);
    const reconciliation = buildReconciliation({
      evidence_id: evidence.evidence.evidence_id,
      method: { name: 'git-object-and-ref-inspection', version: '1' },
      observed_context: {
        repository_id: repositoryId,
        workspace_id: workspaceId,
        head_oid: featureHead,
        working_tree: 'clean',
      },
      checks: [
        objectCheck,
        {
          predicate: 'git.head.matches',
          outcome: 'confirmed',
          observed: { ref: 'feature', object_id: featureHead },
        },
      ],
      checked_by: { kind: 'tool', id: 'tallyback-check' },
    });

    // Record the factual reconciliation first. A separate semantic Verdict then cites it.
    const begun = (await tb(
      projectRoot,
      'begin-check',
      '--claim-id',
      claim.claim.claim_id,
      '--checker-id',
      'tallyback-check',
      '--checker-version',
      '1',
      '--actor',
      CHECKER,
    )) as unknown as { invocation: { check_invocation_id: string } };
    await tb(
      projectRoot,
      'record-check',
      '--invocation-id',
      begun.invocation.check_invocation_id,
      '--outcome',
      'verdict_withheld',
      '--diagnostic',
      'check.reconciliation_only:Git facts reconciled; semantic verdict follows separately',
      '--reconciliation',
      JSON.stringify(reconciliation),
      '--actor',
      CHECKER,
    );

    // Checker: semantic Verdict, explicitly grounded in the recorded Git reconciliation.
    const verdict = (await tb(
      projectRoot,
      'verdict',
      '--claim',
      claim.claim.claim_id,
      '--criterion',
      // The declared criterion's code is `done`; `verdict` resolves it by code.
      'done=supported',
      '--evidence',
      evidence.evidence.evidence_id,
      '--reconciliation',
      reconciliation.reconciliation_id,
      '--rationale',
      'The submitted commit exists and is the feature branch head.',
      '--confidence',
      'high',
      '--checker-id',
      'tallyback-check',
      '--checker-version',
      '1',
      '--actor',
      CHECKER,
    )) as unknown as { bundle: { verdict: { verdict_id: string } } };
    const verdictId = verdict.bundle.verdict.verdict_id;

    // Primary Agent: Settlement = land.
    const settled = (await tb(
      projectRoot,
      'settle',
      '--task-id',
      'T1',
      '--attempt-id',
      attemptId,
      '--decision',
      'land',
      '--verdict-id',
      verdictId,
      '--rationale',
      'Verdict supports the declared criterion; authorizing integration.',
      '--actor',
      COORDINATOR,
    )) as unknown as { ok: boolean };
    expect(settled.ok).toBe(true);

    // Durable provenance: no human actor anywhere in the recorded loop.
    const state = await stateOf(projectRoot);
    const declaration = state.declarations.find((d) => d.declaration_id === declarationId)!;
    const attempt = state.attempts.find((a) => a.attempt_id === attemptId)!;
    const ev = state.evidence.find((e) => e.evidence_id === evidence.evidence.evidence_id)!;
    const cl = state.claims.find((c) => c.claim_id === claim.claim.claim_id)!;
    const rec = state.reconciliations.find(
      (r) => r.reconciliation_id === reconciliation.reconciliation_id,
    )!;
    const vd = state.verdicts.find((v) => v.verdict_id === verdictId)!;
    const settlement = state.settlements.find((s) => s.decided_by.id === 'coordinator')!;

    expect(declaration.declared_by).toEqual({ kind: 'executor', id: 'coordinator' });
    expect(attempt.dispatched_by).toEqual({ kind: 'executor', id: 'coordinator' });
    expect(attempt.executor).toEqual({ kind: 'subagent', id: 'worker-1' });
    expect(ev.kind).toBe('git_commit');
    expect(ev.payload).toMatchObject({
      repository_id: repositoryId,
      object_id: featureCommit,
      object_format: 'sha1',
    });
    expect(ev.submitted_by).toEqual({ kind: 'subagent', id: 'worker-1' });
    expect(cl.claimed_by).toEqual({ kind: 'subagent', id: 'worker-1' });
    expect(rec.checked_by).toEqual({ kind: 'tool', id: 'tallyback-check' });
    expect(rec.evidence_id).toBe(evidence.evidence.evidence_id);
    expect(rec.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ predicate: 'git.object.exists', outcome: 'confirmed' }),
        expect.objectContaining({ predicate: 'git.head.matches', outcome: 'confirmed' }),
      ]),
    );
    expect(vd.issued_by).toEqual({ kind: 'tool', id: 'tallyback-check' });
    expect(vd.basis).toEqual({
      evidence_ids: [evidence.evidence.evidence_id],
      reconciliation_ids: [reconciliation.reconciliation_id],
    });
    expect(settlement.decided_by).toEqual({ kind: 'executor', id: 'coordinator' });

    for (const actor of [
      declaration.declared_by,
      attempt.dispatched_by,
      attempt.executor,
      ev.submitted_by,
      cl.claimed_by,
      rec.checked_by,
      vd.issued_by,
      settlement.decided_by,
    ]) {
      expect(actor.kind).not.toBe('human');
    }

    // `settle --decision land` is the explicit integration authorization; only now does
    // the task enter `ready_to_land` and only now is `tallyback land`'s read-only,
    // live-Git report over it meaningful (see corrected Bridge guidance).
    const land = (await tb(projectRoot, 'land', '--target-branch', 'main')) as unknown as {
      ready: {
        task_id: string;
        attempt_id: string;
        branch: string;
        status: string;
        overlapping_files: string[];
      }[];
      unresolved: unknown[];
    };
    expect(land.unresolved).toEqual([]);
    expect(land.ready).toHaveLength(1);
    expect(land.ready[0]).toMatchObject({
      task_id: taskId,
      attempt_id: attemptId,
      branch: 'feature',
      status: 'git_ready',
    });
    expect(land.ready[0]!.overlapping_files).toContain(newFile);

    const validated = (await tb(projectRoot, 'validate')) as unknown as { ok: boolean };
    expect(validated.ok).toBe(true);
  }, 120_000);
});
