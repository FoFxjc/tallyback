/**
 * Regressions for the five defects found by the third Codex review.
 *
 * These land after two prior rounds (8 findings, then 5) had already been fixed and
 * verified. This round's fixes:
 *
 * 1. `Store.reloadUnderLock` revalidates the disk snapshot on EVERY reload, not only when
 *    `revision` changed — a hand edit or a merge that forgets to bump `revision` must not
 *    be silently adopted.
 * 2. `applyAppend` now validates the caller's ORIGINAL, unmodified `AppendOperation`
 *    through `validate_append` before any dedup/replay reconstruction, so a bad envelope
 *    `kind`, an unknown top-level field, or an operation whose records are all replays
 *    is actually checked instead of silently accepted.
 * 3. A schema-valid `Project` record submitted through `append_records` is rejected with
 *    `invariant.non_appendable_record` (TB-LC-007) instead of throwing out of
 *    `LedgerStore.append`'s "never throws for ordinary failures" contract.
 * 4. Legacy migration input validates every element of `attempts` / `blockers` /
 *    `decisions` as an object (and every `evidence` element as a string) before the
 *    mapper ever dereferences a field on it.
 * 5. The published CLI (`dist/cli.js`) carries a `#!/usr/bin/env node` shebang and is
 *    marked executable after `npm run build`, so `tallyback`/`npx tallyback` actually run
 *    on POSIX systems.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { checkLegacyShape } from '../src/check/migration-workflow.js';
import { applyAppend } from '../src/ledger/append.js';
import type { AppendOperation, Snapshot } from '../src/contract/index.js';
import { buildLedger } from './helpers/ledger.js';

describe('codex-3 finding 1 — disk state is revalidated on every reload', () => {
  it('rejects an append built on a same-revision hand edit that broke the graph', async () => {
    const fixture = await buildLedger('tallyback-c3a-');
    const path = join(fixture.root, '.tallyback', 'state.json');
    const snapshot = JSON.parse(await readFile(path, 'utf8')) as Snapshot & {
      tasks: Record<string, unknown>[];
    };
    // Edit content WITHOUT bumping `revision` — exactly what a hand fix or a merge tool
    // that forgets to touch the counter would produce.
    snapshot.tasks[0]!['bogus_property'] = 'injected';
    await writeFile(path, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

    await expect(
      fixture.store.createTask({
        topic_id: fixture.topic_id,
        title: 'built on same-revision corruption',
      }),
    ).rejects.toMatchObject({ code: 'schema.unknown_property' });

    // Nothing was carried forward and re-persisted.
    const after = JSON.parse(await readFile(path, 'utf8')) as { tasks: Record<string, unknown>[] };
    expect(after.tasks.some((t) => 'bogus_property' in t)).toBe(true); // still on disk, untouched
    expect(after.tasks).toHaveLength(1); // no new task was appended on top of it
  });

  it('still adopts a legitimate same-revision reload (nothing changed) without complaint', async () => {
    const fixture = await buildLedger('tallyback-c3a-');
    const outcome = await fixture.store.createTask({ topic_id: fixture.topic_id, title: 'fine' });
    expect(outcome.ok).toBe(true);
  });
});

describe('codex-3 finding 2 — the original append envelope is validated, not a reconstruction', () => {
  it('rejects an envelope kind other than append_records', async () => {
    const fixture = await buildLedger('tallyback-c3b-');
    const badKind = {
      kind: 'delete_records',
      expected_revision: fixture.store.currentRevision(),
      records: [
        {
          task_id: 'tsk_0190b1c0-0000-7000-8000-0000000000aa',
          topic_id: fixture.topic_id,
          title: 'a valid record smuggled under a bad envelope kind',
        },
      ],
      provenance: { submitted_by: { kind: 'tool', id: 'tallyback' } },
    };
    const result = applyAppend(
      fixture.store.currentSnapshot(),
      badKind as unknown as AppendOperation,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('schema.unknown_property');
  });

  it('rejects an unknown top-level envelope field even when every record is a replay', async () => {
    const fixture = await buildLedger('tallyback-c3b-');
    const snapshot = fixture.store.currentSnapshot();
    const replayedTask = { ...snapshot.tasks[0]! };
    const withExtraField = {
      kind: 'append_records',
      expected_revision: fixture.store.currentRevision(),
      records: [replayedTask],
      provenance: { submitted_by: { kind: 'tool', id: 'tallyback' } },
      unrecognized_field: 'must be rejected',
    };
    const result = applyAppend(snapshot, withExtraField as unknown as AppendOperation);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('schema.unknown_property');
  });

  it('rejects a bad envelope kind even when records is empty', async () => {
    const fixture = await buildLedger('tallyback-c3b-');
    const badKindEmpty = {
      kind: 'not_a_real_kind',
      expected_revision: fixture.store.currentRevision(),
      records: [],
      provenance: { submitted_by: { kind: 'tool', id: 'tallyback' } },
    };
    const result = applyAppend(
      fixture.store.currentSnapshot(),
      badKindEmpty as unknown as AppendOperation,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('schema.unknown_property');
  });

  it('still accepts a genuine idempotent replay with a well-formed envelope', async () => {
    const fixture = await buildLedger('tallyback-c3b-');
    const snapshot = fixture.store.currentSnapshot();
    const replayedTask = { ...snapshot.tasks[0]! };
    const wellFormed: AppendOperation = {
      kind: 'append_records',
      expected_revision: fixture.store.currentRevision(),
      records: [replayedTask],
      provenance: { submitted_by: { kind: 'tool', id: 'tallyback' } },
    };
    const result = applyAppend(snapshot, wellFormed);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.replayed).toBe(true);
      expect(result.appendedCount).toBe(0);
    }
  });
});

describe('codex-3 finding 3 — a Project record cannot be appended', () => {
  it('rejects it as an ordinary failure, never throwing', async () => {
    const fixture = await buildLedger('tallyback-c3c-');
    const outcome = await fixture.store.append({
      kind: 'append_records',
      expected_revision: fixture.store.currentRevision(),
      records: [
        {
          project_id: 'prj_0190b1c0-0000-7000-8000-0000000000ff',
          repositories: [],
        } as never,
      ],
      provenance: { submitted_by: { kind: 'tool', id: 'tallyback' } },
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('invariant.non_appendable_record');
  });

  it('leaves the ledger untouched', async () => {
    const fixture = await buildLedger('tallyback-c3c-');
    const before = fixture.store.currentRevision();
    await fixture.store.append({
      kind: 'append_records',
      expected_revision: before,
      records: [
        { project_id: 'prj_0190b1c0-0000-7000-8000-0000000000ff', repositories: [] } as never,
      ],
      provenance: { submitted_by: { kind: 'tool', id: 'tallyback' } },
    });
    expect(fixture.store.currentRevision()).toBe(before);
  });
});

describe('codex-3 finding 4 — legacy nested array elements are validated as objects', () => {
  it.each([
    ['a null attempt', { topics: [{ name: 'w', tasks: [{ id: 'T1', attempts: [null] }] }] }],
    ['a null blocker', { topics: [{ name: 'w', tasks: [{ id: 'T1', blockers: [null] }] }] }],
    ['a null decision', { topics: [{ name: 'w', tasks: [{ id: 'T1', decisions: [null] }] }] }],
    ['a numeric attempt', { topics: [{ name: 'w', tasks: [{ id: 'T1', attempts: [42] }] }] }],
    ['a string attempt', { topics: [{ name: 'w', tasks: [{ id: 'T1', attempts: ['oops'] }] }] }],
    [
      'a numeric evidence entry',
      { topics: [{ name: 'w', tasks: [{ id: 'T1', evidence: [42] }] }] },
    ],
  ])('rejects %s rather than crashing the mapper', (_label, legacy) => {
    const shape = checkLegacyShape(legacy);
    expect(shape).not.toBeNull();
  });

  it('still accepts well-formed nested arrays', () => {
    const legacy = {
      topics: [
        {
          name: 'w',
          tasks: [
            {
              id: 'T1',
              evidence: ['a string note'],
              attempts: [{ description: 'x', outcome: 'passed' }],
              blockers: [{ description: 'blocked' }],
              decisions: [{ summary: 'chose A', rationale: 'r' }],
            },
          ],
        },
      ],
    };
    expect(checkLegacyShape(legacy)).toBeNull();
  });
});
