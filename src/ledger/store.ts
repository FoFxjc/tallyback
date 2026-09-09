/**
 * The stateful Store engine: the sole writer of the ledger.
 *
 * Owns the in-memory canonical snapshot, the on-disk files (`project.json`, `state.json`,
 * `history.jsonl`, `runtime/bindings.json`), and the single-writer lock. Every mutation
 * is `validate → lock → append → persist`; the pure append step lives in `append.ts`.
 *
 * **Concurrency authority is the filesystem, not this process.** The in-process mutex
 * below only keeps one async task at a time inside the critical section of a single
 * `LedgerStore` instance; it cannot see a second Store instance or a second `tallyback`
 * process. The authority is the `runtime/store.lock` file (`lock.ts`), and the expected
 * revision is checked against the snapshot **re-read from disk while holding it**. That
 * ordering — lock, reload, compare, apply, persist — is what makes a stale writer lose
 * with `mutation.revision_conflict` instead of silently overwriting the winner.
 *
 * **Persistence is ordered so a failure cannot lie.** `this.snapshot` only advances after
 * `state.json` is durably replaced: a failed snapshot write leaves the in-memory canonical
 * state exactly where it was and reports the mutation as rejected. `history.jsonl` is the
 * local operational journal and explicitly non-authoritative (SPEC §6.1), so a journal
 * failure after a committed state write is reported as a committed mutation with a
 * journal warning — never as an uncommitted one.
 *
 * The public command surface (declare/dispatch/…/beginCheck/recordCheckOutput) is the
 * `Store` class in `commands.ts`, which extends this engine.
 */

import {
  validate_append as contractValidateAppend,
  validate_snapshot as contractValidateSnapshot,
} from '../contract/index.js';
import type { Actor, AnyRecord, AppendOperation, Snapshot } from '../contract/index.js';
import { applyAppend, type AppendResult } from './append.js';
import { acquireLock, LockError, type LockHandle, type LockOptions } from './lock.js';
import {
  appendHistory,
  emptySnapshot,
  ledgerRoot,
  newId,
  nowIso,
  readHistory,
  readProject,
  readSnapshot,
  recordId,
  SCHEMA_VERSION,
  storeLockPath,
  writeBindings,
  writeProject,
  writeSnapshot,
  type HistoryEntry,
  type ProjectManifest,
  type ValidationResult,
} from './snapshot.js';

export class StoreError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = 'StoreError';
    this.code = code;
  }
}

/**
 * An in-process serializer for the critical section.
 *
 * This is a latency optimization and a re-entrancy guard, **not** the concurrency
 * authority: it makes concurrent calls on one instance queue instead of fighting over the
 * filesystem lock. Correctness comes from `runtime/store.lock` plus the on-disk revision
 * check, both of which hold regardless of this mutex.
 */
class Mutex {
  private tail: Promise<void> = Promise.resolve();

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

export interface InitTopic {
  name: string;
  goal: string;
}

export interface InitOptions {
  project_id?: string;
  repositories?: { alias: string }[];
  topic?: InitTopic;
  created_by?: Actor;
}

const DEFAULT_CREATED_BY: Actor = { kind: 'human', id: 'unknown' };
const DEFAULT_SUBMITTER: Actor = { kind: 'tool', id: 'tallyback' };

/**
 * Recursively freeze a value.
 *
 * Applied to the canonical snapshot whenever the Store adopts one. Under ESM (always
 * strict mode) a write to a frozen object throws, so an accidental in-place edit of
 * canonical state fails loudly at the point of the mistake instead of silently diverging
 * from disk. Freezing is a one-off cost per commit; cloning on every read is not.
 */
function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}

export class LedgerStore {
  readonly projectRoot: string;
  readonly root: string;

  /** Not the concurrency authority — see the class doc and `lock.ts`. */
  protected lock = new Mutex();
  protected submitter: Actor = DEFAULT_SUBMITTER;
  /** Tuning for the filesystem lock (timeout / staleness policy). */
  protected lockOptions: LockOptions = {};

  private snapshot: Snapshot;
  private manifest: ProjectManifest;
  private historySeq = 1;
  /** Set when the last mutation committed to `state.json` but its journal entry failed. */
  private lastJournalWarning: string | null = null;

  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
    this.root = ledgerRoot(projectRoot);
    this.snapshot = emptySnapshot();
    this.manifest = { project_id: '', repositories: [] };
  }

  /**
   * The current in-memory canonical snapshot.
   *
   * Deeply frozen: Store is the sole writer, and a reader holding this object must not be
   * able to edit the canonical graph in place. Without that, a caller could alter records
   * that subsequent reads, projections, and — worst — a frozen `evaluated_snapshot.digest`
   * would then be computed over, or inject repository/workspace records that exist only in
   * memory and bind paths to them.
   */
  currentSnapshot(): Snapshot {
    return this.snapshot;
  }

  /** The current snapshot revision (monotonic concurrency field). */
  currentRevision(): number {
    return this.snapshot.revision;
  }

  /**
   * The validated portable project header (`project.json`).
   *
   * Deeply frozen for the same reason `currentSnapshot()` is: a caller that mutated the
   * returned object in place would be editing the exact value `assertHeadersAgree` later
   * compares a freshly reloaded `state.json` against — silently changing what counts as
   * agreement, or making a genuinely mismatched header appear to agree.
   */
  currentManifest(): ProjectManifest {
    return this.manifest;
  }

  /**
   * The journal warning from the most recent mutation, if its `state.json` write committed
   * but its `history.jsonl` entry did not. Null when the journal is healthy.
   */
  journalWarning(): string | null {
    return this.lastJournalWarning;
  }

  /** Load an existing ledger from disk, failing closed on any mismatch. */
  async load(): Promise<void> {
    // `readProject` validates project.json against project.schema.json and
    // `readSnapshot` reads the portable snapshot; both fail closed with stable codes.
    const manifest = await readProject(this.root);
    const snapshot = await readSnapshot(this.root);

    if (snapshot.schema_version !== SCHEMA_VERSION) {
      throw new StoreError(
        'schema.unsupported_schema_version',
        `state.json schema_version ${String(snapshot.schema_version)} is not supported (expected ${SCHEMA_VERSION})`,
      );
    }

    this.assertHeadersAgree(manifest, snapshot);

    const validation = contractValidateSnapshot(snapshot);
    if (!validation.ok) {
      throw new StoreError(
        validation.code,
        'message' in validation ? validation.message : 'snapshot validation failed',
      );
    }

    this.snapshot = deepFreeze(snapshot);
    this.manifest = deepFreeze(manifest);
    this.historySeq = await this.nextHistorySeq();
  }

  /**
   * Fail closed when a ledger already exists here.
   *
   * `state.json` is the canonical portable snapshot; its presence means this directory is
   * already a ledger, whatever state it is in. Overwriting it is never what `init` means.
   */
  private async assertNotAlreadyInitialized(): Promise<void> {
    let existing: Snapshot;
    try {
      existing = await readSnapshot(this.root);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      // An unreadable state.json is still a ledger: refuse rather than clobber it.
      throw new StoreError(
        'mutation.ledger_already_initialized',
        `${this.root} already contains a state.json that could not be read; ` +
          'refusing to overwrite it',
      );
    }
    throw new StoreError(
      'mutation.ledger_already_initialized',
      `${this.root} is already a tallyback ledger (project ` +
        `${String(existing.project?.project_id)} at revision ${String(existing.revision)}); ` +
        'initializing again would discard it',
    );
  }

  /**
   * TB-REF-009 — the portable header and the portable snapshot must agree on identity.
   *
   * `state.json` is the authority; `project.json` is a bootstrap header. Contradictory
   * identity data fails closed rather than letting one file silently win.
   */
  private assertHeadersAgree(manifest: ProjectManifest, snapshot: Snapshot): void {
    const projectId = snapshot.project?.project_id;
    if (!projectId || projectId !== manifest.project_id) {
      throw new StoreError(
        'invariant.project_identity_mismatch',
        'project.json identity does not match state.json Project record',
      );
    }
    const key = (repos: { repository_id: string; alias: string }[]): string =>
      repos
        .map((r) => `${r.repository_id} ${r.alias}`)
        .slice()
        .sort()
        .join('');
    const declared = key(manifest.repositories ?? []);
    const canonical = key(snapshot.project.repositories ?? []);
    if (declared !== canonical) {
      throw new StoreError(
        'invariant.project_repositories_mismatch',
        'project.json repository declarations do not match the state.json Project record',
      );
    }
  }

  /**
   * Initialize a fresh ledger (project.json + state.json + empty journal + bindings).
   *
   * Refuses to run against a directory that already holds a ledger. Initialization writes
   * `state.json` wholesale, so re-running it over an existing ledger would silently
   * discard every record and mint a new project identity — unrecoverable, and reachable
   * from a bare `tallyback init` typed twice.
   */
  async initialize(options: InitOptions = {}): Promise<void> {
    return this.withLock(() => this.initializeNow(options));
  }

  private async initializeNow(options: InitOptions = {}): Promise<void> {
    await this.assertNotAlreadyInitialized();
    const projectId = options.project_id ?? newId('prj_');
    const repositories = (options.repositories ?? [{ alias: 'main' }])
      .map((repo) => ({ repository_id: newId('repo_'), alias: repo.alias }))
      // `project.repositories` and `snapshot.repositories` are registered `set` arrays
      // keyed by repository_id (contract/canonicalization.json).
      .sort((a, b) =>
        a.repository_id < b.repository_id ? -1 : a.repository_id > b.repository_id ? 1 : 0,
      );

    const manifest: ProjectManifest = { project_id: projectId, repositories };
    const snapshot: Snapshot = emptySnapshot();
    snapshot.project = { project_id: projectId, repositories };
    snapshot.repositories = repositories;

    if (options.topic) {
      snapshot.topics.push({
        topic_id: newId('top_'),
        project_id: projectId,
        name: options.topic.name,
        goal: options.topic.goal,
        created_by: options.created_by ?? DEFAULT_CREATED_BY,
        created_at: nowIso(),
      });
    }

    const validation = contractValidateSnapshot(snapshot);
    if (!validation.ok) {
      throw new StoreError(
        validation.code,
        'message' in validation ? validation.message : 'initial snapshot validation failed',
      );
    }

    await writeProject(this.root, manifest);
    await writeSnapshot(this.root, snapshot);
    await writeBindings(this.root, { repositories: {} });
    await this.writeJournal({
      seq: this.historySeq++,
      at: nowIso(),
      kind: 'init',
      revision: 0,
      project_id: projectId,
    });

    this.snapshot = deepFreeze(snapshot);
    this.manifest = deepFreeze(manifest);
  }

  /**
   * Append an operation atomically under the single-writer lock. Returns a result; never
   * throws for ordinary mutation failures (a revision conflict is an outcome, not an
   * exception). A lock that cannot be acquired is an exception: it means the mutation was
   * never attempted.
   */
  async append(operation: AppendOperation): Promise<AppendResult> {
    return this.runExclusive(() => this.appendNow(operation));
  }

  /**
   * Append `records` at the ledger's **current** revision, resolved under the lock.
   *
   * The convenience commands in `commands.ts` use this when the caller did not pin an
   * expected revision. Resolving the revision inside the critical section (after the
   * on-disk reload) is what makes "append at current" mean the committed current revision
   * rather than whatever this instance happened to hold before the lock was taken. A
   * caller that *does* pin `expectedRevision` keeps the strict optimistic semantics: a
   * ledger that moved under it is rejected with `mutation.revision_conflict`.
   */
  protected async appendAtCurrent(
    records: AnyRecord[],
    expectedRevision?: number,
  ): Promise<AppendResult> {
    return this.runExclusive(() =>
      this.appendNow({
        kind: 'append_records',
        expected_revision: expectedRevision ?? this.currentRevision(),
        records,
        provenance: { submitted_by: this.submitter },
      }),
    );
  }

  /**
   * Apply + persist under the (already held) filesystem lock.
   *
   * Callers reach this only through `runExclusive`, which owns the lock and has already
   * reloaded the authoritative on-disk snapshot into `this.snapshot`. The expected-revision
   * comparison inside `applyAppend` is therefore against the committed disk state, not
   * against whatever this instance last saw.
   */
  protected async appendNow(operation: AppendOperation): Promise<AppendResult> {
    const before = this.snapshot;
    const result = applyAppend(before, operation);

    if (!result.ok) {
      await this.writeJournal({
        seq: this.historySeq++,
        at: nowIso(),
        kind: 'append_rejected',
        revision: before.revision,
        code: result.code,
        expected_revision: operation.expected_revision,
      });
      return result;
    }

    if (result.appendedCount === 0) {
      // A fully idempotent replay (TB-ID-003): `result.snapshot` is `before` itself,
      // byte-for-byte, so there is nothing to persist. Writing it back anyway would make
      // a genuine no-op depend on `state.json` being writable at all — a read-only
      // filesystem, or an injected persistence fault, would turn "nothing changed" into
      // `mutation.persist_failed`, which is exactly the outcome TB-ID-003 says a replay
      // must never produce. Still journal it (best-effort, non-blocking) for visibility.
      await this.writeJournal({
        seq: this.historySeq++,
        at: nowIso(),
        kind: 'append_replayed',
        revision: result.revision,
        record_ids: operation.records.map((record) => this.recordIdSafe(record)),
      });
      return result;
    }

    // Persist BEFORE adopting the new snapshot: if `state.json` cannot be replaced, the
    // mutation did not happen, and the in-memory canonical state must still be `before`.
    try {
      await this.writeSnapshotFile(result.snapshot);
    } catch (err) {
      this.snapshot = before;
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code: unknown }).code)
          : 'mutation.persist_failed';
      const message = err instanceof Error ? err.message : String(err);
      await this.writeJournal({
        seq: this.historySeq++,
        at: nowIso(),
        kind: 'append_persist_failed',
        revision: before.revision,
        code,
        expected_revision: operation.expected_revision,
      });
      return { ok: false, code: 'mutation.persist_failed', message: `${code}: ${message}` };
    }

    // Committed. From here the mutation is durable, and nothing that follows may downgrade
    // it to "not recorded".
    this.snapshot = deepFreeze(result.snapshot);
    await this.writeJournal({
      seq: this.historySeq++,
      at: nowIso(),
      kind: 'append',
      revision: result.revision,
      appended: result.appendedCount,
      replayed: result.replayed,
      record_ids: operation.records.map((record) => this.recordIdSafe(record)),
    });
    return result;
  }

  /**
   * Run a multi-step mutation under the real single-writer lock.
   *
   * The sequence is deliberate: take the filesystem lock, re-read the authoritative
   * snapshot from disk, run the body against it, and release the lock in `finally`.
   */
  protected async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    return this.withLock(async () => {
      await this.reloadUnderLock();
      return fn();
    });
  }

  /**
   * Hold the cross-process write lock for the duration of `fn`, without reloading.
   *
   * Used by operations that are not appends against an existing snapshot (initialization,
   * migration replacement, machine-local binding writes). The lock is always released in
   * `finally`, including when `fn` throws. Not re-entrant: `fn` must not itself call an
   * operation that takes the lock.
   */
  protected async withLock<T>(fn: () => Promise<T>): Promise<T> {
    return this.lock.runExclusive(async () => {
      const handle = await this.acquireWriteLock();
      try {
        return await fn();
      } finally {
        await handle.release();
      }
    });
  }

  /** Acquire the cross-process write lock, or fail closed with `mutation.lock_unavailable`. */
  private async acquireWriteLock(): Promise<LockHandle> {
    try {
      return await acquireLock(storeLockPath(this.root), this.lockOptions);
    } catch (err) {
      if (err instanceof LockError) throw new StoreError(err.code, err.message);
      throw err;
    }
  }

  /**
   * Re-read the committed snapshot from disk while the lock is held.
   *
   * This is what turns `expected_revision` into a real optimistic-concurrency check: the
   * comparison is against what another writer actually committed, not against this
   * instance's possibly-stale copy. A ledger that has not been initialized yet (no
   * `state.json`) keeps the in-memory snapshot.
   */
  private async reloadUnderLock(): Promise<void> {
    let disk: Snapshot;
    try {
      disk = await readSnapshot(this.root);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw err;
    }
    if (disk.schema_version !== SCHEMA_VERSION) {
      throw new StoreError(
        'schema.unsupported_schema_version',
        `state.json schema_version ${String(disk.schema_version)} is not supported (expected ${SCHEMA_VERSION})`,
      );
    }
    // Revalidate on EVERY reload, not only when `revision` changed. `revision` is a
    // number the file itself carries — a hand edit, a broken merge tool, or anything else
    // writing out-of-band can leave content corrupted while leaving the number alone (or
    // simply forget to bump it). Gating validation on revision equality would treat that
    // number as a trustworthy integrity signal it was never meant to be: `validate_append`
    // checks only the *candidate* records against the existing graph, never the graph
    // itself, so an unvalidated `disk` here would be cloned forward and persisted by the
    // very next append instead of failing closed the way `Store.open` would.
    const validation = contractValidateSnapshot(disk);
    if (!validation.ok) {
      throw new StoreError(
        validation.code,
        `state.json no longer validates: ${
          'message' in validation ? (validation.message ?? validation.code) : validation.code
        }`,
      );
    }
    this.assertHeadersAgree(this.manifest, disk);
    // Recompute the journal sequence on EVERY reload, not only when `state.json`'s
    // revision changed. A rejected append or an idempotent replay writes a journal entry
    // (`append_rejected` / `append_replayed`) WITHOUT advancing that revision at all, so
    // two Store instances opened at the same starting revision could each experience one
    // of those and each still believe their own next `seq` is safe — producing duplicate
    // sequence numbers in `history.jsonl` even though `state.json` never disagreed.
    // `history.jsonl` is non-authoritative (SPEC §6.1), but a duplicate seq is still an
    // avoidable, unforced defect: reading it back under the lock costs one file read on
    // an operation that already does several.
    this.historySeq = await this.nextHistorySeq();
    this.snapshot = deepFreeze(disk);
  }

  /** Reload the snapshot from disk, discarding in-memory state. */
  async reload(): Promise<void> {
    await this.load();
  }

  /**
   * Replace `state.json`. Overridable so failure-injection tests can prove that a failed
   * snapshot write leaves the in-memory canonical state untouched.
   */
  protected async writeSnapshotFile(snapshot: Snapshot): Promise<void> {
    await writeSnapshot(this.root, snapshot);
  }

  /**
   * Append one entry to the non-authoritative local journal.
   *
   * SPEC §6.1: deleting `history.jsonl` may reduce recovery and forensic detail but must
   * never make `state.json` unintelligible. A journal write that fails therefore records a
   * warning and does not affect the outcome of an already-committed mutation.
   */
  protected async writeJournal(entry: HistoryEntry): Promise<void> {
    try {
      await this.appendJournalEntry(entry);
      this.lastJournalWarning = null;
    } catch (err) {
      this.lastJournalWarning = `history.jsonl entry ${entry.seq} (${entry.kind}) was not written: ${
        err instanceof Error ? err.message : String(err)
      }`;
    }
  }

  /**
   * The raw journal append. Separated from `writeJournal` so the failure-handling policy
   * above stays in force for every caller — including a subclass that injects a journal
   * fault, which must exercise the real catch rather than replace it.
   */
  protected async appendJournalEntry(entry: HistoryEntry): Promise<void> {
    await appendHistory(this.root, entry);
  }

  /** Delegate: structural + referential validity of a snapshot (defaults to current). */
  validate_snapshot(snapshot?: Snapshot): ValidationResult {
    return contractValidateSnapshot(snapshot ?? this.snapshot);
  }

  /** Delegate: transition validity of an append against a snapshot (defaults to current). */
  validate_append(operation: AppendOperation, current?: Snapshot): ValidationResult {
    return contractValidateAppend(current ?? this.snapshot, operation);
  }

  /** The project id of a snapshot (empty string when no Project record exists). */
  protected projectId(snapshot: Snapshot): string {
    return snapshot.project?.project_id ?? '';
  }

  private recordIdSafe(record: AnyRecord): string | null {
    try {
      return recordId(record);
    } catch {
      return null;
    }
  }

  private async nextHistorySeq(): Promise<number> {
    const entries = await readHistory(this.root);
    if (entries.length === 0) return 1;
    // `history.jsonl` is non-authoritative forensic data (SPEC §6.1 / CLAUDE.md): a
    // malformed line (e.g. the valid-JSON-but-wrong-shape `null`) must not disable access
    // to the canonical `state.json` it merely journals, so a non-object entry contributes
    // 0 to the max rather than throwing on `e.seq`.
    const max = entries.reduce((acc, e) => {
      const seq = e !== null && typeof e === 'object' && typeof e.seq === 'number' ? e.seq : 0;
      return Math.max(acc, seq);
    }, 0);
    return max + 1;
  }
}
