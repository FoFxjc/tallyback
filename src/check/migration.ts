/**
 * Legacy Store → canonical migration (one-time, atomic).
 *
 * Follows contract/SPEC.md §14 and docs/migration.md:
 *
 * - generate canonical IDs, **never regenerate on later reads**;
 * - preserve legacy `Tn` aliases on the canonical Task (`alias`);
 * - rewrite every internal reference to canonical IDs;
 * - write the mapping into the migrated snapshot;
 * - **field-complete and non-fabricating**: missing provenance becomes
 *   `actor: unknown` + nullable timestamps — no synthesized actors, no
 *   synthesized TaskDeclaration;
 * - legacy evidence strings and legacy `attempts[]` entries each become **one**
 *   Evidence `observation` (attempts are never turned into Attempt records);
 * - legacy `status: 'done'` becomes an `observation`, never a Claim.
 *
 * Records are produced in the canonical `contract` shapes; `contract`'s
 * `Timestamp` type (nullable) and `ActorKind` (`unknown` / `migrated`) are the
 * explicit legacy-provenance variant.
 */

import { compareByCodeUnit } from '../contract/jcs.js';
import { newId } from './ids.js';
import type {
  Actor,
  Blocker,
  Decision,
  DecisionSubject,
  Evidence,
  FindingCode,
  Project,
  Snapshot,
  Task,
  Topic,
  VerdictConclusion,
} from '../contract/index.js';

/* ------------------------------------------------------------------ */
/* Legacy Store shape (assumed; see docs/migration.md field references) */
/* ------------------------------------------------------------------ */

export interface LegacyAttempt {
  description?: string;
  outcome?: string;
}

export interface LegacyDecision {
  summary?: string;
  rationale?: string;
}

export interface LegacyBlocker {
  description?: string;
  task_id?: string;
}

export interface LegacyTask {
  /** Legacy local alias, e.g. `T1`. */
  id: string;
  title?: string;
  status?: string;
  evidence?: string[];
  attempts?: LegacyAttempt[];
  blockers?: LegacyBlocker[];
  decisions?: LegacyDecision[];
  next_action?: string;
}

export interface LegacyTopic {
  name: string;
  goal?: string;
  status?: string;
  tasks?: LegacyTask[];
}

export interface LegacySnapshot {
  topics?: LegacyTopic[];
  active_topic?: string;
  current_task?: string;
}

/* ------------------------------------------------------------------ */
/* Canonical migration projection                                      */
/* ------------------------------------------------------------------ */

export const UNKNOWN_ACTOR: Actor = { kind: 'unknown', id: 'unknown' };

export interface MigratedRecords {
  projects: Project[];
  topics: Topic[];
  tasks: Task[];
  evidence: Evidence[];
  blockers: Blocker[];
  decisions: Decision[];
}

export interface IdMappingEntry {
  legacy_id: string;
  canonical_id: string;
  record_type: string;
}

export interface MigrationReport {
  /** The legacy-id → canonical-id mapping, written into the migration report. */
  mapping: IdMappingEntry[];
  diagnostics: string[];
}

export interface MigrationResult {
  records: MigratedRecords;
  report: MigrationReport;
}

/**
 * Mint a canonical id for one legacy entity.
 *
 * `key` is a stable, content-addressed description of *which* legacy entity is being
 * migrated (its position and identity in the legacy store), so a deterministic factory
 * can produce the same canonical id for the same legacy input on every run. That is what
 * lets a migration preview and the migration it previews agree, and what lets an
 * interrupted migration resume without regenerating identity (SPEC §14: "IDs are never
 * regenerated on later reads").
 */
export type MigrationIdFactory = (prefix: string, key: string) => string;

export interface MigrateOptions {
  /** Defaults to a fresh random `<prefix>_<UUIDv7>` per entity. */
  idFactory?: MigrationIdFactory;
}

function emptyRecords(): MigratedRecords {
  return { projects: [], topics: [], tasks: [], evidence: [], blockers: [], decisions: [] };
}

function migratedObservation(
  evidence_id: string,
  legacyAlias: string,
  text: string,
  source: string,
): Evidence {
  return {
    evidence_id,
    kind: 'observation',
    submitted_by: UNKNOWN_ACTOR,
    submitted_at: null,
    payload: { text },
    note: `Migrated from ${legacyAlias} (${source}).`,
  };
}

function migratedDecision(
  decision_id: string,
  taskId: string,
  role: 'execution_choice' | 'next_action',
  choice: string,
  rationale: string,
): Decision {
  const subject: DecisionSubject = { kind: 'task', id: taskId };
  return {
    decision_id,
    subject,
    role,
    question: '',
    choice,
    rationale,
    decided_by: UNKNOWN_ACTOR,
    decided_at: null,
    basis: [],
  };
}

/**
 * Migrate a legacy Store snapshot to canonical form. Produces canonical
 * records plus a migration report (id mapping + diagnostics). No TaskDeclaration
 * is synthesized; no Attempt records are fabricated.
 */
export function migrateLegacySnapshot(
  legacy: LegacySnapshot,
  options: MigrateOptions = {},
): MigrationResult {
  const mint: MigrationIdFactory =
    options.idFactory ?? ((prefix) => newId(prefix as Parameters<typeof newId>[0]));
  const report: MigrationReport = { mapping: [], diagnostics: [] };
  const records = emptyRecords();

  const project_id = mint('prj_', 'project');
  records.projects.push({ project_id, repositories: [] });

  if (legacy.active_topic) {
    report.diagnostics.push(
      `active_topic '${legacy.active_topic}' is a local runtime/UI preference and was not migrated`,
    );
  }
  if (legacy.current_task) {
    report.diagnostics.push(
      `current_task '${legacy.current_task}' is derived from open Attempts and was not migrated`,
    );
  }

  const topics = legacy.topics ?? [];
  for (let topicIndex = 0; topicIndex < topics.length; topicIndex++) {
    const topic = topics[topicIndex] as LegacyTopic;
    const topicKey = `topic:${topicIndex}:${topic.name}`;
    const topic_id = mint('top_', topicKey);
    records.topics.push({
      topic_id,
      project_id,
      name: topic.name,
      goal: topic.goal ?? '',
      created_by: UNKNOWN_ACTOR,
      created_at: null,
    });
    report.mapping.push({
      legacy_id: `topic:${topic.name}`,
      canonical_id: topic_id,
      record_type: 'topic',
    });

    if (topic.status) {
      report.diagnostics.push(
        `topic '${topic.name}': legacy status '${topic.status}' is a derived projection and was not migrated`,
      );
    }

    const tasks = topic.tasks ?? [];
    for (let taskIndex = 0; taskIndex < tasks.length; taskIndex++) {
      const task = tasks[taskIndex] as LegacyTask;
      const taskKey = `${topicKey}|task:${taskIndex}:${task.id}`;
      const task_id = mint('tsk_', taskKey);
      records.tasks.push({
        task_id,
        topic_id,
        title: task.title ?? '',
        alias: task.id,
      });
      report.mapping.push({ legacy_id: task.id, canonical_id: task_id, record_type: 'task' });

      // Legacy evidence strings → one observation Evidence each.
      const taskEvidence = task.evidence ?? [];
      for (let i = 0; i < taskEvidence.length; i++) {
        records.evidence.push(
          migratedObservation(
            mint('evi_', `${taskKey}|evidence:${i}`),
            task.id,
            taskEvidence[i] as string,
            'legacy-task-evidence',
          ),
        );
      }

      // Legacy attempts[] → one observation Evidence each (never Attempt records).
      const taskAttempts = task.attempts ?? [];
      for (let i = 0; i < taskAttempts.length; i++) {
        const attempt = taskAttempts[i] as LegacyAttempt;
        const text = [attempt.description, attempt.outcome ? `outcome: ${attempt.outcome}` : '']
          .filter((part) => part && part.length > 0)
          .join(' — ');
        records.evidence.push(
          migratedObservation(
            mint('evi_', `${taskKey}|attempt:${i}`),
            task.id,
            text || '(attempt)',
            'legacy-attempt',
          ),
        );
      }

      // Legacy status 'done' → observation (never a Claim).
      if (task.status === 'done') {
        records.evidence.push(
          migratedObservation(
            mint('evi_', `${taskKey}|status`),
            task.id,
            'legacy status: done',
            'legacy-status',
          ),
        );
      } else if (task.status && task.status !== 'done') {
        report.diagnostics.push(
          `task '${task.id}': legacy status '${task.status}' was not migrated as authority`,
        );
      }

      if (task.next_action) {
        const decision = migratedDecision(
          mint('dec_', `${taskKey}|next_action`),
          task_id,
          'next_action',
          task.next_action,
          '',
        );
        records.decisions.push(decision);
        report.mapping.push({
          legacy_id: `next_action:${task.id}`,
          canonical_id: decision.decision_id,
          record_type: 'decision',
        });
      }

      const taskBlockers = task.blockers ?? [];
      for (let i = 0; i < taskBlockers.length; i++) {
        const blocker = taskBlockers[i] as LegacyBlocker;
        const blocker_id = mint('blk_', `${taskKey}|blocker:${i}`);
        records.blockers.push({
          blocker_id,
          task_id,
          description: blocker.description ?? '',
          raised_by: UNKNOWN_ACTOR,
          raised_at: null,
        });
        report.mapping.push({
          legacy_id: `blocker:${blocker.description ?? task.id}`,
          canonical_id: blocker_id,
          record_type: 'blocker',
        });
      }

      const taskDecisions = task.decisions ?? [];
      for (let i = 0; i < taskDecisions.length; i++) {
        const decision = taskDecisions[i] as LegacyDecision;
        const migrated = migratedDecision(
          mint('dec_', `${taskKey}|decision:${i}`),
          task_id,
          'execution_choice',
          decision.summary ?? '',
          decision.rationale ?? '',
        );
        records.decisions.push(migrated);
        report.mapping.push({
          legacy_id: `decision:${decision.summary ?? task.id}`,
          canonical_id: migrated.decision_id,
          record_type: 'decision',
        });
        // Ambiguous scope → migration diagnostic (never silently resolved).
        report.diagnostics.push(
          `task '${task.id}': legacy decision scope is ambiguous and was defaulted to the task subject`,
        );
      }
    }
  }

  return { records, report };
}

/* ------------------------------------------------------------------ */
/* Canonical snapshot assembly                                          */
/* ------------------------------------------------------------------ */

export interface AssembleOptions {
  revision?: number;
  included_through?: number;
}

/**
 * Assemble the migrated records into a canonical `Snapshot`. Revision and
 * `included_through` are ledger-owned concurrency/position markers and default
 * to 0; the caller (Store) assigns the authoritative revision when persisting.
 */
export function assembleMigratedSnapshot(
  records: MigratedRecords,
  options: AssembleOptions = {},
): Snapshot {
  const project = records.projects[0];
  if (!project) {
    throw new Error('check_error: migration produced no Project record');
  }
  // Every top-level collection is a registered `set` array keyed by record id
  // (contract/canonicalization.json). The producer emits them canonical; the validator
  // rejects — rather than silently normalizes — anything that arrives otherwise.
  const byId = <T>(items: T[], key: keyof T): T[] =>
    [...items].sort((a, b) => compareByCodeUnit(a[key] as unknown as string, b[key] as unknown as string));
  return {
    schema_version: '1.0.0',
    revision: options.revision ?? 0,
    included_through: options.included_through ?? 0,
    project,
    repositories: [],
    workspaces: [],
    topics: byId(records.topics, 'topic_id'),
    tasks: byId(records.tasks, 'task_id'),
    declarations: [],
    attempts: [],
    attempt_ends: [],
    claims: [],
    evidence: byId(records.evidence, 'evidence_id'),
    reconciliations: [],
    check_invocations: [],
    check_results: [],
    verdicts: [],
    settlements: [],
    blockers: byId(records.blockers, 'blocker_id'),
    blocker_resolutions: [],
    decisions: byId(records.decisions, 'decision_id'),
  };
}

/* ------------------------------------------------------------------ */
/* done-or-not status → canonical mapping (docs/migration.md §3)        */
/* ------------------------------------------------------------------ */

export type AuthenticityStatus =
  | 'Not audited'
  | 'Preliminary'
  | 'Partial'
  | 'Mostly real'
  | 'Real'
  | 'Non-operational'
  | 'Fake'
  | 'Drifted';

export type PresenceStatus = 'Claimed' | 'Observed' | 'Inferred' | 'Confirmed';

export interface AuthenticityMapping {
  /** Whether a Verdict is emitted at all. */
  emits_verdict: boolean;
  conclusion?: VerdictConclusion;
  finality?: 'preliminary' | 'final';
  finding?: FindingCode;
  /** The mapping is contextual, not a context-free enum lookup. */
  note: string;
}

/**
 * Authenticity status → canonical treatment (always in Claim context).
 * The Claim's wording matters; these are documented defaults, not a lookup
 * that may override the checker's own semantic judgment.
 */
export const AUTHENTICITY_MAP: Record<AuthenticityStatus, AuthenticityMapping> = {
  'Not audited': { emits_verdict: false, note: 'No Verdict.' },
  Preliminary: {
    emits_verdict: true,
    finality: 'preliminary',
    note: 'finality: preliminary; does not determine conclusion.',
  },
  Partial: {
    emits_verdict: true,
    conclusion: 'partially_supported',
    note: 'Usually partially_supported.',
  },
  'Mostly real': {
    emits_verdict: true,
    conclusion: 'partially_supported',
    note: 'Usually partially_supported.',
  },
  Real: { emits_verdict: true, conclusion: 'supported', note: 'Usually supported.' },
  'Non-operational': {
    emits_verdict: true,
    finding: 'non_operational',
    note: 'Claim-dependent; finding non_operational.',
  },
  Fake: {
    emits_verdict: true,
    conclusion: 'contradicted',
    note: 'Usually contradicted; preserve native value.',
  },
  Drifted: {
    emits_verdict: true,
    conclusion: 'partially_supported',
    finding: 'drift',
    note: 'Usually partially_supported or contradicted; finding drift.',
  },
};

export interface PresenceMapping {
  treatment: 'claim' | 'evidence' | 'judgment' | 'supported';
  note: string;
}

/**
 * Presence status → canonical treatment. `Observed` grounds a Claim in
 * Evidence/Reconciliation but does not by itself produce a Verdict.
 */
export const PRESENCE_MAP: Record<PresenceStatus, PresenceMapping> = {
  Claimed: { treatment: 'claim', note: 'Existence of a Claim, not a Reconciliation.' },
  Observed: {
    treatment: 'evidence',
    note: 'Grounded in Evidence/Reconciliation; does not automatically produce a Verdict.',
  },
  Inferred: {
    treatment: 'judgment',
    note: 'A semantic judgment in Verdict reasoning, with explicit uncertainty.',
  },
  Confirmed: {
    treatment: 'supported',
    note: 'Maps to supported only when the declared criteria and scope justify it.',
  },
};

export function mapAuthenticity(status: AuthenticityStatus): AuthenticityMapping {
  return AUTHENTICITY_MAP[status];
}

export function mapPresence(status: PresenceStatus): PresenceMapping {
  return PRESENCE_MAP[status];
}
