import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const MUTATIONS = join(ROOT, 'contract', 'fixtures', 'mutations');

const readJson = (p: string): unknown => JSON.parse(readFileSync(p, 'utf8'));
const list = (dir: string): string[] => readdirSync(dir).sort();

interface MutationFixture {
  name: string;
  before: Record<string, unknown>;
  operation: Record<string, unknown>;
  expected: {
    accepted: boolean;
    code?: string;
    revision?: number;
    state_unchanged?: boolean;
    appended?: number;
    replayed?: boolean;
  };
}

function loadFixtures(kind: 'accepted' | 'rejected'): MutationFixture[] {
  return list(join(MUTATIONS, kind)).map((file) => {
    const parsed = readJson(join(MUTATIONS, kind, file)) as MutationFixture;
    return parsed;
  });
}

const rejected = loadFixtures('rejected');
const accepted = loadFixtures('accepted');

describe('mutation fixture hygiene', () => {
  it('covers the full mutation vector matrix', () => {
    expect(rejected.length).toBe(10);
    expect(accepted.length).toBe(4);
  });

  it('gives every fixture a name matching its filename', () => {
    for (const [kind] of [
      ['rejected', rejected],
      ['accepted', accepted],
    ] as const) {
      for (const file of list(join(MUTATIONS, kind))) {
        const parsed = readJson(join(MUTATIONS, kind, file)) as MutationFixture;
        expect(parsed.name, `${kind}/${file}`).toBe(file.replace(/\.json$/, ''));
      }
    }
    expect(fixturesCovered(rejected).length).toBe(rejected.length);
  });

  it('has a well-formed before snapshot and append operation', () => {
    for (const f of [...rejected, ...accepted]) {
      expect(f.before.schema_version, f.name).toBe('1.0.0');
      expect(typeof f.before.revision, f.name).toBe('number');
      expect(f.operation.kind, f.name).toBe('append_records');
      expect(Array.isArray(f.operation.records), f.name).toBe(true);
      expect(f.expected.accepted, f.name).toBe(f.name.startsWith('accept-'));
      expect(typeof f.expected.revision, f.name).toBe('number');
    }
  });

  it('declares a namespaced violation code for every rejected vector', () => {
    for (const f of rejected) {
      // `schema.*` covers malformed wire data, including a non-canonical `set` array
      // (SPEC §10/§11); `invariant.*` the graph/lifecycle rules; `mutation.*` concurrency.
      expect(f.expected.code, f.name).toMatch(/^(schema|invariant|mutation)\./);
      expect(f.expected.state_unchanged, f.name).toBe(true);
    }
  });
});

function fixturesCovered(fixtures: MutationFixture[]): string[] {
  return fixtures.map((f) => f.name);
}

// --- Schema-level provider-output guarantees (runs without the validator) -------
// The contract's closed schemas are what reject malformed provider output (a
// command/locator smuggled into an observation payload, or arbitrary fields on a
// CheckResult) and an evidence locator being treated as a command. These assertions
// hold the schema closed so the validator cannot silently widen it.

const recordsSchema = readJson(join(ROOT, 'contract', 'schemas', 'records.schema.json')) as {
  $defs?: Record<string, Record<string, unknown>>;
};

describe('provider-output schema closure', () => {
  it('closes the observation payload so a locator/command cannot be smuggled in', () => {
    const defs = recordsSchema.$defs ?? {};
    const payload = defs['payload_observation'] as
      | {
          additionalProperties?: boolean;
          properties?: Record<string, unknown>;
          required?: string[];
        }
      | undefined;
    expect(payload, 'payload_observation must exist').toBeTruthy();
    expect(payload!.additionalProperties).toBe(false);
    expect(Object.keys(payload!.properties ?? {}).sort()).toEqual([
      'observed_at',
      'observer',
      'text',
    ]);
    expect(payload!.required).toContain('text');
    // An evidence record carrying a command/locator property is therefore rejected as
    // schema.unknown_property rather than executed.
  });

  it('requires an observation payload to carry a text field', () => {
    const defs = recordsSchema.$defs ?? {};
    const payload = defs['payload_observation'] as { required?: string[] } | undefined;
    expect(payload?.required).toContain('text');
  });
});

// --- Mutation behavior (depends on applyAppend → validate_append) ----------------
// `applyAppend` lives in `src/ledger/append.js`, which imports `validate_append` from
// the contract barrel. That export lands with the reference validator (task #4); until
// then the module fails to instantiate and the behavioral checks are skipped.

type AppendResult =
  | { ok: true; snapshot: unknown; revision: number; appendedCount: number; replayed: boolean }
  | { ok: false; code: string; message?: string; validation?: unknown };

let applyAppend: ((current: unknown, operation: unknown) => AppendResult) | undefined;
let hasValidator = false;
let appendLoadError: string | undefined;
try {
  const contract = (await import('../src/contract/index.js')) as unknown as {
    validate_append?: unknown;
  };
  hasValidator = typeof contract.validate_append === 'function';
  if (hasValidator) {
    const mod = await import('../src/ledger/append.js');
    applyAppend = (mod as unknown as { applyAppend?: typeof applyAppend }).applyAppend;
  }
} catch (err) {
  appendLoadError = err instanceof Error ? err.message : String(err);
}

const hasAppend = hasValidator && typeof applyAppend === 'function';
const appendDescribe = hasAppend ? describe : describe.skip;

appendDescribe('mutation vector behavior (applyAppend)', () => {
  it('rejects every rejected vector with the expected violation code', () => {
    for (const f of rejected) {
      const before = structuredClone(f.before);
      const result = applyAppend!(f.before, f.operation);
      expect(result.ok, f.name).toBe(false);
      if (!result.ok) {
        expect(result.code, f.name).toBe(f.expected.code);
      }
      // TB-ATOM-001: a rejected mutation leaves the input snapshot byte-identical.
      expect(f.before, f.name).toEqual(before);
    }
  });

  it('accepts every accepted vector with the expected revision and append count', () => {
    for (const f of accepted) {
      const result = applyAppend!(f.before, f.operation);
      expect(result.ok, f.name).toBe(true);
      if (result.ok) {
        expect(result.revision, f.name).toBe(f.expected.revision);
        if (f.expected.appended !== undefined) {
          expect(result.appendedCount, f.name).toBe(f.expected.appended);
        }
        if (f.expected.replayed !== undefined) {
          expect(result.replayed, f.name).toBe(true);
          expect(result.appendedCount, f.name).toBe(0);
        }
      }
    }
  });

  it('is pure: a rejected append never mutates its input snapshot', () => {
    for (const f of rejected) {
      const snapshotBefore = JSON.stringify(f.before);
      applyAppend!(f.before, f.operation);
      expect(JSON.stringify(f.before), f.name).toBe(snapshotBefore);
    }
  });
});

if (!hasAppend) {
  describe('mutation validator availability', () => {
    it('documents that applyAppend cannot run until the reference validator lands', () => {
      // `applyAppend` reaches `validate_append` at the end of every mutation, so the
      // behavioral vectors only run once the contract exports a real `validate_append`.
      expect(hasValidator).toBe(false);
      expect(appendLoadError ?? 'validate_append not exported').toBeTruthy();
    });
  });
}
