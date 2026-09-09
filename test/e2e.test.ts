/**
 * The genuine end-to-end test: the `tallyback` CLI as a real subprocess, against a real
 * git repository on disk, with real `runtime/bindings.json` written by the CLI's own
 * `bind` command — exercising the REAL `createGitResolver`/`createWatchResolver` Git
 * plumbing, not a fake resolver or an in-memory Store.
 *
 * Every other suite proves Land/View/Watch's logic against a fake, injected resolver
 * (`land.test.ts`, `watch.test.ts`) or drives the CLI with no real worktree bound
 * (their own CLI-wiring tests). This file is the one place both are real at once.
 */

import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
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

async function tb(projectRoot: string, ...args: string[]): Promise<Record<string, never>> {
  const { stdout } = await execFileAsync(TSX, [CLI, ...args, '--project-root', projectRoot], {
    cwd: ROOT,
  });
  return JSON.parse(stdout) as Record<string, never>;
}

async function git(root: string, ...args: string[]): Promise<void> {
  await execFileAsync('git', ['-C', root, ...args]);
}

/**
 * A real git repository, separate from the tallyback project root — mirroring how a real
 * worktree is separate from `.tallyback/` — with `main` at one commit, and a `feature`
 * branch that is either genuinely ahead of it (a new file, one commit) or identical to it.
 */
async function initGitRepo(advanceFeature: boolean): Promise<{ root: string; newFile: string }> {
  const root = await tempRoot('tallyback-e2e-git-');
  await git(root, 'init', '-q', '-b', 'main');
  await git(root, 'config', 'user.email', 'a@b.c');
  await git(root, 'config', 'user.name', 'x');
  await writeFile(join(root, 'base.txt'), 'base', 'utf8');
  await git(root, 'add', '.');
  await git(root, 'commit', '-q', '-m', 'init');

  const newFile = 'feature-a.txt';
  await git(root, 'checkout', '-q', '-b', 'feature');
  if (advanceFeature) {
    await writeFile(join(root, newFile), 'the new file', 'utf8');
    await git(root, 'add', '.');
    await git(root, 'commit', '-q', '-m', 'feature: add file');
  }
  await git(root, 'checkout', '-q', 'main');

  return { root, newFile };
}

describe('e2e — the full loop through the real CLI, a real git repository, and real bindings', () => {
  it(
    'reaches a land-ready, settled task and agrees across land/view/watch/validate',
    async () => {
      const projectRoot = await tempRoot('tallyback-e2e-golden-');

      const shake = (await tb(projectRoot, 'handshake')) as unknown as {
        command_api_version: string;
        supported_contract_versions: string[];
        features: string[];
      };
      expect(typeof shake.command_api_version).toBe('string');
      expect(shake.supported_contract_versions.length).toBeGreaterThan(0);
      expect(shake.features).toEqual(expect.arrayContaining(['land', 'view', 'watch']));

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

      const { root: gitRoot, newFile } = await initGitRepo(true);

      const workspace = (await tb(
        projectRoot,
        'workspace',
        '--repository-id',
        repositoryId,
        '--branch',
        'feature',
      )) as unknown as { workspace: { workspace_id: string } };
      const workspaceId = workspace.workspace.workspace_id;

      const bound = (await tb(
        projectRoot,
        'bind',
        '--repository-id',
        repositoryId,
        '--workspace-id',
        workspaceId,
        '--root',
        gitRoot,
      )) as unknown as { ok: boolean };
      expect(bound.ok).toBe(true);

      const task = (await tb(
        projectRoot,
        'task',
        '--topic-id',
        topicId,
        '--title',
        'Implement validation',
        '--alias',
        'T1',
      )) as unknown as { task: { task_id: string } };
      const taskId = task.task.task_id;

      const declared = (await tb(
        projectRoot,
        'declare',
        '--task-id',
        'T1',
        '--objective',
        'Implement validation.',
        '--criterion',
        'invalid-rejected:An invalid record is rejected.',
      )) as unknown as { declaration: { declaration_id: string } };
      const declarationId = declared.declaration.declaration_id;

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
        'subagent:agent-e2e',
      )) as unknown as { attempt: { attempt_id: string } };
      const attemptId = dispatched.attempt.attempt_id;

      const evidence = (await tb(
        projectRoot,
        'evidence',
        '--kind',
        'observation',
        '--payload',
        '{"text":"work done on feature branch"}',
      )) as unknown as { evidence: { evidence_id: string } };

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
      )) as unknown as { claim: { claim_id: string } };

      const begun = (await tb(
        projectRoot,
        'begin-check',
        '--claim-id',
        claim.claim.claim_id,
        '--checker-id',
        'done-or-not',
        '--checker-version',
        '1',
      )) as unknown as { invocation: { check_invocation_id: string } };

      await tb(
        projectRoot,
        'record-check',
        '--invocation-id',
        begun.invocation.check_invocation_id,
        '--outcome',
        'verdict_withheld',
        '--diagnostic',
        'check.checker_semantics_missing:no checker installed',
      );

      const settled = (await tb(
        projectRoot,
        'settle',
        '--task-id',
        'T1',
        '--attempt-id',
        attemptId,
        '--decision',
        'land',
        '--verification-exception',
        'accepted by hand: no checker semantics installed',
        '--rationale',
        'reviewed manually',
      )) as unknown as { ok: boolean };
      expect(settled.ok).toBe(true);

      // Land: real `git diff --name-only main...feature` against the real repository.
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

      // View: the settled decision and ready_to_land status agree.
      const view = (await tb(projectRoot, 'view')) as unknown as {
        tasks: { task_id: string; next_action: string; status: { ready_to_land: boolean } }[];
      };
      const taskView = view.tasks.find((t) => t.task_id === taskId);
      expect(taskView).toBeDefined();
      expect(taskView!.next_action).toBe('settled: land');
      expect(taskView!.status.ready_to_land).toBe(true);

      // Watch: an effective Settlement excludes this attempt from open-attempt findings.
      const watch = (await tb(
        projectRoot,
        'watch',
        '--stale-after-ms',
        String(Number.MAX_SAFE_INTEGER),
      )) as unknown as { findings: { attempt_id: string }[] };
      expect(watch.findings.filter((f) => f.attempt_id === attemptId)).toHaveLength(0);

      // Validate: the whole ledger built through this scenario is internally consistent.
      const validated = (await tb(projectRoot, 'validate')) as unknown as { ok: boolean };
      expect(validated.ok).toBe(true);
    },
    120_000,
  );

  it(
    'flags a claimed but unadvanced branch as inconsistent, and land ignores the unsettled attempt',
    async () => {
      const projectRoot = await tempRoot('tallyback-e2e-open-');

      const init = (await tb(projectRoot, 'init', '--repository', 'main', '--topic', 'release')) as unknown as {
        repositories: { repository_id: string }[];
        topics: { topic_id: string }[];
      };
      const repositoryId = init.repositories[0]!.repository_id;
      const topicId = init.topics[0]!.topic_id;

      // Zero commits past `main`: the feature branch exists but has advanced nothing.
      const { root: gitRoot } = await initGitRepo(false);

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
        'Fix a bug',
        '--alias',
        'T1',
      )) as unknown as { task: { task_id: string } };
      const taskId = task.task.task_id;

      const declared = (await tb(
        projectRoot,
        'declare',
        '--task-id',
        'T1',
        '--objective',
        'Fix the bug.',
        '--criterion',
        'bug-fixed:The bug no longer reproduces.',
      )) as unknown as { declaration: { declaration_id: string } };

      const dispatched = (await tb(
        projectRoot,
        'dispatch',
        '--task-id',
        'T1',
        '--declaration-id',
        declared.declaration.declaration_id,
        '--repository-id',
        repositoryId,
        '--workspace-id',
        workspaceId,
        '--executor',
        'subagent:agent-e2e-2',
      )) as unknown as { attempt: { attempt_id: string } };
      const attemptId = dispatched.attempt.attempt_id;

      const evidence = (await tb(
        projectRoot,
        'evidence',
        '--kind',
        'observation',
        '--payload',
        '{"text":"claimed done, but nothing was actually committed"}',
      )) as unknown as { evidence: { evidence_id: string } };

      // A Claim exists on this attempt, but the bound branch has no new commits.
      await tb(
        projectRoot,
        'claim',
        '--task-id',
        'T1',
        '--attempt-id',
        attemptId,
        '--declaration-id',
        declared.declaration.declaration_id,
        '--statement',
        'The bug is fixed.',
        '--evidence',
        evidence.evidence.evidence_id,
      );

      const watch = (await tb(projectRoot, 'watch')) as unknown as {
        findings: { attempt_id: string; kind: string; detail?: { claim_count?: number } }[];
      };
      const inconsistent = watch.findings.filter(
        (f) => f.attempt_id === attemptId && f.kind === 'inconsistent',
      );
      expect(inconsistent).toHaveLength(1);
      expect(inconsistent[0]!.detail).toMatchObject({ claim_count: 1 });

      // No effective land Settlement yet: outside ready_to_land entirely, so this task is
      // absent from both `ready` and `unresolved`.
      const land = (await tb(projectRoot, 'land', '--target-branch', 'main')) as unknown as {
        ready: { task_id: string }[];
        unresolved: { task_id: string }[];
      };
      expect(land.ready.some((r) => r.task_id === taskId)).toBe(false);
      expect(land.unresolved.some((r) => r.task_id === taskId)).toBe(false);
    },
    120_000,
  );
});
