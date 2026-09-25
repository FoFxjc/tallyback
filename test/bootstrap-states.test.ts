/**
 * Bootstrap/absence states are protocol-readable.
 *
 * Dogfood finding: `tallyback handshake` succeeded, then `tallyback view` in a repository
 * with no ledger surfaced a raw `ENOENT` for `.tallyback/project.json`. A weak model read
 * that as "Tallyback is broken", abandoned it, and reported the task complete from Git and
 * tests alone. "No ledger here" is a machine-known state; it must come back as a structured
 * outcome with one runnable recovery command — and only when absence is actually proven.
 *
 * Pinned here:
 * - proven absence → `mutation.ledger_not_initialized` + `next_action.command`, exit 1;
 * - following the guidance reaches normal View guidance, one record at a time, with every
 *   caller-supplied value named rather than invented;
 * - a partial, corrupt, or contradictory ledger keeps its own failure — never
 *   "not initialized".
 */

import { execFile } from 'node:child_process';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { emptySnapshot, isLedgerAbsent } from '../src/ledger/snapshot.js';
import { deriveLedgerNextAction } from '../src/view/index.js';
import { tempRoot } from './helpers/ledger.js';

const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const TSX = join(ROOT, 'node_modules', '.bin', 'tsx');
const CLI = join(ROOT, 'src', 'cli.ts');
const NOT_INITIALIZED = 'mutation.ledger_not_initialized';

interface CliRun {
  code: number;
  stdout: string;
  stderr: string;
  json: Record<string, unknown>;
}

async function tb(projectRoot: string, args: string[]): Promise<CliRun> {
  let code = 0;
  let stdout = '';
  let stderr = '';
  try {
    ({ stdout, stderr } = await execFileAsync(TSX, [CLI, ...args, '--project-root', projectRoot], {
      cwd: ROOT,
    }));
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    code = e.code ?? 1;
    stdout = e.stdout ?? '';
    stderr = e.stderr ?? '';
  }
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(stdout) as Record<string, unknown>;
  } catch {
    // Non-JSON stdout (a raw failure) leaves `json` empty for the assertion to catch.
  }
  return { code, stdout, stderr, json };
}

/** A fresh Git repository with no `.tallyback` ledger. */
async function freshRepo(): Promise<string> {
  const root = await tempRoot('tallyback-boot-');
  await execFileAsync('git', ['-C', root, 'init', '-q']);
  return root;
}

/** Run a `next_action.command` exactly as given, substituting only `<placeholder>` values. */
async function follow(
  root: string,
  command: string,
  values: Record<string, string> = {},
): Promise<CliRun> {
  const argv = command.split(' ');
  expect(argv[0]).toBe('tallyback');
  const filled = argv.slice(1).map((token) => {
    const placeholder = /^<(.+)>$/.exec(token);
    if (!placeholder) return token;
    const value = values[placeholder[1]!];
    expect(value, `no value supplied for ${token}`).toBeDefined();
    return value!;
  });
  // `tb` appends `--project-root` itself; drop a copy the guidance already carries.
  const i = filled.indexOf('--project-root');
  if (i >= 0) filled.splice(i, 2);
  return tb(root, filled);
}

function expectNotInitialized(run: CliRun, root: string): void {
  expect(run.code).toBe(1);
  expect(run.stdout).not.toContain('ENOENT');
  expect(run.stderr).not.toContain('ENOENT');
  expect(run.json).toEqual({
    ok: false,
    code: NOT_INITIALIZED,
    message: `No Tallyback ledger exists at ${join(root, '.tallyback')}.`,
    next_action: {
      command: `tallyback init --project-root ${root}`,
      reason: expect.any(String) as unknown,
    },
  });
  expect(run.stderr).toContain(`${NOT_INITIALIZED}: `);
}

describe('a repository with no ledger', () => {
  it('view returns a structured not-initialized outcome, never raw ENOENT or success', async () => {
    const root = await freshRepo();
    const run = await tb(root, ['view']);
    expectNotInitialized(run, root);
    expect(run.json).not.toHaveProperty('tasks');
  });

  it('show and a mutating command report the same state', async () => {
    const root = await freshRepo();
    expectNotInitialized(await tb(root, ['show']), root);
    expectNotInitialized(await tb(root, ['topic', '--name', 'x']), root);
    // Nothing was created by being told there is nothing.
    expect(await isLedgerAbsent(root)).toBe(true);
  });

  it('treats an empty .tallyback directory (e.g. only runtime/) as not initialized', async () => {
    const root = await freshRepo();
    await mkdir(join(root, '.tallyback', 'runtime'), { recursive: true });
    expectNotInitialized(await tb(root, ['view']), root);
  });
});

describe('following the guidance reaches per-task View guidance', () => {
  it('init → topic → task, each step named by the previous view', async () => {
    const root = await freshRepo();

    const missing = await tb(root, ['view']);
    const init = await follow(root, (missing.json['next_action'] as { command: string }).command);
    expect(init.code).toBe(0);

    const noTopic = await tb(root, ['view']);
    expect(noTopic.code).toBe(0);
    expect(noTopic.json['tasks']).toEqual([]);
    expect(noTopic.json['next_action']).toEqual({
      command: 'tallyback topic --name <name>',
      reason: expect.any(String) as unknown,
      requires: ['--name'],
    });
    const topic = await follow(root, (noTopic.json['next_action'] as { command: string }).command, {
      name: 'release',
    });
    expect(topic.code).toBe(0);

    const noTask = await tb(root, ['view']);
    const taskAction = noTask.json['next_action'] as { command: string; requires: string[] };
    // The only Topic is mechanically known, so only the title is left to the caller.
    expect(taskAction.command).toMatch(/^tallyback task --topic-id top_\S+ --title <title>$/);
    expect(taskAction.requires).toEqual(['--title']);
    expect((await follow(root, taskAction.command, { title: 'fix slugify' })).code).toBe(0);

    // From here the existing per-task next_action takes over; no ledger-level hint.
    const tracked = await tb(root, ['view']);
    expect(tracked.json).not.toHaveProperty('next_action');
    const tasks = tracked.json['tasks'] as { next_action: string; status: object }[];
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.next_action).toBe('declare');
    // No completion flag is introduced anywhere on the way.
    expect(tasks[0]!.status).not.toHaveProperty('complete');
  }, 60_000);
});

describe('deriveLedgerNextAction', () => {
  it('asks for the Topic id when more than one Topic could own the Task', () => {
    const snapshot = emptySnapshot();
    for (const n of [1, 2]) {
      snapshot.topics.push({
        topic_id: `top_0190b1c0-0000-7000-8000-00000000000${n}`,
        project_id: 'prj_0190b1c0-0000-7000-8000-000000000001',
        name: `t${n}`,
        goal: '',
        created_by: { kind: 'human', id: 'alice' },
        created_at: '2026-09-01T00:00:00Z',
      });
    }
    expect(deriveLedgerNextAction(snapshot)).toMatchObject({
      command: 'tallyback task --topic-id <topic-id> --title <title>',
      requires: ['--topic-id', '--title'],
    });
  });
});

describe('a ledger that exists but is not usable is never "not initialized"', () => {
  async function initialized(): Promise<string> {
    const root = await freshRepo();
    expect((await tb(root, ['init'])).code).toBe(0);
    return root;
  }

  function expectDistinctFailure(run: CliRun): void {
    expect(run.code).toBe(1);
    expect(run.stdout).not.toContain(NOT_INITIALIZED);
    expect(run.stderr).not.toContain(NOT_INITIALIZED);
  }

  it('a partial ledger (state.json missing, project.json present)', async () => {
    const root = await initialized();
    await rename(join(root, '.tallyback', 'state.json'), join(root, 'state.json.bak'));
    expect(await isLedgerAbsent(root)).toBe(false);
    expectDistinctFailure(await tb(root, ['view']));
  });

  it('a corrupt state.json', async () => {
    const root = await initialized();
    await writeFile(join(root, '.tallyback', 'state.json'), '{ not json', 'utf8');
    expectDistinctFailure(await tb(root, ['view']));
  });

  it('a project identity mismatch keeps its invariant code', async () => {
    const root = await initialized();
    const path = join(root, '.tallyback', 'project.json');
    const { readFile } = await import('node:fs/promises');
    const manifest = JSON.parse(await readFile(path, 'utf8')) as { project_id: string };
    manifest.project_id = 'prj_0190b1c0-0000-7000-8000-0000000000ff';
    await writeFile(path, JSON.stringify(manifest), 'utf8');
    const run = await tb(root, ['view']);
    expectDistinctFailure(run);
    expect(run.stderr).toContain('invariant.project_identity_mismatch');
  });

  it('a .tallyback that is not a directory', async () => {
    const root = await freshRepo();
    await writeFile(join(root, '.tallyback'), '', 'utf8');
    expect(await isLedgerAbsent(root)).toBe(false);
    expectDistinctFailure(await tb(root, ['view']));
  });
});
