/**
 * Per-criterion findings through `tallyback verdict`.
 *
 * Dogfood (3×3 benchmark, F15 — 5/5 uses): every Verdict authored with `tallyback verdict`
 * recorded findings like "AC1: assessed as supported" with empty basis_refs, so the ledger
 * could not answer "what supports criterion 3?". `--finding` and `--finding-basis` record
 * that explicitly; nothing is inferred when they are absent.
 */

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import type { Snapshot } from '../src/contract/index.js';
import { buildLedger } from './helpers/ledger.js';

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

async function state(root: string): Promise<Snapshot> {
  return JSON.parse(await readFile(join(root, '.tallyback', 'state.json'), 'utf8')) as Snapshot;
}

describe('tallyback verdict --finding / --finding-basis', () => {
  it('records what supports each criterion, and cites it in the Verdict basis', async () => {
    const fx = await buildLedger('tallyback-findings-');
    const code = (await state(fx.root)).declarations.at(-1)!.criteria[0]!.code;
    const run = await tb(fx.root, [
      'verdict',
      '--claim',
      fx.claim_id,
      '--criterion',
      `${code}=supported`,
      '--confidence',
      'high',
      '--rationale',
      'suite passes',
      '--finding',
      `${code}=rejected records leave the store unchanged; new test fails on the unfixed code`,
      '--finding-basis',
      `${code}=${fx.evidence_id}`,
    ]);
    expect(run['ok']).toBe(true);
    const verdict = (await state(fx.root)).verdicts.at(-1)!;
    expect(verdict.findings[0]!.summary).toBe(
      'rejected records leave the store unchanged; new test fails on the unfixed code',
    );
    expect(verdict.findings[0]!.basis_refs).toEqual([fx.evidence_id]);
    expect(verdict.basis.evidence_ids).toContain(fx.evidence_id);
  }, 60_000);

  it('keeps the generic summary and an empty basis when nothing is supplied', async () => {
    const fx = await buildLedger('tallyback-findings-');
    const code = (await state(fx.root)).declarations.at(-1)!.criteria[0]!.code;
    await tb(fx.root, [
      'verdict',
      '--claim',
      fx.claim_id,
      '--criterion',
      `${code}=supported`,
      '--confidence',
      'low',
      '--rationale',
      'r',
    ]);
    const finding = (await state(fx.root)).verdicts.at(-1)!.findings[0]!;
    expect(finding.summary).toBe(`${code}: assessed as supported`);
    expect(finding.basis_refs).toEqual([]);
  }, 60_000);

  it('rejects unassessed criteria and unknown references without writing', async () => {
    const fx = await buildLedger('tallyback-findings-');
    const code = (await state(fx.root)).declarations.at(-1)!.criteria[0]!.code;
    const statePath = join(fx.root, '.tallyback', 'state.json');
    const before = await readFile(statePath, 'utf8');
    const base = [
      'verdict',
      '--claim',
      fx.claim_id,
      '--criterion',
      `${code}=supported`,
      '--confidence',
      'high',
      '--rationale',
      'r',
    ];
    for (const extra of [
      ['--finding', 'nope=x'],
      ['--finding-basis', `${code}=evi_01a0d76d-0000-7000-8000-000000000000`],
      ['--finding', code],
    ]) {
      const run = await tb(fx.root, [...base, ...extra]);
      expect(run['code'], extra.join(' ')).toBe('cli.invalid_value');
    }
    expect(await readFile(statePath, 'utf8')).toBe(before);
  }, 60_000);
});
