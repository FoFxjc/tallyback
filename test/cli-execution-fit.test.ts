/**
 * Execution Fit through the CLI (Bridge skill behaviour recorded as a Decision).
 *
 * Dogfood (fit cold-return, 4/4 resuming sessions): a fresh executor's own Fit on an Attempt
 * that already had one was refused `invariant.supersession_conflict`, and finding the earlier
 * Fit took 3-8 `show`/history calls. Haiku read the refusal as "a Fit already exists" and
 * adopted the other executor's FIT. This pins the repair: `view` surfaces the current Fit
 * per Attempt, and the refusal's hint says to supersede it with one's own.
 */

import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { tempRoot } from './helpers/ledger.js';

const execFileAsync = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TSX = join(ROOT, 'node_modules', '.bin', 'tsx');
const CLI = join(ROOT, 'src', 'cli.ts');

type Json = Record<string, any>;

async function tb(root: string, args: string[]): Promise<Json> {
  try {
    const { stdout } = await execFileAsync(TSX, [CLI, ...args, '--project-root', root], {
      cwd: ROOT,
    });
    return JSON.parse(stdout) as Json;
  } catch (err) {
    return JSON.parse((err as { stdout: string }).stdout) as Json;
  }
}

describe('a resuming executor sees the previous Fit and records its own over it', () => {
  it('view shows execution_fit; a parallel Fit is refused with a supersede hint', async () => {
    const root = await tempRoot('tallyback-cli-fit-');
    const init = await tb(root, ['init']);
    const repo = init['repositories'][0]['repository_id'] as string;
    const topic = await tb(root, ['topic', '--name', 't', '--goal', 'g']);
    const task = await tb(root, ['task', '--topic-id', topic['topic']['topic_id'], '--title', 'x']);
    const taskId = task['task']['task_id'] as string;
    const dcl = await tb(root, [
      'declare',
      '--task-id',
      taskId,
      '--objective',
      'o',
      '--criterion',
      'c1:works',
    ]);
    const wsp = await tb(root, ['workspace', '--repository-id', repo, '--branch', 'main']);
    const att = await tb(root, [
      'dispatch',
      '--task-id',
      taskId,
      '--declaration-id',
      dcl['declaration']['declaration_id'],
      '--repository-id',
      repo,
      '--workspace-id',
      wsp['workspace']['workspace_id'],
      '--executor',
      'executor:session-a',
    ]);
    const attemptId = att['attempt']['attempt_id'] as string;
    const decide = (actor: string, choice: string, extra: string[] = []) =>
      tb(root, [
        'decision',
        '--subject-kind',
        'attempt',
        '--subject-id',
        attemptId,
        '--role',
        'execution_choice',
        '--question',
        'Execution fit',
        '--choice',
        choice,
        '--rationale',
        'hardest: …; evidence: …',
        '--actor',
        actor,
        ...extra,
      ]);

    const a = await decide('executor:session-a', 'FIT: local fix');
    expect(a['ok'], JSON.stringify(a)).toBe(true);

    let view = await tb(root, ['view']);
    const fitA = view['tasks'][0]['attempts'][0]['execution_fit'];
    expect(fitA).toMatchObject({
      decision_id: a['decision']['decision_id'],
      decided_by: { kind: 'executor', id: 'session-a' },
      assessment: 'FIT',
      supersedes: null,
    });

    const refused = await decide('executor:session-b', 'CONDITIONAL: no staging');
    expect(refused['code']).toBe('invariant.supersession_conflict');
    expect(refused['hint']).toContain('--supersedes');
    expect(refused['hint']).toContain('execution_fit');
    expect(refused['hint']).toContain('do not reuse it');

    const b = await decide('executor:session-b', 'CONDITIONAL: no staging', [
      '--supersedes',
      fitA['decision_id'],
    ]);
    expect(b['ok'], JSON.stringify(b)).toBe(true);
    view = await tb(root, ['view']);
    expect(view['tasks'][0]['attempts'][0]['execution_fit']).toMatchObject({
      decided_by: { kind: 'executor', id: 'session-b' },
      assessment: 'CONDITIONAL',
      supersedes: fitA['decision_id'],
      concurrent: [],
    });
  }, 60_000);
});
