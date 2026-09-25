/**
 * Unknown CLI input fails closed.
 *
 * Dogfood (3×3 benchmark, F2 — 9/9 runs): undeclared flags were silently ignored while the
 * command still wrote. `declare --criteria …` recorded a criteria-less declaration,
 * `declare … --dry-run` recorded a real one, `dispatch --branch` dropped the branch, and a
 * positional `task fix-bug` token vanished. Every such input must now be rejected with a
 * machine-readable code before the ledger is touched.
 */

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { tempRoot } from './helpers/ledger.js';

const execFileAsync = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TSX = join(ROOT, 'node_modules', '.bin', 'tsx');
const CLI = join(ROOT, 'src', 'cli.ts');

interface Run {
  code: number;
  stderr: string;
  json: Record<string, unknown>;
}

async function tb(root: string, args: string[]): Promise<Run> {
  let code = 0;
  let stdout = '';
  let stderr = '';
  try {
    ({ stdout, stderr } = await execFileAsync(TSX, [CLI, ...args, '--project-root', root], {
      cwd: ROOT,
    }));
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    code = e.code ?? 1;
    stdout = e.stdout ?? '';
    stderr = e.stderr ?? '';
  }
  return { code, stderr, json: stdout ? (JSON.parse(stdout) as Record<string, unknown>) : {} };
}

describe('unknown input never reaches the ledger', () => {
  it('rejects undeclared, repeated, and positional input with codes, leaving state.json untouched', async () => {
    const root = await tempRoot('tallyback-closed-');
    await tb(root, ['init', '--topic', 't']);
    const topic = (
      (await tb(root, ['list', '--what', 'topics'])).json['topics'] as {
        topic_id: string;
      }[]
    )[0]!.topic_id;
    const task = (
      (await tb(root, ['task', '--topic-id', topic, '--title', 'x'])).json['task'] as {
        task_id: string;
      }
    ).task_id;
    const statePath = join(root, '.tallyback', 'state.json');
    const before = await readFile(statePath, 'utf8');

    const cases: [string[], string, string][] = [
      [
        ['declare', '--task-id', task, '--objective', 'o', '--criteria', 'a:b'],
        'cli.unknown_flag',
        '--criterion',
      ],
      [
        ['declare', '--task-id', task, '--objective', 'o', '--dry-run'],
        'cli.unknown_flag',
        '--dry-run',
      ],
      [
        ['declare', '--task-id', task, '--objective', 'o', '--objective', 'p'],
        'cli.repeated_flag',
        '--objective',
      ],
      [
        ['task', 'fix-bug', '--topic-id', topic, '--title', 'y'],
        'cli.unexpected_argument',
        'fix-bug',
      ],
      [
        [
          'settle',
          '--task-id',
          task,
          '--attempt-id',
          'a',
          '--decision',
          'land',
          '--rationale',
          'r',
          '--basis-verification-exception',
          'x',
        ],
        'cli.unknown_flag',
        '--verification-exception',
      ],
      [['task', '--topic-id', topic, '--title', 'y', '--descr=zzz'], 'cli.unknown_flag', '--descr'],
    ];
    for (const [args, code, mention] of cases) {
      const run = await tb(root, args);
      expect(run.code, args.join(' ')).toBe(1);
      expect(run.json['ok'], args.join(' ')).toBe(false);
      expect(run.json['code'], args.join(' ')).toBe(code);
      expect(String(run.json['message']), args.join(' ')).toContain(mention);
      expect(run.stderr, args.join(' ')).toContain(`${code}: `);
    }
    expect(await readFile(statePath, 'utf8')).toBe(before);
  }, 90_000);

  it('suggests the flag that was probably meant', async () => {
    const root = await tempRoot('tallyback-closed-');
    const run = await tb(root, [
      'declare',
      '--task-id',
      't',
      '--objective',
      'o',
      '--criteria',
      'x',
    ]);
    expect(String(run.json['message'])).toContain('Did you mean --criterion?');
  });

  it('rejects before looking for a ledger', async () => {
    const root = await tempRoot('tallyback-closed-');
    const run = await tb(root, ['view', '--taskid', 'x']);
    expect(run.json['code']).toBe('cli.unknown_flag');
  });
});
