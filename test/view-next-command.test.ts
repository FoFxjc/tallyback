/**
 * `view` gives each task a runnable next command.
 *
 * Dogfood (3×3 benchmark, F10 — 9/9 runs): bootstrap guidance was followed without a
 * single failure, and failures began exactly where guidance became a phase name
 * ("declare", "dispatch", "verify (record-check)"). F9: `status.ready_to_land` is the
 * ledger half of readiness by design (SPEC §7.2; Git is `tallyback land`), but nothing
 * said so, and `next_action: "settle"` after a withheld verdict read as "ready". `next_action`
 * is unchanged; `next_command` is the runnable form, never pre-selecting a decision or an
 * assessment.
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

interface NextCommand {
  command: string;
  reason: string;
  requires: string[];
}

async function tb(
  root: string,
  args: string[],
): Promise<{ code: number; json: Record<string, unknown> }> {
  try {
    const { stdout } = await execFileAsync(TSX, [CLI, ...args, '--project-root', root], {
      cwd: ROOT,
    });
    return { code: 0, json: JSON.parse(stdout) as Record<string, unknown> };
  } catch (err) {
    const e = err as { code?: number; stdout?: string };
    return { code: e.code ?? 1, json: JSON.parse(e.stdout ?? '{}') as Record<string, unknown> };
  }
}

/** Split a guidance command the way a shell would (single quotes only, as filled below). */
function argv(command: string): string[] {
  const out: string[] = [];
  for (const m of command.matchAll(/'([^']*)'|(\S+)/g)) out.push(m[1] ?? m[2]!);
  return out.slice(1);
}

const FILL: Record<string, string> = {
  name: 'demo',
  title: 'fix slugify',
  objective: 'slugify drops punctuation',
  'code:statement': 'punct:punctuation is removed',
  branch: 'main',
  'kind:id': 'executor:scripted-agent',
  statement: 'removed punctuation; tests pass',
  'low|medium|high': 'high',
  text: 'pytest -q: 5 passed; new test fails on the unfixed code',
};

/** Follow `view` guidance, filling only placeholders, until `stop(view)` or no command. */
async function follow(
  root: string,
  choices: Record<string, string>,
  stop: (task: Record<string, unknown> | undefined) => boolean,
): Promise<Record<string, unknown>> {
  for (let step = 0; step < 20; step++) {
    const view = await tb(root, ['view']);
    const tasks = (view.json['tasks'] as Record<string, unknown>[] | undefined) ?? [];
    if (stop(tasks[0])) return tasks[0]!;
    const next = (
      tasks.length ? tasks[0]!['next_command'] : view.json['next_action']
    ) as NextCommand | null;
    expect(next, `step ${step}: no next command`).toBeTruthy();
    let command = next!.command;
    if (command.includes('<evi_…>')) {
      const ev = await tb(root, [
        'evidence',
        '--kind',
        'test_run',
        '--payload',
        '{"command":"pytest -q","exit_code":0}',
        '--note',
        '5 passed',
      ]);
      command = command.replace(
        '<evi_…>',
        (ev.json['evidence'] as { evidence_id: string }).evidence_id,
      );
    }
    for (const [k, v] of Object.entries({ ...FILL, ...choices }))
      command = command.split(`<${k}>`).join(/\s/.test(v) ? `'${v}'` : v);
    expect(command, 'unfilled placeholder').not.toMatch(/<[^>]+>/);
    const args = argv(command).filter(
      (a, i, all) => a !== '--project-root' && all[i - 1] !== '--project-root',
    );
    const run = await tb(root, args);
    expect(run.code, `step ${step}: ${command}\n${JSON.stringify(run.json)}`).toBe(0);
  }
  throw new Error('did not converge');
}

describe('following next_command from an empty repository', () => {
  it('reaches an explicit settlement with no failed command', async () => {
    const root = await tempRoot('tallyback-next-');
    await execFileAsync('git', ['-C', root, 'init', '-q']);
    const task = await follow(
      root,
      { assessment: 'supported', 'accept|retry|abandon|land': 'accept' },
      (t) =>
        typeof t?.['next_action'] === 'string' && String(t['next_action']).startsWith('settled'),
    );
    expect(task['next_action']).toBe('settled: accept');
    expect(task['next_command']).toBeNull();
    expect((await tb(root, ['validate'])).code).toBe(0);
  }, 180_000);
});

describe('what next_command says at the settle and land boundaries', () => {
  it('explains the basis rule when no positive Verdict exists, without choosing a decision', async () => {
    const root = await tempRoot('tallyback-next-');
    await follow(root, {}, (t) => t?.['next_action'] === 'verify (begin-check)');
    const claim = (
      (await tb(root, ['view'])).json['tasks'] as { claims: { claim_id: string }[] }[]
    )[0]!.claims[0]!.claim_id;
    const begin = await tb(root, [
      'begin-check',
      '--claim-id',
      claim,
      '--checker-id',
      'pytest',
      '--checker-version',
      '8',
    ]);
    const invocation = (begin.json['invocation'] as { check_invocation_id: string })
      .check_invocation_id;
    await tb(root, [
      'record-check',
      '--invocation-id',
      invocation,
      '--outcome',
      'verdict_withheld',
    ]);
    const task = ((await tb(root, ['view'])).json['tasks'] as Record<string, unknown>[])[0]!;
    expect(task['next_action']).toBe('settle');
    const next = task['next_command'] as NextCommand;
    expect(next.command).toContain('--decision <accept|retry|abandon|land>');
    expect(next.command).not.toContain('--verdict-id');
    expect(next.reason).toContain('--verification-exception');
  }, 180_000);

  it('points a ledger-ready task at `tallyback land` for the Git half', async () => {
    const root = await tempRoot('tallyback-next-');
    const task = await follow(
      root,
      { assessment: 'supported', 'accept|retry|abandon|land': 'land' },
      (t) =>
        typeof t?.['next_action'] === 'string' && String(t['next_action']).startsWith('settled'),
    );
    expect((task['status'] as { ready_to_land: boolean }).ready_to_land).toBe(true);
    const next = task['next_command'] as NextCommand;
    expect(next.command).toBe('tallyback land');
    expect(next.reason).toContain('ledger half');
  }, 180_000);
});
