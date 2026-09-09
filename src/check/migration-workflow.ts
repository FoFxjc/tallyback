/**
 * The legacy → canonical migration **workflow**.
 *
 * `migration.ts` is the pure mapper: legacy shape in, canonical records out. This module
 * is the one-time, persisted, atomic transaction SPEC §14 actually promises:
 *
 * > Migration from the existing foundations is one-time, persisted, and atomic — one
 * > Store transaction conceptually: generate IDs, preserve existing `Tn` aliases, rewrite
 * > every reference, and write the mapping into the migrated snapshot. **IDs are never
 * > regenerated on later reads.**
 *
 * The shape of that guarantee here:
 *
 * - **Deterministic identity.** Canonical ids are derived from a domain-separated SHA-256
 *   over the legacy entity's stable position and identity, not from a clock. A preview and
 *   the migration it previews therefore mint the *same* ids, and a resumed migration
 *   reuses them rather than regenerating identity. The ids are structurally canonical
 *   (`<prefix>_<UUIDv7-shaped>`); their bits are content-derived rather than time-ordered,
 *   which the contract's id shape permits and which is what makes them reproducible.
 * - **Persisted mapping.** The staged plan (mapping + assembled snapshot) is written to
 *   `runtime/migration.state.json` *before* anything portable is touched.
 * - **Validated before persistence.** The assembled snapshot must pass `validate_snapshot`
 *   or nothing is written at all.
 * - **Atomic replacement.** `project.json` and `state.json` are replaced through the same
 *   atomic temp-file + rename path every other Store write uses, under the store's
 *   single-writer lock.
 * - **No silent rerun.** A completed migration leaves `migration-report.json`; a second
 *   run is refused with `mutation.migration_already_applied` rather than quietly re-minting
 *   a parallel universe of ids.
 * - **Safe resume.** A run interrupted after staging finds its marker, reuses the staged
 *   plan verbatim, and finishes. No heuristic merge, no re-derivation.
 *
 * Nothing is fabricated: no Declarations, Attempts, Claims, or semantic truth that the
 * legacy data does not contain. Missing provenance becomes the explicit legacy variant
 * (`actor: unknown`, null timestamps), and everything the legacy store expressed as a
 * derived status becomes a diagnostic rather than an invented record.
 */

import { createHash, randomUUID } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import {
  snapshotDigest,
  writeProject,
  writeSnapshot,
  type ProjectManifest,
} from '../ledger/snapshot.js';
import { LedgerStore } from '../ledger/store.js';
import {
  semanticSnapshotDigest,
  validate_migration_report,
  validate_snapshot,
} from '../contract/index.js';
import type { Actor, Digest, Snapshot } from '../contract/index.js';
import {
  assembleMigratedSnapshot,
  migrateLegacySnapshot,
  type LegacySnapshot,
  type MigratedRecords,
  type MigrationIdFactory,
} from './migration.js';

/**
 * Stable migration outcome codes.
 *
 * They stay inside the namespaces SPEC §11 defines — there is no `migration.*` namespace
 * in the frozen table, and a one-time migration is not licence to invent one. A legacy
 * store that cannot be read or walked is malformed wire data (`schema.*`); a migration
 * transaction that refuses to run, or refuses to run twice, is a transaction failure
 * (`mutation.*`).
 */
export const MIGRATION_CODES = {
  MALFORMED_SOURCE: 'schema.malformed_legacy_source',
  VALIDATION_FAILED: 'mutation.migration_validation_failed',
  ALREADY_APPLIED: 'mutation.migration_already_applied',
  REPORT_INVALID: 'schema.invalid_migration_report',
  TARGET_OCCUPIED: 'mutation.migration_target_occupied',
} as const;

/** The file names this workflow owns, all under the ledger root. */
export const MIGRATION_REPORT_FILE = 'migration-report.json';
export const MIGRATION_STATE_FILE = join('runtime', 'migration.state.json');

// ---------------------------------------------------------------------------
// Deterministic identity
// ---------------------------------------------------------------------------

const ID_DOMAIN = 'tallyback.migration.v1';

/**
 * Derive a canonical id deterministically from a legacy entity key.
 *
 * The digest is reshaped into the canonical UUID layout with the version nibble forced to
 * `7` and the variant nibble into `8..b`, so the result satisfies the contract's id
 * pattern exactly. Same legacy input ⇒ same id, on every machine and every run.
 */
export function deterministicMigrationId(prefix: string, key: string): string {
  const hex = createHash('sha256').update(`${ID_DOMAIN}|${prefix}|${key}`, 'utf8').digest('hex');
  const variant = '89ab'[parseInt(hex[16] as string, 16) % 4] as string;
  const uuid = [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `7${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
  return `${prefix}${uuid}`;
}

const deterministicFactory: MigrationIdFactory = (prefix, key) =>
  deterministicMigrationId(prefix, key);

// ---------------------------------------------------------------------------
// Report document (contract/schemas/migration-report.schema.json)
// ---------------------------------------------------------------------------

export interface MigrationReportDocument {
  schema_version: '1.0.0';
  report_id: string;
  kind: 'preview' | 'applied';
  status: 'ok' | 'requires_reconciliation' | 'failed';
  created_at: string | null;
  created_by: Actor;
  source: { store: string; legacy_schema_version?: string };
  diagnostics: { code: string; message: string }[];
  mapping: {
    topics: { legacy_name: string; topic_id: string }[];
    tasks: { legacy_alias: string; task_id: string }[];
    evidence: { legacy_index: number; evidence_id: string }[];
  };
  counts: { topics: number; tasks: number; evidence: number };
  snapshot?: { revision: number; digest: Digest };
}

export interface MigrationOptions {
  /** Project root containing (or about to contain) `.tallyback/`. */
  projectRoot: string;
  /** The legacy store, already parsed. Use `readLegacySource` to load one from disk. */
  legacy: unknown;
  /** A human-readable locator for the legacy store, recorded in the report. */
  source: string;
  legacy_schema_version?: string;
  created_by?: Actor;
  /** Injectable clock, so a report can be produced deterministically in tests. */
  now?: () => string;
}

export type MigrationOutcome =
  | {
      ok: true;
      kind: 'preview' | 'applied';
      /** True when an interrupted run was resumed from its staged plan. */
      resumed: boolean;
      report: MigrationReportDocument;
      snapshot: Snapshot;
    }
  | { ok: false; code: string; message: string; report?: MigrationReportDocument };

const DEFAULT_CREATED_BY: Actor = { kind: 'migrated', id: 'tallyback-migrate' };

// ---------------------------------------------------------------------------
// Source loading + shape validation
// ---------------------------------------------------------------------------

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validate the legacy store's *shape* — the structure the mapper walks.
 *
 * Field-level type problems (a numeric topic name, say) are deliberately not caught here:
 * they surface later as a contract validation failure against the assembled snapshot,
 * which is the honest place to report "the legacy data cannot become a valid canonical
 * graph" rather than guessing a repair.
 */
export function checkLegacyShape(legacy: unknown): string | null {
  if (!isObject(legacy)) return 'legacy store is not a JSON object';
  const topics = legacy['topics'];
  if (topics !== undefined && !Array.isArray(topics)) return 'legacy `topics` is not an array';
  for (const [i, topic] of (Array.isArray(topics) ? topics : []).entries()) {
    if (!isObject(topic)) return `legacy topics[${i}] is not an object`;
    if (!('name' in topic)) return `legacy topics[${i}] has no name`;
    const tasks = topic['tasks'];
    if (tasks !== undefined && !Array.isArray(tasks)) {
      return `legacy topics[${i}].tasks is not an array`;
    }
    for (const [j, task] of (Array.isArray(tasks) ? tasks : []).entries()) {
      if (!isObject(task)) return `legacy topics[${i}].tasks[${j}] is not an object`;
      if (typeof task['id'] !== 'string') {
        return `legacy topics[${i}].tasks[${j}] has no string id (the Tn alias)`;
      }
      const path = `legacy topics[${i}].tasks[${j}]`;

      // `evidence` is mapped element-by-element into an observation's free text, so each
      // element must itself already be the string the mapper treats it as.
      const evidence = task['evidence'];
      if (evidence !== undefined) {
        if (!Array.isArray(evidence)) return `${path}.evidence is not an array`;
        for (const [k, item] of evidence.entries()) {
          if (typeof item !== 'string') return `${path}.evidence[${k}] is not a string`;
        }
      }

      // `attempts` / `blockers` / `decisions` are mapped element-by-element and the
      // mapper dereferences named fields on each one (`attempt.description`,
      // `blocker.description`, `decision.summary`, …). An element that is not an object —
      // `null`, a number, a bare string — would otherwise crash the mapper instead of
      // being reported as a malformed source, or silently seed a placeholder record from
      // nothing the legacy store actually said.
      for (const key of ['attempts', 'blockers', 'decisions'] as const) {
        const value = task[key];
        if (value === undefined) continue;
        if (!Array.isArray(value)) return `${path}.${key} is not an array`;
        for (const [k, item] of value.entries()) {
          if (!isObject(item)) return `${path}.${key}[${k}] is not an object`;
        }
      }
    }
  }
  return null;
}

/** Read and parse a legacy store file, reporting a malformed source with its own code. */
export async function readLegacySource(
  path: string,
): Promise<{ ok: true; legacy: LegacySnapshot } | { ok: false; code: string; message: string }> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    return {
      ok: false,
      code: MIGRATION_CODES.MALFORMED_SOURCE,
      message: `cannot read legacy store ${path}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return {
      ok: false,
      code: MIGRATION_CODES.MALFORMED_SOURCE,
      message: `legacy store ${path} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  const shape = checkLegacyShape(parsed);
  if (shape !== null) {
    return { ok: false, code: MIGRATION_CODES.MALFORMED_SOURCE, message: shape };
  }
  return { ok: true, legacy: parsed as LegacySnapshot };
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

interface MigrationPlan {
  snapshot: Snapshot;
  manifest: ProjectManifest;
  mapping: MigrationReportDocument['mapping'];
  counts: MigrationReportDocument['counts'];
  diagnostics: { code: string; message: string }[];
}

function buildMapping(
  legacy: LegacySnapshot,
  records: MigratedRecords,
): MigrationReportDocument['mapping'] {
  const topicNames = (legacy.topics ?? []).map((t) => t.name);
  return {
    topics: records.topics.map((topic, i) => ({
      legacy_name: topicNames[i] ?? topic.name,
      topic_id: topic.topic_id,
    })),
    tasks: records.tasks.map((task) => ({
      legacy_alias: task.alias ?? task.task_id,
      task_id: task.task_id,
    })),
    // The legacy store has no evidence identity of its own; the stable legacy handle is
    // the migrated ordinal, which the deterministic id derivation reproduces exactly.
    evidence: records.evidence.map((evidence, index) => ({
      legacy_index: index,
      evidence_id: evidence.evidence_id,
    })),
  };
}

/** Map + assemble, without touching the filesystem. */
export function planMigration(legacy: LegacySnapshot): MigrationPlan {
  const { records, report } = migrateLegacySnapshot(legacy, { idFactory: deterministicFactory });
  const snapshot = assembleMigratedSnapshot(records);
  const project = records.projects[0];
  if (!project) throw new Error('migration produced no Project record');
  return {
    snapshot,
    manifest: { project_id: project.project_id, repositories: project.repositories },
    mapping: buildMapping(legacy, records),
    counts: {
      topics: records.topics.length,
      tasks: records.tasks.length,
      evidence: records.evidence.length,
    },
    diagnostics: report.diagnostics.map((message) => ({
      // A migration diagnostic is not a violation: it records what the legacy store
      // expressed that has no canonical counterpart, so it is never silently invented.
      code: 'check.legacy_field_not_migrated',
      message,
    })),
  };
}

function buildReport(
  plan: MigrationPlan,
  options: MigrationOptions,
  kind: 'preview' | 'applied',
  status: MigrationReportDocument['status'],
): MigrationReportDocument {
  const now = options.now ?? (() => new Date().toISOString());
  const report: MigrationReportDocument = {
    schema_version: '1.0.0',
    report_id: randomUUID(),
    kind,
    status,
    created_at: now(),
    created_by: options.created_by ?? DEFAULT_CREATED_BY,
    source: { store: options.source },
    diagnostics: plan.diagnostics,
    mapping: plan.mapping,
    counts: plan.counts,
  };
  if (options.legacy_schema_version !== undefined) {
    report.source.legacy_schema_version = options.legacy_schema_version;
  }
  if (kind === 'applied') {
    report.snapshot = { revision: plan.snapshot.revision, digest: snapshotDigest(plan.snapshot) };
  }
  return report;
}

// ---------------------------------------------------------------------------
// Staged plan (the interrupted-migration marker)
// ---------------------------------------------------------------------------

interface StagedPlan {
  staged_at: string;
  source: string;
  mapping: MigrationReportDocument['mapping'];
  counts: MigrationReportDocument['counts'];
  diagnostics: { code: string; message: string }[];
  manifest: ProjectManifest;
  snapshot: Snapshot;
}

/**
 * Whether the snapshot already on disk is the one this migration staged.
 *
 * Compared on canonical semantic bytes, so a resumed run recognizes its own half-finished
 * work instead of mistaking it for a foreign ledger.
 */
function isOurStagedSnapshot(occupied: unknown, staged: Snapshot): boolean {
  try {
    return (
      semanticSnapshotDigest(occupied as Snapshot).value === semanticSnapshotDigest(staged).value
    );
  } catch {
    return false;
  }
}

/** Raised when the migration target acquired a ledger before the commit could run. */
class MigrationTargetOccupiedError extends Error {
  readonly code = MIGRATION_CODES.TARGET_OCCUPIED;
}

/** A minimal Store handle used only to reuse the ledger's atomic write + lock plumbing. */
class MigrationStore extends LedgerStore {
  async stage(plan: StagedPlan): Promise<void> {
    await this.withLock(async () => {
      await this.writeStaged(plan);
    });
  }

  /**
   * Replace the portable files, under the store's single-writer lock.
   *
   * The occupancy check is re-run **inside** the lock. Checking before staging is not
   * enough: another process can initialize a ledger in the window between that check and
   * this write, and a resumed migration skips the earlier check entirely — either way this
   * would replace a `state.json` it never inspected. The last thing that looks before
   * overwriting has to be the thing doing the overwriting.
   */
  async commit(plan: StagedPlan, report: MigrationReportDocument): Promise<void> {
    await this.withLock(async () => {
      const occupied = await readJsonIfPresent(join(this.root, 'state.json'));
      // Byte-identity to the staged plan distinguishes "this migration already wrote the
      // snapshot and then crashed" from "somebody else's ledger is here".
      if (occupied !== null && !isOurStagedSnapshot(occupied, plan.snapshot)) {
        throw new MigrationTargetOccupiedError(
          `${this.root} gained a tallyback ledger while this migration was staged; ` +
            'refusing to replace it',
        );
      }
      // Atomic replacement: both portable files go through the temp-file + rename path.
      await writeProject(this.root, plan.manifest);
      await writeSnapshot(this.root, plan.snapshot);
      await this.writeJsonFile(MIGRATION_REPORT_FILE, report);
      await rm(join(this.root, MIGRATION_STATE_FILE), { force: true });
    });
  }

  private async writeStaged(plan: StagedPlan): Promise<void> {
    await this.writeJsonFile(MIGRATION_STATE_FILE, plan);
  }

  private async writeJsonFile(relative: string, value: unknown): Promise<void> {
    const { mkdir, writeFile, rename } = await import('node:fs/promises');
    const { dirname } = await import('node:path');
    const target = join(this.root, relative);
    await mkdir(dirname(target), { recursive: true });
    const tmp = `${target}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
      await rename(tmp, target);
    } catch (err) {
      await rm(tmp, { force: true }).catch(() => undefined);
      throw err;
    }
  }
}

async function readJsonIfPresent(path: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

/** The report of a completed migration under this project root, if there is one. */
export async function readMigrationReport(
  projectRoot: string,
): Promise<MigrationReportDocument | null> {
  const value = await readJsonIfPresent(join(projectRoot, '.tallyback', MIGRATION_REPORT_FILE));
  return value as MigrationReportDocument | null;
}

/** The staged plan of an interrupted migration under this project root, if there is one. */
export async function readStagedMigration(projectRoot: string): Promise<StagedPlan | null> {
  const value = await readJsonIfPresent(join(projectRoot, '.tallyback', MIGRATION_STATE_FILE));
  return value as StagedPlan | null;
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

function validatePlan(plan: MigrationPlan): { code: string; message: string } | null {
  const validation = validate_snapshot(plan.snapshot);
  if (!validation.ok) {
    return {
      code: MIGRATION_CODES.VALIDATION_FAILED,
      message: `the migrated snapshot is not a valid canonical graph (${validation.code}: ${
        validation.message ?? 'no detail'
      })`,
    };
  }
  return null;
}

function validateReport(report: MigrationReportDocument): { code: string; message: string } | null {
  const validation = validate_migration_report(report);
  if (!validation.ok) {
    return {
      code: MIGRATION_CODES.REPORT_INVALID,
      message: validation.message ?? 'the migration report does not satisfy its schema',
    };
  }
  return null;
}

/**
 * Preview a migration: map, assemble, validate, and produce the report — **writing
 * nothing**. The ids in the preview are the ids `applyMigration` will use.
 */
export async function previewMigration(options: MigrationOptions): Promise<MigrationOutcome> {
  const shape = checkLegacyShape(options.legacy);
  if (shape !== null) {
    return { ok: false, code: MIGRATION_CODES.MALFORMED_SOURCE, message: shape };
  }
  const plan = planMigration(options.legacy as LegacySnapshot);
  const invalid = validatePlan(plan);
  if (invalid) {
    return { ok: false, ...invalid, report: buildReport(plan, options, 'preview', 'failed') };
  }
  const report = buildReport(plan, options, 'preview', 'ok');
  const badReport = validateReport(report);
  if (badReport) return { ok: false, ...badReport, report };
  return { ok: true, kind: 'preview', resumed: false, report, snapshot: plan.snapshot };
}

/**
 * Apply a migration: stage the plan, then atomically replace the portable files and write
 * the report.
 *
 * A completed migration is refused rather than repeated. An interrupted one — a staged
 * plan with no report — is resumed from the staged plan, so the canonical ids are the ones
 * the interrupted run already committed to, never freshly minted.
 */
export async function applyMigration(options: MigrationOptions): Promise<MigrationOutcome> {
  const existingReport = await readMigrationReport(options.projectRoot);
  if (existingReport && existingReport.kind === 'applied') {
    return {
      ok: false,
      code: MIGRATION_CODES.ALREADY_APPLIED,
      message:
        `this ledger was already migrated (report ${existingReport.report_id}, ` +
        `${String(existingReport.created_at)}); migration is one-time and never re-runs silently`,
      report: existingReport,
    };
  }

  const staged = await readStagedMigration(options.projectRoot);

  // Migration REPLACES the portable files wholesale. A directory that already holds a
  // ledger it did not stage is not a migration target: without this guard, running
  // `migrate --apply` in an ordinary project silently discards every record and mints a
  // new project identity. The absence of a migration report is not evidence that the
  // directory is empty.
  // An occupied target is a refusal only when it is somebody *else's* ledger. A migration
  // interrupted after `writeSnapshot` but before its report and marker were finished leaves
  // behind precisely the snapshot this plan means to write, and refusing that would wedge
  // the documented resumable path on an ordinary crash.
  const occupied = await readJsonIfPresent(join(options.projectRoot, '.tallyback', 'state.json'));
  if (occupied !== null && !(staged && isOurStagedSnapshot(occupied, staged.snapshot))) {
    return {
      ok: false,
      code: MIGRATION_CODES.TARGET_OCCUPIED,
      message:
        `${options.projectRoot} already contains a tallyback ledger; migration replaces ` +
        'the portable files wholesale and will not overwrite an existing one',
    };
  }

  const store = new MigrationStore(options.projectRoot);

  let plan: MigrationPlan;
  let resumed = false;
  if (staged) {
    // Resume: reuse the persisted identity verbatim. Nothing is re-derived, so an
    // interrupted migration cannot produce a second set of canonical ids.
    resumed = true;
    plan = {
      snapshot: staged.snapshot,
      manifest: staged.manifest,
      mapping: staged.mapping,
      counts: staged.counts,
      diagnostics: staged.diagnostics,
    };
  } else {
    const shape = checkLegacyShape(options.legacy);
    if (shape !== null) {
      return { ok: false, code: MIGRATION_CODES.MALFORMED_SOURCE, message: shape };
    }
    plan = planMigration(options.legacy as LegacySnapshot);
  }

  // Validate before persisting anything portable — a migration that cannot produce a
  // valid canonical graph writes nothing at all.
  const invalid = validatePlan(plan);
  if (invalid) {
    return { ok: false, ...invalid, report: buildReport(plan, options, 'applied', 'failed') };
  }

  // C8: on resume the committed data comes from the staged plan, so the report must name
  // the source that plan was built from. Reporting the *current* invocation's `--source`
  // would permanently attribute source A's data to source B.
  const reportOptions =
    staged && staged.source !== options.source ? { ...options, source: staged.source } : options;
  const report = buildReport(plan, reportOptions, 'applied', 'ok');
  if (staged && staged.source !== options.source) {
    report.diagnostics = [
      ...report.diagnostics,
      {
        code: 'check.legacy_field_not_migrated',
        message:
          `resumed a migration staged from ${staged.source}; the --source given on resume ` +
          `(${options.source}) was ignored because the staged plan is what gets committed`,
      },
    ];
  }
  const badReport = validateReport(report);
  if (badReport) return { ok: false, ...badReport, report };

  if (!staged) {
    await store.stage({
      staged_at: (options.now ?? (() => new Date().toISOString()))(),
      source: options.source,
      mapping: plan.mapping,
      counts: plan.counts,
      diagnostics: plan.diagnostics,
      manifest: plan.manifest,
      snapshot: plan.snapshot,
    });
  }

  try {
    await store.commit(
      {
        staged_at: staged?.staged_at ?? report.created_at ?? '',
        source: report.source.store,
        mapping: plan.mapping,
        counts: plan.counts,
        diagnostics: plan.diagnostics,
        manifest: plan.manifest,
        snapshot: plan.snapshot,
      },
      report,
    );
  } catch (err) {
    if (err instanceof MigrationTargetOccupiedError) {
      return { ok: false, code: MIGRATION_CODES.TARGET_OCCUPIED, message: err.message };
    }
    throw err;
  }

  return { ok: true, kind: 'applied', resumed, report, snapshot: plan.snapshot };
}

/**
 * Stage a migration without committing it.
 *
 * Exposed so an interrupted migration can be reproduced faithfully (stage, then die before
 * the commit) and so a host can inspect the exact plan before it replaces anything.
 */
export async function stageMigration(options: MigrationOptions): Promise<MigrationOutcome> {
  const shape = checkLegacyShape(options.legacy);
  if (shape !== null) {
    return { ok: false, code: MIGRATION_CODES.MALFORMED_SOURCE, message: shape };
  }
  const occupied = await readJsonIfPresent(join(options.projectRoot, '.tallyback', 'state.json'));
  if (occupied !== null) {
    return {
      ok: false,
      code: MIGRATION_CODES.TARGET_OCCUPIED,
      message: `${options.projectRoot} already contains a tallyback ledger`,
    };
  }
  const plan = planMigration(options.legacy as LegacySnapshot);
  const invalid = validatePlan(plan);
  if (invalid) {
    return { ok: false, ...invalid, report: buildReport(plan, options, 'preview', 'failed') };
  }
  const store = new MigrationStore(options.projectRoot);
  await store.stage({
    staged_at: (options.now ?? (() => new Date().toISOString()))(),
    source: options.source,
    mapping: plan.mapping,
    counts: plan.counts,
    diagnostics: plan.diagnostics,
    manifest: plan.manifest,
    snapshot: plan.snapshot,
  });
  return {
    ok: true,
    kind: 'preview',
    resumed: false,
    report: buildReport(plan, options, 'preview', 'ok'),
    snapshot: plan.snapshot,
  };
}
