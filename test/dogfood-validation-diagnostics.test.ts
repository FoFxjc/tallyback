/**
 * Regression for a diagnostics-only defect found by the `tiny-todo` dogfood.
 *
 * A malformed `observation` Evidence payload (`{"commit":"...","pytest":"..."}`, missing
 * the required `text` field) was correctly rejected, but the reported violation was
 * unrelated and misleading: `/records/0 must have required property 'project_id'`.
 *
 * Root cause: `AnyRecord` is an Ajv `oneOf` over every record shape. With
 * `allErrors: true`, a failed `oneOf` reports every branch's failure, not just the one the
 * record actually resembles. An unrelated branch (e.g. `Project`) fails immediately at the
 * record's own root; the branch the record is actually shaped like (`Evidence`) fails
 * deeper, inside its own nested `payload` schema. Ajv lists branches in schema declaration
 * order, and the validator used to take `errors[0]` unconditionally — so it reported
 * whichever branch happened to be declared first, not the one relevant to this record.
 *
 * The fix (`mostSpecificSchemaError` in `src/contract/validator.ts`) prefers the error with
 * the deepest `instancePath` across ALL of Ajv's collected errors, which is a generic proxy
 * for "how far into a candidate schema this data got before failing" — not an
 * Evidence/`observation`-specific special case. The second test below exercises the same
 * selection logic against an unrelated record type (a `Verdict` with a malformed nested
 * `confidence` object) to demonstrate that.
 */

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { validate_snapshot } from '../src/contract/index.js';
import type { Snapshot } from '../src/contract/index.js';
import { tempRoot } from './helpers/ledger.js';

const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const TSX = join(ROOT, 'node_modules', '.bin', 'tsx');
const CLI = join(ROOT, 'src', 'cli.ts');

interface CliRun {
  code: number;
  stdout: string;
  stderr: string;
}

async function runRaw(projectRoot: string, args: string[]): Promise<CliRun> {
  try {
    const { stdout, stderr } = await execFileAsync(
      TSX,
      [CLI, ...args, '--project-root', projectRoot],
      { cwd: ROOT },
    );
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return { code: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

async function tb(projectRoot: string, ...args: string[]): Promise<Record<string, never>> {
  const run = await runRaw(projectRoot, args);
  if (run.code !== 0) {
    throw new Error(`tallyback ${args.join(' ')} failed (${run.code}): ${run.stderr}`);
  }
  return JSON.parse(run.stdout) as Record<string, never>;
}

async function stateOf(
  projectRoot: string,
): Promise<Record<string, never[]> & { revision: number }> {
  return JSON.parse(
    await readFile(join(projectRoot, '.tallyback', 'state.json'), 'utf8'),
  ) as Record<string, never[]> & { revision: number };
}

describe('dogfood — malformed observation payload reports its own violation', () => {
  it('rejects the exact reproduced command with a diagnostic naming the payload, not project_id', async () => {
    const root = await tempRoot('tallyback-dogfood-diag-');
    await tb(root, 'init', '--repository', 'main', '--topic', 'demo', '--goal', 'diag');

    const before = await stateOf(root);
    expect(before.revision).toBe(0);
    expect(before.evidence).toHaveLength(0);

    const result = await runRaw(root, [
      'evidence',
      '--kind',
      'observation',
      '--payload',
      '{"commit":"abc","pytest":"23 passed"}',
    ]);

    expect(result.code).not.toBe(0);
    const body = JSON.parse(result.stdout) as { ok: boolean; code: string; message: string };
    expect(body.ok).toBe(false);
    expect(body.code).toBe('schema.unknown_property');

    // The misleading diagnostic this pins down: an unrelated root-level Project branch
    // error must not be reported for a record that is, in fact, a well-formed Evidence
    // record with an invalid observation payload.
    expect(body.message).not.toContain('project_id');

    // The diagnostic must point at the nested payload and name the real violation.
    expect(body.message).toContain('/records/0/payload');
    expect(body.message).toMatch(/text/);

    const after = await stateOf(root);
    expect(after.revision).toBe(before.revision);
    expect(after.evidence).toHaveLength(0);
  });
});

describe('dogfood — nested schema error selection is general, not Evidence-only', () => {
  const FIXTURE = join(
    ROOT,
    'contract',
    'fixtures',
    'snapshots',
    'valid',
    'verdict-valid-scope.json',
  );

  it('an unrelated malformed nested object (Verdict.confidence) is reported at its own path', async () => {
    const raw = await readFile(FIXTURE, 'utf8');
    const snapshot = JSON.parse(raw) as Snapshot;
    expect(snapshot.verdicts.length).toBeGreaterThan(0);

    // Break the nested `confidence` object (missing required `level`) without touching
    // anything else about the record — every other branch of AnyRecord will still fail at
    // the record's own root, exactly like the Evidence dogfood case.
    const verdict = snapshot.verdicts[0]! as unknown as { confidence: Record<string, unknown> };
    delete verdict.confidence.level;

    const result = validate_snapshot(snapshot);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('schema.unknown_property');
    expect(result.message).not.toContain('project_id');
    expect(result.message).toContain('/confidence');
    expect(result.message).toMatch(/level/);
  });
});
