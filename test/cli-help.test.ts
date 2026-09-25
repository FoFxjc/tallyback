/**
 * Per-command help and the declared command surface.
 *
 * Dogfood (3×3 benchmark, F3): every run discovered required flags one
 * `missing required --x` error at a time, and `tallyback <cmd> --help` was parsed and
 * ignored — `tallyback task … --help` created a Task. Help must describe the command and
 * must never run it.
 */

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { COMMAND_SPECS, GLOBAL_FLAGS } from '../src/cli-spec.js';
import { tempRoot } from './helpers/ledger.js';

const execFileAsync = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TSX = join(ROOT, 'node_modules', '.bin', 'tsx');
const CLI = join(ROOT, 'src', 'cli.ts');

async function tb(
  root: string,
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(TSX, [CLI, ...args, '--project-root', root], {
      cwd: ROOT,
    });
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return { code: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

async function stateOf(root: string): Promise<Record<string, unknown[]>> {
  return JSON.parse(await readFile(join(root, '.tallyback', 'state.json'), 'utf8')) as Record<
    string,
    unknown[]
  >;
}

describe('the declared command surface matches what the CLI reads', () => {
  it('declares every flag the CLI source reads, and reads every declared flag', async () => {
    const source = await readFile(CLI, 'utf8');
    const read = new Set<string>();
    for (const m of source.matchAll(/\(\s*args,\s*'([a-z-]+)'/g)) read.add(m[1]!);
    for (const m of source.matchAll(/args\['([a-z-]+)'\]/g)) read.add(m[1]!);
    read.add('task-id'); // read through taskRef()/taskRefs() defaults
    const declared = new Set<string>();
    for (const spec of COMMAND_SPECS.values()) for (const f of spec.flags) declared.add(f.name);
    for (const f of GLOBAL_FLAGS) declared.add(f.name);
    expect([...read].filter((f) => !declared.has(f)).sort()).toEqual([]);
    expect([...declared].filter((f) => !read.has(f)).sort()).toEqual([]);
  });

  it('has a spec for every command the CLI dispatches', async () => {
    const source = await readFile(CLI, 'utf8');
    const handled = new Set<string>();
    for (const m of source.matchAll(/case '([a-z-]+)':/g)) handled.add(m[1]!);
    for (const m of source.matchAll(/command === '([a-z-]+)'/g)) handled.add(m[1]!);
    handled.delete('help');
    handled.delete('--help');
    expect([...handled].filter((c) => !COMMAND_SPECS.has(c)).sort()).toEqual([]);
  });
});

describe('per-command help', () => {
  it('lists required flags, accepted values, and an example', async () => {
    const root = await tempRoot('tallyback-help-');
    const run = await tb(root, ['declare', '--help']);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain('Usage: tallyback declare --task-id');
    expect(run.stdout).toContain('--criterion <code:statement>  (repeatable)');
    expect(run.stdout).toMatch(/Examples:\n {2}tallyback declare /);

    const settle = await tb(root, ['help', 'settle']);
    expect(settle.code).toBe(0);
    expect(settle.stdout).toContain('--decision <accept|retry|abandon|land>');
    expect(settle.stdout).toContain('--verdict-id');
    expect(settle.stdout).toContain('--verification-exception');
  });

  it('never runs the command, even with otherwise valid mutating flags', async () => {
    const root = await tempRoot('tallyback-help-');
    await execFileAsync(TSX, [CLI, 'init', '--topic', 't', '--project-root', root], { cwd: ROOT });
    const topics = (await stateOf(root))['topics'] as { topic_id: string }[];
    const before = await readFile(join(root, '.tallyback', 'state.json'), 'utf8');
    const run = await tb(root, [
      'task',
      '--topic-id',
      topics[0]!.topic_id,
      '--title',
      'x',
      '--help',
    ]);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain('tallyback task');
    expect(await readFile(join(root, '.tallyback', 'state.json'), 'utf8')).toBe(before);
  });

  it('works without a ledger and rejects an unknown help topic', async () => {
    const root = await tempRoot('tallyback-help-');
    expect((await tb(root, ['view', '--help'])).code).toBe(0);
    const unknown = await tb(root, ['help', 'nope']);
    expect(unknown.code).toBe(1);
    expect(unknown.stderr).toContain('unknown command "nope"');
  });
});
