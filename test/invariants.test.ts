import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const INVARIANTS_PATH = join(ROOT, 'contract', 'invariants.json');

interface InvariantRule {
  id: string;
  category: string;
  phase: 'snapshot' | 'mutation';
  applies_to: string[];
  validator: string;
  violation_code: string | null;
  summary: string;
  spec_anchor: string;
  conformance_cases: string[];
  assertion?: string;
}

interface InvariantsCatalog {
  schema_version: string;
  rules: InvariantRule[];
}

const catalog = JSON.parse(readFileSync(INVARIANTS_PATH, 'utf8')) as InvariantsCatalog;

describe('invariant catalog hygiene', () => {
  it('carries the v1 contract version and at least one rule', () => {
    expect(catalog.schema_version).toBe('1.0.0');
    expect(catalog.rules.length).toBeGreaterThan(0);
  });

  it('has a unique id for every rule', () => {
    const ids = catalog.rules.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every rule the required fields', () => {
    for (const rule of catalog.rules) {
      expect(rule.id, rule.id).toMatch(/^TB-[A-Z]+-\d{3}$/);
      expect(['REF', 'ID', 'LC', 'SUP', 'CAN', 'ATOM', 'NOP']).toContain(rule.category);
      expect(['snapshot', 'mutation']).toContain(rule.phase);
      expect(rule.applies_to.length).toBeGreaterThan(0);
      expect(rule.validator.length).toBeGreaterThan(0);
      expect(rule.summary.length).toBeGreaterThan(0);
      expect(rule.spec_anchor.length).toBeGreaterThan(0);
      expect(Array.isArray(rule.conformance_cases)).toBe(true);
    }
  });

  it('namespaces violation codes correctly', () => {
    for (const rule of catalog.rules) {
      if (rule.category === 'NOP') {
        expect(rule.violation_code, rule.id).toBeNull();
        expect(rule.assertion, rule.id).toBeTruthy();
      } else {
        // `schema.*` is a legitimate violation namespace for the CAN (canonical
        // serialization) rules: SPEC §11 classifies a non-canonical `set` array as
        // malformed wire data, not as an invalid graph mutation.
        expect(rule.violation_code, rule.id).toMatch(/^(schema|invariant|mutation)\./);
      }
    }
  });

  it('has unique violation codes among rules that carry one', () => {
    const codes = catalog.rules
      .map((r) => r.violation_code)
      .filter((c): c is string => typeof c === 'string');
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('conformance-case coverage', () => {
  function caseExists(caseName: string): boolean {
    const slash = caseName.indexOf('/');
    if (slash < 0) return false;
    const kind = caseName.slice(0, slash);
    const name = caseName.slice(slash + 1);
    if (kind === 'snapshot') {
      return (
        existsSync(join(ROOT, 'contract', 'fixtures', 'snapshots', 'valid', `${name}.json`)) ||
        existsSync(join(ROOT, 'contract', 'fixtures', 'snapshots', 'invalid', `${name}.json`))
      );
    }
    if (kind === 'mutation') {
      return (
        existsSync(join(ROOT, 'contract', 'fixtures', 'mutations', 'accepted', `${name}.json`)) ||
        existsSync(join(ROOT, 'contract', 'fixtures', 'mutations', 'rejected', `${name}.json`))
      );
    }
    return false;
  }

  it('resolves every declared conformance case to a real fixture', () => {
    for (const rule of catalog.rules) {
      for (const caseName of rule.conformance_cases) {
        expect(caseExists(caseName), `${rule.id} -> ${caseName}`).toBe(true);
      }
    }
  });
});
