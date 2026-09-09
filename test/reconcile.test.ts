/**
 * The pre-merge reconciliation workflow.
 *
 * A forked lineage is a normal event in a branch workflow — two branches each revise the
 * same declaration, and the merge brings both heads into one `state.json`. It is not
 * corruption, and it is not something the Store may resolve on its own (SPEC §5.4: "Store
 * must not choose one by timestamp").
 *
 * The shape asserted here:
 *
 * - it cannot be created through the Store, only by an out-of-band merge or edit;
 * - it cannot be repaired by *appending*, because `supersedes` is single-valued;
 * - `tallyback validate` reports it and exits non-zero — the CI gate;
 * - `tallyback reconcile` repairs it at the file level, but only once a human names the
 *   head that survives;
 * - after the repair the ledger opens and validates again.
 */

import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { findSupersessionConflicts, validate_snapshot } from '../src/contract/index.js';
import type { Snapshot, TaskDeclaration } from '../src/contract/index.js';
import {
  diagnoseLedger,
  planReconciliation,
  reconcileLedger,
  RECONCILE_CODES,
  Store,
} from '../src/ledger/index.js';
import { allRecords } from '../src/ledger/snapshot.js';
import { buildLedger, type LedgerFixture } from './helpers/ledger.js';

const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const A = 'dcl_0190b1c0-0000-7000-8000-00000000000a';
const B = 'dcl_0190b1c0-0000-7000-8000-00000000000b';

/** Simulate a git merge: bring two branches' competing revisions into one state.json. */
async function forkOnDisk(fixture: LedgerFixture, heads: string[] = [A, B]): Promise<string> {
  const path = join(fixture.root, '.tallyback', 'state.json');
  const snapshot = JSON.parse(await readFile(path, 'utf8')) as Snapshot;
  const base = snapshot.declarations[0]!;
  for (const [i, id] of heads.entries()) {
    const branch = structuredClone(base) as TaskDeclaration;
    branch.declaration_id = id;
    branch.objective = `branch ${i} revision`;
    branch.supersedes = fixture.declaration_id;
    branch.criteria = [
      {
        ...base.criteria[0]!,
        criterion_id: `cri_0190b1c0-0000-7000-8000-00000000000${id.slice(-1)}`,
      },
    ];
    snapshot.declarations.push(branch);
  }
  snapshot.declarations.sort((x, y) => (x.declaration_id < y.declaration_id ? -1 : 1));
  await writeFile(path, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  return path;
}

describe('a fork can only arrive out-of-band, and cannot be appended away', () => {
  it('cannot be created through the Store', async () => {
    const fixture = await buildLedger('tallyback-rc-');
    const competing = await fixture.store.declare({
      task_id: fixture.task_id,
      objective: 'a second head',
      criteria: [{ code: 'c', statement: 's' }],
      declared_by: { kind: 'human', id: 'alice' },
    });
    expect(competing.ok).toBe(false);
    if (!competing.ok) expect(competing.code).toBe('invariant.supersession_conflict');
  });

  it('cannot be collapsed by appending, whichever head the new record supersedes', async () => {
    const fixture = await buildLedger('tallyback-rc-');
    const path = await forkOnDisk(fixture);
    const forked = JSON.parse(await readFile(path, 'utf8')) as Snapshot;
    expect(findSupersessionConflicts(allRecords(forked))).toHaveLength(1);

    // `supersedes` is single-valued, so a new record always leaves the other head live.
    for (const target of [A, B]) {
      const attempt = structuredClone(forked);
      const extra = structuredClone(attempt.declarations[0]!) as TaskDeclaration;
      extra.declaration_id = 'dcl_0190b1c0-0000-7000-8000-00000000000c';
      extra.objective = 'an appended attempt at repair';
      extra.supersedes = target;
      extra.criteria = [
        { ...extra.criteria[0]!, criterion_id: 'cri_0190b1c0-0000-7000-8000-00000000000c' },
      ];
      attempt.declarations.push(extra);
      attempt.declarations.sort((x, y) => (x.declaration_id < y.declaration_id ? -1 : 1));

      const result = validate_snapshot(attempt);
      expect(result.ok, `appending supersedes ${target}`).toBe(false);
      if (!result.ok) expect(result.code).toBe('invariant.supersession_conflict');
      expect(findSupersessionConflicts(allRecords(attempt))[0]!.heads).toHaveLength(2);
    }
  });
});

describe('diagnosis reads what Store.open refuses', () => {
  it('parses a forked ledger and enumerates every decision owed', async () => {
    const fixture = await buildLedger('tallyback-rc-');
    await forkOnDisk(fixture);

    await expect(Store.open(fixture.root)).rejects.toMatchObject({
      code: 'invariant.supersession_conflict',
    });

    const diagnosis = await diagnoseLedger(fixture.root);
    expect(diagnosis.ok).toBe(false);
    expect(diagnosis.snapshot).not.toBeNull();
    expect(diagnosis.conflicts).toHaveLength(1);
    expect(diagnosis.conflicts[0]!.heads).toEqual([A, B]);
    expect(diagnosis.problems.every((p) => p.reconcilable)).toBe(true);
  });

  it('reports a healthy ledger as ok', async () => {
    const fixture = await buildLedger('tallyback-rc-');
    const diagnosis = await diagnoseLedger(fixture.root);
    expect(diagnosis.ok).toBe(true);
    expect(diagnosis.problems).toHaveLength(0);
    expect(diagnosis.conflicts).toHaveLength(0);
  });

  it('separates problems reconciliation cannot fix', async () => {
    const fixture = await buildLedger('tallyback-rc-');
    const path = join(fixture.root, '.tallyback', 'project.json');
    const manifest = JSON.parse(await readFile(path, 'utf8')) as { project_id: string };
    manifest.project_id = 'prj_0190b1c0-0000-7000-8000-0000000000ff';
    await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

    const diagnosis = await diagnoseLedger(fixture.root);
    expect(diagnosis.ok).toBe(false);
    expect(diagnosis.problems.some((p) => p.code === 'invariant.project_identity_mismatch')).toBe(
      true,
    );
    expect(diagnosis.problems.every((p) => !p.reconcilable)).toBe(true);
  });
});

describe('reconciliation never picks a head for you', () => {
  it('refuses to write when a fork has no decision', async () => {
    const fixture = await buildLedger('tallyback-rc-');
    const path = await forkOnDisk(fixture);
    const before = await readFile(path, 'utf8');

    const outcome = await reconcileLedger({ projectRoot: fixture.root, keep: [] });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe(RECONCILE_CODES.UNDECIDED);
      expect(outcome.message).toContain('never picks a head for you');
    }
    expect(await readFile(path, 'utf8')).toBe(before);
  });

  it('refuses an id that is not a head of any fork', async () => {
    const fixture = await buildLedger('tallyback-rc-');
    await forkOnDisk(fixture);
    const outcome = await reconcileLedger({
      projectRoot: fixture.root,
      keep: [fixture.declaration_id], // the superseded trunk, not a live head
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe(RECONCILE_CODES.UNKNOWN_HEAD);
  });

  it('requires a decision for EVERY fork, not just one', async () => {
    const fixture = await buildLedger('tallyback-rc-');
    const path = await forkOnDisk(fixture);
    // Fork a second lineage too: two competing AttemptEnds.
    const snapshot = JSON.parse(await readFile(path, 'utf8')) as Snapshot;
    for (const suffix of ['a', 'b']) {
      snapshot.attempt_ends.push({
        attempt_end_id: `ate_0190b1c0-0000-7000-8000-00000000000${suffix}`,
        attempt_id: fixture.attempt_id,
        outcome: 'returned',
        reported_by: { kind: 'human', id: 'alice' },
        ended_at: '2026-09-02T10:00:00Z',
      });
    }
    snapshot.attempt_ends.sort((x, y) => (x.attempt_end_id < y.attempt_end_id ? -1 : 1));
    await writeFile(path, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

    expect((await diagnoseLedger(fixture.root)).conflicts).toHaveLength(2);

    // Deciding only the declaration fork leaves the AttemptEnd fork undecided.
    const partial = await reconcileLedger({ projectRoot: fixture.root, keep: [A] });
    expect(partial.ok).toBe(false);
    if (!partial.ok) expect(partial.code).toBe(RECONCILE_CODES.UNDECIDED);

    const both = await reconcileLedger({
      projectRoot: fixture.root,
      keep: [A, 'ate_0190b1c0-0000-7000-8000-00000000000a'],
    });
    expect(both.ok).toBe(true);
  });

  it('reports nothing to do on a healthy ledger', async () => {
    const fixture = await buildLedger('tallyback-rc-');
    const outcome = await reconcileLedger({ projectRoot: fixture.root, keep: [] });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe(RECONCILE_CODES.NO_CONFLICTS);
  });
});

describe('the chain repair', () => {
  it('collapses the fork onto the chosen head and keeps every record resolvable', async () => {
    const fixture = await buildLedger('tallyback-rc-');
    const path = await forkOnDisk(fixture);

    const outcome = await reconcileLedger({ projectRoot: fixture.root, keep: [A] });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    // Exactly one edge was rewritten: the kept head now follows the loser.
    expect(outcome.plan.rewrites).toEqual([
      { lineage: expect.any(String), record_id: A, from: fixture.declaration_id, to: B },
    ]);

    const after = JSON.parse(await readFile(path, 'utf8')) as Snapshot;
    const byId = new Map(after.declarations.map((d) => [d.declaration_id, d]));
    // trunk ← B ← A, single head A — the one the human chose.
    expect(byId.get(B)!.supersedes).toBe(fixture.declaration_id);
    expect(byId.get(A)!.supersedes).toBe(B);
    expect(findSupersessionConflicts(allRecords(after))).toHaveLength(0);
    expect(validate_snapshot(after).ok).toBe(true);

    // Both branch ids survive, so nothing anchored to either stops resolving.
    expect(after.declarations).toHaveLength(3);
    // The repair is a new revision: a stale holder must re-read.
    const original = outcome.plan.snapshot.revision;
    expect(after.revision).toBe(original);

    const reopened = await Store.open(fixture.root);
    expect(reopened.validate_snapshot().ok).toBe(true);
  });

  it('is deterministic and never chronological — the same input gives the same chain', async () => {
    const fixture = await buildLedger('tallyback-rc-');
    const path = await forkOnDisk(fixture);
    const forked = JSON.parse(await readFile(path, 'utf8')) as Snapshot;

    const first = planReconciliation(forked, [A]);
    const second = planReconciliation(forked, [A]);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.plan.rewrites).toEqual(second.plan.rewrites);
  });

  it('writes nothing on a dry run', async () => {
    const fixture = await buildLedger('tallyback-rc-');
    const path = await forkOnDisk(fixture);
    const before = await readFile(path, 'utf8');

    const outcome = await reconcileLedger({ projectRoot: fixture.root, keep: [A], dryRun: true });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.wrote).toBe(false);
    expect(await readFile(path, 'utf8')).toBe(before);
  });

  it('refuses to repair a ledger whose other problems it cannot fix', async () => {
    const fixture = await buildLedger('tallyback-rc-');
    const path = await forkOnDisk(fixture);
    const snapshot = JSON.parse(await readFile(path, 'utf8')) as Snapshot;
    // An unrelated, non-reconcilable defect.
    (snapshot.claims[0] as { task_id: string }).task_id =
      'tsk_0190b1c0-0000-7000-8000-0000000000ff';
    await writeFile(path, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    const before = await readFile(path, 'utf8');

    const outcome = await reconcileLedger({ projectRoot: fixture.root, keep: [A] });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toContain('reconciliation cannot fix');
    expect(await readFile(path, 'utf8')).toBe(before);
  });
});

describe('the CLI gate and repair', () => {
  const tsx = join(ROOT, 'node_modules', '.bin', 'tsx');
  const cli = join(ROOT, 'src', 'cli.ts');

  const run = async (
    root: string,
    args: string[],
  ): Promise<{ code: number; json: Record<string, never> }> => {
    try {
      const { stdout } = await execFileAsync(tsx, [cli, ...args, '--project-root', root], {
        cwd: ROOT,
      });
      return { code: 0, json: JSON.parse(stdout) as Record<string, never> };
    } catch (err) {
      const e = err as { code?: number; stdout?: string };
      return { code: e.code ?? 1, json: JSON.parse(e.stdout ?? '{}') as Record<string, never> };
    }
  };

  it('validate exits non-zero and names the next command; reconcile then fixes it', async () => {
    const fixture = await buildLedger('tallyback-rc-cli-');
    await forkOnDisk(fixture);

    const failed = await run(fixture.root, ['validate']);
    expect(failed.code).toBe(1);
    expect((failed.json as unknown as { ok: boolean }).ok).toBe(false);
    expect((failed.json as unknown as { next: string }).next).toContain('tallyback reconcile');
    expect((failed.json as unknown as { conflicts: unknown[] }).conflicts).toHaveLength(1);

    const listed = await run(fixture.root, ['reconcile']);
    expect(listed.code).toBe(1);
    expect((listed.json as unknown as { code: string }).code).toBe(RECONCILE_CODES.UNDECIDED);

    const fixed = await run(fixture.root, ['reconcile', '--keep', A]);
    expect(fixed.code).toBe(0);
    expect((fixed.json as unknown as { wrote: boolean }).wrote).toBe(true);

    const passed = await run(fixture.root, ['validate']);
    expect(passed.code).toBe(0);
    expect((passed.json as unknown as { ok: boolean }).ok).toBe(true);

    // And the ledger is usable again through the ordinary writer path.
    const shown = await run(fixture.root, ['list', '--what', 'tasks']);
    expect(shown.code).toBe(0);
  }, 120_000);

  it('validate exits zero on a healthy ledger', async () => {
    const fixture = await buildLedger('tallyback-rc-cli-');
    const result = await run(fixture.root, ['validate']);
    expect(result.code).toBe(0);
    expect((result.json as unknown as { ok: boolean }).ok).toBe(true);
  }, 60_000);
});
