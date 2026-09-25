/**
 * Evidence authoring through the CLI.
 *
 * Dogfood (3×3 benchmark, F6 — 8/9 runs): agents could not tell which payload properties a
 * kind accepts ("payload must NOT have additional properties"), guessed kinds (`test`,
 * `patch`, `commit`), stripped test evidence to `{exit_code: 0}`, or recorded `artifact {}`
 * just to get something accepted — while the record's free-text `note` went unused. The
 * payload shapes are the frozen contract's; this pins the CLI's description of them and the
 * hints that point to `--note` and to claim-side linking.
 */

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { EVIDENCE_KINDS, EVIDENCE_PAYLOADS } from '../src/cli-spec.js';
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

describe('the CLI describes evidence payloads exactly as the frozen contract defines them', () => {
  it('matches records.schema.json kinds and payload properties', async () => {
    const schema = JSON.parse(
      await readFile(join(ROOT, 'contract', 'schemas', 'records.schema.json'), 'utf8'),
    ) as {
      $defs: Record<
        string,
        { enum?: string[]; required?: string[]; properties?: Record<string, unknown> }
      >;
    };
    expect([...EVIDENCE_KINDS].sort()).toEqual([...schema.$defs['evidence_kind']!.enum!].sort());
    for (const kind of EVIDENCE_KINDS) {
      const def = schema.$defs[`payload_${kind}`]!;
      const shape = EVIDENCE_PAYLOADS[kind];
      expect(shape.required.sort(), kind).toEqual([...(def.required ?? [])].sort());
      expect([...shape.required, ...shape.optional].sort(), kind).toEqual(
        Object.keys(def.properties ?? {}).sort(),
      );
    }
  });
});

describe('evidence rejections say what the kind accepts', () => {
  it('names accepted properties, points to --note, and writes nothing', async () => {
    const root = await tempRoot('tallyback-evidence-');
    await tb(root, ['init']);
    const statePath = join(root, '.tallyback', 'state.json');
    const before = await readFile(statePath, 'utf8');

    const extra = await tb(root, [
      'evidence',
      '--kind',
      'test_run',
      '--payload',
      '{"command":"pytest","exit_code":0,"result":"11 passed"}',
    ]);
    expect(extra['code']).toBe('schema.unknown_property');
    expect(extra['hint']).toContain('test_run: {exit_code (required), command');
    expect(extra['hint']).toContain('--note');

    const kind = await tb(root, ['evidence', '--kind', 'test', '--payload', '{}']);
    expect(kind['code']).toBe('schema.unknown_evidence_kind');
    expect(kind['hint']).toContain('test_run');

    const link = await tb(root, [
      'evidence',
      '--kind',
      'observation',
      '--payload',
      '{"text":"x"}',
      '--claim-id',
      'clm_x',
    ]);
    expect(link['code']).toBe('cli.unknown_flag');
    expect(String(link['message'])).toContain('tallyback claim … --evidence');

    expect(await readFile(statePath, 'utf8')).toBe(before);
  }, 60_000);

  it('keeps the human-readable result in the recorded note', async () => {
    const root = await tempRoot('tallyback-evidence-');
    await tb(root, ['init']);
    const ok = await tb(root, [
      'evidence',
      '--kind',
      'test_run',
      '--payload',
      '{"command":"python -m pytest -q","exit_code":0}',
      '--note',
      '11 passed; new test fails on the unfixed code',
    ]);
    expect(ok['ok']).toBe(true);
    expect((ok['evidence'] as { note: string }).note).toBe(
      '11 passed; new test fails on the unfixed code',
    );
  }, 60_000);
});
