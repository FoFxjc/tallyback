/**
 * Authored records are attributed honestly.
 *
 * Dogfood (3×3 benchmark, F7 — 8/9 runs): Claims, Evidence, Verdicts, and Settlements an
 * agent authored were recorded as `tool:tallyback`, so the ledger could not tell executor,
 * verifier, and tool apart. The CLI does not guess who is typing: `--actor` wins, then an
 * explicit host setting `TALLYBACK_ACTOR`, else `unknown:unattributed`.
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

async function tb(
  root: string,
  args: string[],
  env: Record<string, string> = {},
): Promise<Record<string, unknown>> {
  const options = { cwd: ROOT, env: { ...process.env, TALLYBACK_ACTOR: '', ...env } };
  try {
    const { stdout } = await execFileAsync(TSX, [CLI, ...args, '--project-root', root], options);
    return JSON.parse(stdout) as Record<string, unknown>;
  } catch (err) {
    return JSON.parse((err as { stdout: string }).stdout) as Record<string, unknown>;
  }
}

const OBSERVE = ['evidence', '--kind', 'observation', '--payload', '{"text":"x"}'];
const author = (out: Record<string, unknown>): unknown =>
  (out['evidence'] as { submitted_by: unknown }).submitted_by;

describe('record attribution', () => {
  it('never attributes an authored record to Tallyback by default', async () => {
    const root = await tempRoot('tallyback-actor-');
    await tb(root, ['init']);
    expect(author(await tb(root, OBSERVE))).toEqual({ kind: 'unknown', id: 'unattributed' });
  }, 60_000);

  it('uses an explicit host setting, and --actor over it', async () => {
    const root = await tempRoot('tallyback-actor-');
    await tb(root, ['init']);
    const env = { TALLYBACK_ACTOR: 'executor:claude-code' };
    expect(author(await tb(root, OBSERVE, env))).toEqual({ kind: 'executor', id: 'claude-code' });
    expect(author(await tb(root, [...OBSERVE, '--actor', 'human:alice'], env))).toEqual({
      kind: 'human',
      id: 'alice',
    });
  }, 60_000);

  it('rejects a malformed host setting before writing', async () => {
    const root = await tempRoot('tallyback-actor-');
    await tb(root, ['init']);
    const statePath = join(root, '.tallyback', 'state.json');
    const before = await readFile(statePath, 'utf8');
    const run = await tb(root, OBSERVE, { TALLYBACK_ACTOR: 'robot' });
    expect(run['code']).toBe('cli.invalid_value');
    expect(await readFile(statePath, 'utf8')).toBe(before);
  }, 60_000);
});
