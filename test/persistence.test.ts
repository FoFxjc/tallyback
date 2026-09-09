/**
 * Persistence-failure consistency.
 *
 * Two distinct failures, two distinct correct behaviours:
 *
 * - `state.json` is the canonical portable snapshot. If replacing it fails, the mutation
 *   did **not** happen: the in-memory canonical state must be exactly what it was, and the
 *   caller must be told the append was rejected.
 * - `history.jsonl` is the local operational journal and explicitly non-authoritative
 *   (SPEC §6.1). If it fails *after* `state.json` committed, the mutation still happened:
 *   reporting it as uncommitted would make the Store lie about durable state.
 *
 * Failures are injected by overriding the Store's own persistence seams, so the ordering
 * under test is the real one rather than a mock of it.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { Store } from '../src/ledger/index.js';
import type { HistoryEntry } from '../src/ledger/snapshot.js';
import type { Snapshot } from '../src/contract/index.js';
import { buildLedger } from './helpers/ledger.js';

/** A Store whose two persistence seams can be made to fail on demand. */
class FaultyStore extends Store {
  failSnapshotWrite = false;
  failJournalWrite = false;
  snapshotWrites = 0;
  journalFailures = 0;

  protected override async writeSnapshotFile(snapshot: Snapshot): Promise<void> {
    if (this.failSnapshotWrite) {
      throw Object.assign(new Error('injected ENOSPC replacing state.json'), {
        code: 'ENOSPC',
      });
    }
    this.snapshotWrites += 1;
    await super.writeSnapshotFile(snapshot);
  }

  /**
   * Fault is injected at the *raw append*, not at `writeJournal`, so the base class's
   * real failure-handling policy is what the test exercises.
   */
  protected override async appendJournalEntry(entry: HistoryEntry): Promise<void> {
    if (this.failJournalWrite) {
      this.journalFailures += 1;
      throw Object.assign(new Error('injected EACCES appending history.jsonl'), {
        code: 'EACCES',
      });
    }
    await super.appendJournalEntry(entry);
  }
}

async function faultyLedger(): Promise<{ store: FaultyStore; root: string; topic_id: string }> {
  const built = await buildLedger('tallyback-persist-');
  const store = new FaultyStore(built.root);
  await store.load();
  return { store, root: built.root, topic_id: built.topic_id };
}

describe('snapshot persistence failure', () => {
  it('leaves the in-memory canonical state unchanged and reports the append as rejected', async () => {
    const { store, root, topic_id } = await faultyLedger();
    const before = store.currentRevision();
    const beforeTasks = store.listTasks().length;
    const beforeBytes = await readFile(join(root, '.tallyback', 'state.json'), 'utf8');

    store.failSnapshotWrite = true;
    const outcome = await store.createTask({ topic_id, title: 'never persisted' });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe('mutation.persist_failed');
      expect(outcome.message).toContain('ENOSPC');
    }

    // TB-ATOM-001: no partial mutation — state unchanged, bytes unchanged.
    expect(store.currentRevision()).toBe(before);
    expect(store.listTasks()).toHaveLength(beforeTasks);
    expect(store.listTasks().map((t) => t.title)).not.toContain('never persisted');
    expect(await readFile(join(root, '.tallyback', 'state.json'), 'utf8')).toBe(beforeBytes);
  });

  it('recovers cleanly: the next append after a persistence failure commits normally', async () => {
    const { store, root, topic_id } = await faultyLedger();
    const before = store.currentRevision();

    store.failSnapshotWrite = true;
    expect((await store.createTask({ topic_id, title: 'lost' })).ok).toBe(false);

    store.failSnapshotWrite = false;
    const outcome = await store.createTask({ topic_id, title: 'kept' });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.revision).toBe(before + 1);

    const reopened = await Store.open(root);
    expect(reopened.currentRevision()).toBe(before + 1);
    expect(reopened.listTasks().map((t) => t.title)).toContain('kept');
    expect(reopened.listTasks().map((t) => t.title)).not.toContain('lost');
  });

  it('leaves no temp file behind when the atomic write fails', async () => {
    const { root } = await faultyLedger();
    const { readdir } = await import('node:fs/promises');
    const entries = await readdir(join(root, '.tallyback'));
    expect(entries.filter((e) => e.endsWith('.tmp'))).toHaveLength(0);
  });
});

describe('journal persistence failure', () => {
  it('does not report a committed mutation as uncommitted', async () => {
    const { store, root, topic_id } = await faultyLedger();
    const before = store.currentRevision();

    store.failJournalWrite = true;
    const outcome = await store.createTask({ topic_id, title: 'committed despite the journal' });

    // The state write succeeded, so the mutation IS recorded, whatever the journal did.
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.revision).toBe(before + 1);
    expect(store.currentRevision()).toBe(before + 1);

    // And it really is durable: a fresh open sees it.
    const reopened = await Store.open(root);
    expect(reopened.currentRevision()).toBe(before + 1);
    expect(reopened.listTasks().map((t) => t.title)).toContain('committed despite the journal');
  });

  it('surfaces the journal problem as a warning rather than a mutation failure', async () => {
    const { store, topic_id } = await faultyLedger();

    store.failJournalWrite = true;
    const outcome = await store.createTask({ topic_id, title: 'journal warning' });
    expect(outcome.ok).toBe(true);
    expect(store.journalFailures).toBeGreaterThan(0);
    expect(store.journalWarning()).toContain('history.jsonl');
    expect(store.journalWarning()).toContain('EACCES');

    // A healthy journal clears the warning again on the next append.
    store.failJournalWrite = false;
    expect((await store.createTask({ topic_id, title: 'journal healthy' })).ok).toBe(true);
    expect(store.journalWarning()).toBeNull();
  });

  it('keeps state.json intelligible when the journal is deleted entirely (SPEC §6.1)', async () => {
    const { store, root, topic_id } = await faultyLedger();
    expect((await store.createTask({ topic_id, title: 'survives' })).ok).toBe(true);

    const { rm } = await import('node:fs/promises');
    await rm(join(root, '.tallyback', 'history.jsonl'), { force: true });

    const reopened = await Store.open(root);
    expect(reopened.validate_snapshot().ok).toBe(true);
    expect(reopened.listTasks().map((t) => t.title)).toContain('survives');

    // And the ledger keeps advancing without its journal.
    const after = await reopened.createTask({ topic_id, title: 'after journal loss' });
    expect(after.ok).toBe(true);
  });
});
