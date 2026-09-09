/**
 * The public CLI workflow, end to end.
 *
 * The defect this suite pins down: a fresh `tallyback init` could not reach `declare`,
 * because there was no public operation to create a Task, and `dispatch` could not work
 * because there was no way to register or bind a Workspace.
 *
 * Every step below goes through a **documented public command**. Nothing here reaches into
 * the library, and nothing uses a raw internal append helper — if the published command
 * surface cannot complete the loop, this test cannot pass.
 */

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { tempRoot } from './helpers/ledger.js';

const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const TSX = join(ROOT, 'node_modules', '.bin', 'tsx');
const CLI = join(ROOT, 'src', 'cli.ts');

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
      { cwd: ROOT },
    );
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return { code: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

/** Run a CLI command and parse its JSON result, failing loudly on a non-zero exit. */
async function tb(projectRoot: string, ...args: string[]): Promise<Record<string, never>> {
  const run = await runRaw(projectRoot, args);
  if (run.code !== 0) {
    throw new Error(`tallyback ${args.join(' ')} failed (${run.code}): ${run.stderr}`);
  }
  return JSON.parse(run.stdout) as Record<string, never>;
}

async function stateOf(
  projectRoot: string,
): Promise<Record<string, never[]> & { revision: number }> {
  return JSON.parse(
    await readFile(join(projectRoot, '.tallyback', 'state.json'), 'utf8'),
  ) as Record<string, never[]> & { revision: number };
}

describe('the complete loop through public CLI commands only', () => {
  it('runs init → task → declare → workspace → bind → dispatch → evidence/claim → check → settle', async () => {
    const root = await tempRoot('tallyback-cli-');
    const worktree = await tempRoot('tallyback-cli-wt-');

    // 1. init
    const init = (await tb(
      root,
      'init',
      '--repository',
      'main',
      '--topic',
      'release',
      '--goal',
      'ship v1',
    )) as unknown as {
      project_id: string;
      repositories: { repository_id: string }[];
      topics: { topic_id: string }[];
    };
    expect(init.project_id).toMatch(/^prj_/);
    const repositoryId = init.repositories[0]!.repository_id;
    const topicId = init.topics[0]!.topic_id;

    // 2. create a Task with a canonical id and a local human alias
    const task = (await tb(
      root,
      'task',
      '--topic-id',
      topicId,
      '--title',
      'Implement validation',
      '--alias',
      'T1',
    )) as unknown as {
      task: { task_id: string; alias: string };
    };
    expect(task.task.task_id).toMatch(/^tsk_/);
    expect(task.task.alias).toBe('T1');

    // 3. declare — addressed by the LOCAL ALIAS, which resolves at the edge
    const declared = (await tb(
      root,
      'declare',
      '--task-id',
      'T1',
      '--objective',
      'Implement validation for imported records.',
      '--criterion',
      'invalid-record-rejected:An invalid record is rejected.',
      '--actor',
      'human:alice',
    )) as unknown as {
      declaration: { declaration_id: string; task_id: string };
    };
    const declarationId = declared.declaration.declaration_id;
    // The alias never becomes a wire reference: the record carries the canonical id.
    expect(declared.declaration.task_id).toBe(task.task.task_id);

    // 4. register + bind a Workspace
    const workspace = (await tb(
      root,
      'workspace',
      '--repository-id',
      repositoryId,
      '--branch',
      'main',
    )) as unknown as { workspace: { workspace_id: string } };
    const workspaceId = workspace.workspace.workspace_id;
    const bound = (await tb(
      root,
      'bind',
      '--repository-id',
      repositoryId,
      '--workspace-id',
      workspaceId,
      '--root',
      worktree,
    )) as unknown as { ok: boolean };
    expect(bound.ok).toBe(true);

    // 5. dispatch
    const dispatched = (await tb(
      root,
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
      'subagent:agent-7',
      '--dispatcher',
      'human:alice',
    )) as unknown as { attempt: { attempt_id: string } };
    const attemptId = dispatched.attempt.attempt_id;

    // 6. evidence + claim
    const evidence = (await tb(
      root,
      'evidence',
      '--kind',
      'observation',
      '--payload',
      '{"text":"the validation logic was added"}',
      '--actor',
      'executor:agent-7',
    )) as unknown as { evidence: { evidence_id: string } };
    const claim = (await tb(
      root,
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
      'executor:agent-7',
    )) as unknown as { claim: { claim_id: string } };

    // 7. begin check — a named provider interface, never a command string
    const begun = (await tb(
      root,
      'begin-check',
      '--claim-id',
      claim.claim.claim_id,
      '--checker-id',
      'done-or-not',
      '--checker-version',
      '1',
    )) as unknown as {
      invocation: { check_invocation_id: string };
    };
    const invocationId = begun.invocation.check_invocation_id;

    // 8. record the check output through structured inputs
    const recorded = (await tb(
      root,
      'record-check',
      '--invocation-id',
      invocationId,
      '--outcome',
      'verdict_withheld',
      '--diagnostic',
      'check.declaration_semantics_missing:no installed checker semantics',
    )) as unknown as { ok: boolean; check_result: { check_result_id: string } };
    expect(recorded.ok).toBe(true);

    // 9. settle
    const settled = (await tb(
      root,
      'settle',
      '--task-id',
      'T1',
      '--attempt-id',
      attemptId,
      '--decision',
      'accept',
      '--verification-exception',
      'accepted by hand: no checker semantics installed',
      '--rationale',
      'reviewed by hand',
      '--actor',
      'human:alice',
    )) as unknown as {
      ok: boolean;
    };
    expect(settled.ok).toBe(true);

    // The persisted ledger carries the whole loop.
    const state = await stateOf(root);
    for (const collection of [
      'topics',
      'tasks',
      'declarations',
      'workspaces',
      'attempts',
      'evidence',
      'claims',
      'check_invocations',
      'check_results',
      'settlements',
    ]) {
      expect(state[collection], collection).toHaveLength(1);
    }
    expect(state.revision).toBe(9);

    // The absolute worktree path lives only in the machine-local bindings.
    expect(JSON.stringify(state)).not.toContain(worktree);
    const bindings = (await tb(root, 'bindings')) as unknown as {
      repositories: Record<string, { workspaces: Record<string, { root: string }> }>;
    };
    expect(bindings.repositories[repositoryId]?.workspaces[workspaceId]?.root).toBe(worktree);
  }, 120_000);

  it('lists the ids a caller needs, and resolves an ambiguous alias to nothing', async () => {
    const root = await tempRoot('tallyback-cli-');
    const init = (await tb(
      root,
      'init',
      '--repository',
      'main',
      '--topic',
      'release',
    )) as unknown as {
      topics: { topic_id: string }[];
    };
    const topicId = init.topics[0]!.topic_id;
    await tb(root, 'task', '--topic-id', topicId, '--title', 'first', '--alias', 'DUP');
    await tb(root, 'task', '--topic-id', topicId, '--title', 'second', '--alias', 'DUP');

    const listed = (await tb(root, 'list', '--what', 'tasks')) as unknown as {
      tasks: { alias: string }[];
    };
    expect(listed.tasks).toHaveLength(2);

    // An ambiguous alias is refused rather than resolved to an arbitrary Task.
    const run = await runRaw(root, [
      'declare',
      '--task-id',
      'DUP',
      '--objective',
      'x',
      '--criterion',
      'c:s',
    ]);
    expect(run.code).not.toBe(0);
    expect(run.stderr).toContain('unambiguous local alias');
  }, 60_000);

  it('never accepts a checker command string', async () => {
    const root = await tempRoot('tallyback-cli-');
    await tb(root, 'init', '--repository', 'main', '--topic', 'release');
    // There is no flag that would take one; the command fails on the missing required ids.
    const run = await runRaw(root, ['begin-check', '--checker-command', 'rm -rf /']);
    expect(run.code).not.toBe(0);
    expect(run.stderr).toContain('--claim-id');
    expect(await stateOf(root).then((s) => s.check_invocations)).toHaveLength(0);
  }, 60_000);
});

describe('the migrate CLI entry point', () => {
  it('previews without writing, applies once, and refuses a rerun', async () => {
    const root = await tempRoot('tallyback-cli-mig-');
    const legacyPath = join(root, 'legacy-store.json');
    await (
      await import('node:fs/promises')
    ).writeFile(
      legacyPath,
      JSON.stringify({
        topics: [{ name: 'work', goal: 'ship', tasks: [{ id: 'T1', title: 'a task' }] }],
      }),
      'utf8',
    );

    const preview = (await tb(root, 'migrate', '--source', legacyPath)) as unknown as {
      kind: string;
      wrote: boolean;
      report: { mapping: { tasks: { task_id: string }[] } };
    };
    expect(preview.kind).toBe('preview');
    expect(preview.wrote).toBe(false);
    await expect(stateOf(root)).rejects.toThrow();

    const applied = (await tb(root, 'migrate', '--source', legacyPath, '--apply')) as unknown as {
      kind: string;
      wrote: boolean;
      report: { mapping: { tasks: { task_id: string }[] } };
    };
    expect(applied.kind).toBe('applied');
    expect(applied.wrote).toBe(true);
    // Preview and apply agree on identity.
    expect(applied.report.mapping.tasks[0]!.task_id).toBe(preview.report.mapping.tasks[0]!.task_id);
    expect((await stateOf(root)).tasks).toHaveLength(1);

    const rerun = await runRaw(root, ['migrate', '--source', legacyPath, '--apply']);
    expect(rerun.code).not.toBe(0);
    expect(rerun.stderr).toContain('mutation.migration_already_applied');
  }, 120_000);
});
