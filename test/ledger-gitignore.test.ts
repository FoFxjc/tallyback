/**
 * Machine-local ledger state stays out of Git.
 *
 * SPEC §6: `history.jsonl` is ignored and `runtime/` (bindings with absolute paths, locks)
 * is always ignored. Dogfood (3×3 benchmark, F11 — 2/9 runs): `git add -A` after `init`
 * committed `runtime/bindings.json`. A ledger now carries its own `.gitignore`.
 */

import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { Store } from '../src/ledger/index.js';
import { LEDGER_GITIGNORE } from '../src/ledger/snapshot.js';
import { tempRoot } from './helpers/ledger.js';

const execFileAsync = promisify(execFile);

describe('ledger .gitignore', () => {
  it('keeps runtime/ and history.jsonl out of `git add -A`', async () => {
    const root = await tempRoot('tallyback-gitignore-');
    await execFileAsync('git', ['-C', root, 'init', '-q']);
    const store = await Store.init(root, { topic: { name: 't', goal: '' } });
    const repo = store.listRepositories()[0]!.repository_id;
    const ws = await store.registerWorkspace({ repository_id: repo });
    if (!ws.ok) throw new Error('workspace');
    await store.bindWorkspace({
      repository_id: repo,
      workspace_id: ws.workspace.workspace_id,
      root,
    });
    await execFileAsync('git', ['-C', root, 'add', '-A']);
    const { stdout } = await execFileAsync('git', ['-C', root, 'diff', '--cached', '--name-only']);
    expect(stdout.split('\n').filter(Boolean).sort()).toEqual([
      '.tallyback/.gitignore',
      '.tallyback/project.json',
      '.tallyback/state.json',
    ]);
    expect(await readFile(join(root, '.tallyback', '.gitignore'), 'utf8')).toBe(LEDGER_GITIGNORE);
  }, 60_000);

  it('leaves an existing .tallyback/.gitignore alone', async () => {
    const root = await tempRoot('tallyback-gitignore-');
    await mkdir(join(root, '.tallyback'), { recursive: true });
    await writeFile(join(root, '.tallyback', '.gitignore'), 'custom\n', 'utf8');
    await Store.init(root);
    expect(await readFile(join(root, '.tallyback', '.gitignore'), 'utf8')).toBe('custom\n');
  });
});
