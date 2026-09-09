import { describe, expect, it } from 'vitest';

import {
  canonicalSnapshotForDigest,
  emptySnapshot,
  snapshotDigest,
  snapshotDigestHex,
} from '../src/ledger/snapshot.js';

const U = (n: number) => '0190b1c0-0000-7000-8000-' + String(n).padStart(12, '0');

function topic(n: number) {
  return {
    topic_id: `top_${U(n)}`,
    project_id: `prj_${U(1)}`,
    name: 'release-readiness',
    goal: 'prepare',
    created_by: { kind: 'human' as const, id: 'alice' },
    created_at: '2026-09-01T00:00:00Z',
  };
}

function task(n: number, title: string) {
  return { task_id: `tsk_${U(n)}`, topic_id: `top_${U(1)}`, title };
}

/** A ledger-shaped snapshot with one topic and the given tasks (in the given order). */
function snap(tasks: ReturnType<typeof task>[]) {
  const s = emptySnapshot();
  s.topics.push(topic(1));
  for (const t of tasks) s.tasks.push(t);
  return s;
}

describe('snapshot digest determinism', () => {
  it('is insensitive to record ordering within a set collection', () => {
    const a = snap([task(2, 'b'), task(1, 'a')]);
    const b = snap([task(1, 'a'), task(2, 'b')]);
    expect(snapshotDigestHex(a)).toBe(snapshotDigestHex(b));
  });

  it('excludes the discardable projections section', () => {
    const base = snap([task(1, 'a')]);
    const withProjections = {
      ...base,
      projections: { computed_from_revision: 0, policy_id: 'default-v1', values: { x: 1 } },
    };
    expect(snapshotDigestHex(withProjections)).toBe(snapshotDigestHex(base));
    expect('projections' in (canonicalSnapshotForDigest(withProjections) as object)).toBe(false);
  });

  it("changes when a record's semantic content changes", () => {
    const a = snap([task(1, 'a')]);
    const b = snap([task(1, 'b')]);
    expect(snapshotDigestHex(a)).not.toBe(snapshotDigestHex(b));
  });

  it('is stable across repeated computations', () => {
    const s = snap([task(1, 'a'), task(2, 'b')]);
    expect(snapshotDigestHex(s)).toBe(snapshotDigestHex(structuredClone(s)));
  });

  it('wraps the digest in the shared object shape', () => {
    const s = snap([task(1, 'a')]);
    expect(snapshotDigest(s)).toEqual({ algorithm: 'sha-256', value: snapshotDigestHex(s) });
    expect(snapshotDigest(s).value).toMatch(/^[0-9a-f]{64}$/);
  });

  it('orders each record collection by record id in the canonical form', () => {
    const out = canonicalSnapshotForDigest(snap([task(2, 'b'), task(1, 'a')])) as {
      tasks: { task_id: string }[];
    };
    expect(out.tasks.map((t) => t.task_id)).toEqual([`tsk_${U(1)}`, `tsk_${U(2)}`]);
  });
});
