/**
 * Rejections speak CLI, not wire format.
 *
 * Dogfood (3×3 benchmark, F8 — 6/9 runs; 3/3 Haiku runs never settled): the settlement
 * diagnostic named record fields (`basis.verdict_id or verification_exception`), and
 * agents guessed `--basis-verification-exception`, `--verdict-exception`,
 * `--basis-attempt`. The machine-readable code and message are unchanged; a `hint` names
 * the actual flags. The basis requirement itself is not relaxed.
 */

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { buildLedger } from './helpers/ledger.js';

const execFileAsync = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TSX = join(ROOT, 'node_modules', '.bin', 'tsx');
const CLI = join(ROOT, 'src', 'cli.ts');

async function tb(
  root: string,
  args: string[],
): Promise<{ code: number; stderr: string; json: Record<string, unknown> }> {
  try {
    const { stdout, stderr } = await execFileAsync(TSX, [CLI, ...args, '--project-root', root], {
      cwd: ROOT,
    });
    return { code: 0, stderr, json: JSON.parse(stdout) as Record<string, unknown> };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return {
      code: e.code ?? 1,
      stderr: e.stderr ?? '',
      json: e.stdout ? (JSON.parse(e.stdout) as Record<string, unknown>) : {},
    };
  }
}

describe('settlement basis diagnostics name the CLI flags', () => {
  it('land without a basis is still rejected, with a hint naming --verdict-id / --verification-exception', async () => {
    const fx = await buildLedger('tallyback-diag-');
    const run = await tb(fx.root, [
      'settle',
      '--task-id',
      fx.task_id,
      '--attempt-id',
      fx.attempt_id,
      '--decision',
      'land',
      '--rationale',
      'all tests pass',
    ]);
    expect(run.code).toBe(1);
    expect(run.json['code']).toBe('invariant.settlement_basis_matrix');
    expect(run.json['message']).toBe(
      'land requires exactly one of basis.verdict_id or verification_exception',
    );
    expect(run.json['hint']).toContain('--verdict-id');
    expect(run.json['hint']).toContain('--verification-exception');
    expect(run.stderr).toContain('hint: ');
    const state = JSON.parse(await readFile(join(fx.root, '.tallyback', 'state.json'), 'utf8')) as {
      settlements: unknown[];
    };
    expect(state.settlements).toHaveLength(0);
  }, 60_000);

  it('translates a malformed id into the flag and id kind it needs', async () => {
    const fx = await buildLedger('tallyback-diag-');
    const run = await tb(fx.root, [
      'dispatch',
      '--task-id',
      fx.task_id,
      '--declaration-id',
      fx.declaration_id,
      '--repository-id',
      fx.repository_id,
      '--workspace-id',
      fx.root,
    ]);
    expect(run.json['code']).toBe('schema.unknown_property');
    expect(run.json['hint']).toContain('--workspace-id must be a wsp_<UUIDv7> id');
  }, 60_000);

  it('gives missing and invalid flags their own codes and points at --help', async () => {
    const fx = await buildLedger('tallyback-diag-');
    const missing = await tb(fx.root, ['settle', '--task-id', fx.task_id, '--decision', 'land']);
    expect(missing.json['code']).toBe('cli.missing_flag');
    expect(missing.json['message']).toContain('tallyback settle --help');
    const invalid = await tb(fx.root, [
      'end',
      '--attempt-id',
      fx.attempt_id,
      '--outcome',
      'success',
    ]);
    expect(invalid.json['code']).toBe('cli.invalid_value');
    expect(invalid.json['message']).toContain('returned|failed|cancelled');
  }, 60_000);
});

describe('record-check reports the real rejection', () => {
  it('names the rejection instead of "failed after 5 retries", and points at `tallyback verdict`', async () => {
    const fx = await buildLedger('tallyback-diag-');
    const begin = await tb(fx.root, [
      'begin-check',
      '--claim-id',
      fx.claim_id,
      '--checker-id',
      'pytest',
      '--checker-version',
      '8',
    ]);
    const invocation = (begin.json['invocation'] as { check_invocation_id: string })
      .check_invocation_id;
    const statePath = join(fx.root, '.tallyback', 'state.json');
    const before = await readFile(statePath, 'utf8');

    const noVerdict = await tb(fx.root, [
      'record-check',
      '--invocation-id',
      invocation,
      '--outcome',
      'verdict_emitted',
    ]);
    expect(noVerdict.json['code']).toBe('invariant.check_result_outcome_mismatch');
    expect(String(noVerdict.json['message'])).not.toContain('retries');
    expect(String(noVerdict.json['message'])).toContain('requires a non-null verdict_id');
    expect(noVerdict.json['hint']).toContain('tallyback verdict');

    const guessed = await tb(fx.root, [
      'record-check',
      '--invocation-id',
      invocation,
      '--outcome',
      'verdict_emitted',
      '--verdict',
      '{"pass":true}',
    ]);
    expect(guessed.json['code']).toBe('cli.invalid_value');
    expect(String(guessed.json['message'])).toContain('complete Verdict record');

    expect(await readFile(statePath, 'utf8')).toBe(before);
  }, 60_000);
});
