/**
 * `declare` without criteria must be deliberate.
 *
 * Dogfood (3×3 benchmark, F1 — 9/9 runs): every run's first declaration had no criteria
 * (`--objective` alone, or a misspelled criteria flag), and `tallyback verdict` could not
 * assess it later — Haiku never recovered in 3/3 runs; the rest superseded, sometimes with
 * placeholder Attempts. The contract permits a criteria-less declaration, so the Store still
 * accepts one; the CLI requires saying so with `--no-criteria`.
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

async function tb(root: string, args: string[]): Promise<Record<string, unknown>> {
  try {
    const { stdout } = await execFileAsync(TSX, [CLI, ...args, '--project-root', root], {
      cwd: ROOT,
    });
    return JSON.parse(stdout) as Record<string, unknown>;
  } catch (err) {
    return JSON.parse((err as { stdout: string }).stdout) as Record<string, unknown>;
  }
}

async function taskIn(root: string): Promise<string> {
  await tb(root, ['init', '--topic', 't']);
  const topic = (
    (await tb(root, ['list', '--what', 'topics']))['topics'] as { topic_id: string }[]
  )[0]!.topic_id;
  return (
    (await tb(root, ['task', '--topic-id', topic, '--title', 'x']))['task'] as { task_id: string }
  ).task_id;
}

describe('declare and acceptance criteria', () => {
  it('refuses a declaration without criteria unless --no-criteria is given, writing nothing', async () => {
    const root = await tempRoot('tallyback-declare-');
    const task = await taskIn(root);
    const statePath = join(root, '.tallyback', 'state.json');
    const before = await readFile(statePath, 'utf8');

    const bare = await tb(root, ['declare', '--task-id', task, '--objective', 'fix it']);
    expect(bare['code']).toBe('cli.missing_flag');
    expect(String(bare['message'])).toContain('--criterion');
    expect(String(bare['message'])).toContain('--no-criteria');

    const both = await tb(root, [
      'declare',
      '--task-id',
      task,
      '--objective',
      'o',
      '--criterion',
      'a:b',
      '--no-criteria',
    ]);
    expect(both['code']).toBe('cli.invalid_value');
    expect(await readFile(statePath, 'utf8')).toBe(before);

    const deliberate = await tb(root, [
      'declare',
      '--task-id',
      task,
      '--objective',
      'o',
      '--no-criteria',
    ]);
    expect(deliberate['ok']).toBe(true);
    expect((deliberate['declaration'] as { criteria: unknown[] }).criteria).toEqual([]);
  }, 60_000);

  it('records declared criteria as before', async () => {
    const root = await tempRoot('tallyback-declare-');
    const task = await taskIn(root);
    const run = await tb(root, [
      'declare',
      '--task-id',
      task,
      '--objective',
      'o',
      '--criterion',
      'a:first',
      '--criterion',
      'b:second',
    ]);
    expect(
      (run['declaration'] as { criteria: { code: string }[] }).criteria.map((c) => c.code),
    ).toEqual(['a', 'b']);
  }, 60_000);
});
