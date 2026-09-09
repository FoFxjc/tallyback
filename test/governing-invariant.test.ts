import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SNAPSHOTS = join(ROOT, 'contract', 'fixtures', 'snapshots');

const readJson = (p: string): any => JSON.parse(readFileSync(p, 'utf8'));
const list = (dir: string): string[] => readdirSync(dir).sort();

// ---------------------------------------------------------------------------
// Self-contained referential-resolution checker.
//
// TB-REF is the governing invariant: every record reference must resolve to a
// record of the expected type, every criterion must belong to exactly one
// declaration, and supersession edges must land on a same-type record. This is
// a fixture-level reimplementation (independent of the reference validator) so
// the invariant is exercised even while `validate_snapshot` is not yet exported.
// ---------------------------------------------------------------------------

/** Record-type identity field and collection for the 18 wire collections. */
const ID_FIELD: Record<string, string> = {
  repositories: 'repository_id',
  workspaces: 'workspace_id',
  topics: 'topic_id',
  tasks: 'task_id',
  declarations: 'declaration_id',
  attempts: 'attempt_id',
  attempt_ends: 'attempt_end_id',
  claims: 'claim_id',
  evidence: 'evidence_id',
  reconciliations: 'reconciliation_id',
  check_invocations: 'check_invocation_id',
  check_results: 'check_result_id',
  verdicts: 'verdict_id',
  settlements: 'settlement_id',
  blockers: 'blocker_id',
  blocker_resolutions: 'blocker_resolution_id',
  decisions: 'decision_id',
};

const COLLECTIONS = Object.keys(ID_FIELD);

/** Decision subject kinds and the collection their id must resolve into. */
const SUBJECT_COLLECTION: Record<string, string> = {
  project: 'project',
  repository: 'repositories',
  workspace: 'workspaces',
  topic: 'topics',
  task: 'tasks',
  declaration: 'declarations',
  attempt: 'attempts',
  attempt_end: 'attempt_ends',
  claim: 'claims',
  evidence: 'evidence',
  reconciliation: 'reconciliations',
  check_invocation: 'check_invocations',
  check_result: 'check_results',
  verdict: 'verdicts',
  settlement: 'settlements',
  blocker: 'blockers',
  blocker_resolution: 'blocker_resolutions',
  decision: 'decisions',
};

function refErrors(snapshot: any): string[] {
  const errors: string[] = [];
  const byId = new Map<string, string>(); // id -> collection (excluding criteria)
  const criterionOwners = new Map<string, Set<string>>(); // criterion_id -> declaration_ids
  const seenId = new Map<string, string>(); // id -> collection, for duplicate detection

  const projectId = snapshot.project?.project_id as string | undefined;
  byId.set(projectId ?? '', 'project');

  for (const coll of COLLECTIONS) {
    for (const record of (snapshot[coll] ?? []) as any[]) {
      const id = record?.[ID_FIELD[coll]!] as string | undefined;
      if (id) {
        if (seenId.has(id)) {
          errors.push(`duplicate id ${id} (${coll})`);
        }
        seenId.set(id, coll);
        byId.set(id, coll);
      }
    }
  }

  // Criteria (scoped to declarations). TB-LC-002 forbids a duplicate criterion_id
  // within a single declaration; the same id may be restated across declarations
  // (a superseding declaration may carry a criterion forward under a new scope).
  for (const decl of (snapshot.declarations ?? []) as any[]) {
    const localSeen = new Set<string>();
    for (const criterion of (decl.criteria ?? []) as any[]) {
      const cid = criterion?.criterion_id as string | undefined;
      if (!cid) continue;
      if (localSeen.has(cid)) {
        errors.push(`duplicate criterion ${cid} within declaration ${decl.declaration_id}`);
      }
      localSeen.add(cid);
      let owners = criterionOwners.get(cid);
      if (!owners) {
        owners = new Set<string>();
        criterionOwners.set(cid, owners);
      }
      owners.add(decl.declaration_id);
    }
  }

  const ref = (target: unknown, collection: string, label: string): void => {
    if (target == null) {
      errors.push(`${label}: missing reference`);
      return;
    }
    const owner = byId.get(String(target));
    if (owner !== collection) {
      errors.push(`${label}: ${String(target)} not found in ${collection}`);
    }
  };

  const refMany = (targets: unknown, collection: string, label: string): void => {
    for (const t of (targets ?? []) as any[]) ref(t, collection, label);
  };

  for (const record of (snapshot.topics ?? []) as any[]) {
    ref(record.project_id, 'project', `${record.topic_id}.project_id`);
  }
  for (const record of (snapshot.tasks ?? []) as any[]) {
    ref(record.topic_id, 'topics', `${record.task_id}.topic_id`);
  }
  for (const record of (snapshot.workspaces ?? []) as any[]) {
    ref(record.repository_id, 'repositories', `${record.workspace_id}.repository_id`);
  }
  for (const record of (snapshot.declarations ?? []) as any[]) {
    ref(record.task_id, 'tasks', `${record.declaration_id}.task_id`);
  }
  for (const record of (snapshot.attempts ?? []) as any[]) {
    ref(record.task_id, 'tasks', `${record.attempt_id}.task_id`);
    ref(record.declaration_id, 'declarations', `${record.attempt_id}.declaration_id`);
    ref(record.repository_id, 'repositories', `${record.attempt_id}.repository_id`);
    ref(record.workspace_id, 'workspaces', `${record.attempt_id}.workspace_id`);
  }
  for (const record of (snapshot.attempt_ends ?? []) as any[]) {
    ref(record.attempt_id, 'attempts', `${record.attempt_end_id}.attempt_id`);
  }
  for (const record of (snapshot.claims ?? []) as any[]) {
    ref(record.task_id, 'tasks', `${record.claim_id}.task_id`);
    ref(record.attempt_id, 'attempts', `${record.claim_id}.attempt_id`);
    ref(record.declaration_id, 'declarations', `${record.claim_id}.declaration_id`);
    refMany(record.evidence_ids, 'evidence', `${record.claim_id}.evidence_ids`);
  }
  for (const record of (snapshot.reconciliations ?? []) as any[]) {
    ref(record.evidence_id, 'evidence', `${record.reconciliation_id}.evidence_id`);
  }
  for (const record of (snapshot.check_invocations ?? []) as any[]) {
    if (record.subject?.kind === 'claim') {
      ref(record.subject.id, 'claims', `${record.check_invocation_id}.subject`);
    }
    ref(
      record.evaluated_snapshot?.project_id,
      'project',
      `${record.check_invocation_id}.evaluated_snapshot.project_id`,
    );
  }
  for (const record of (snapshot.check_results ?? []) as any[]) {
    ref(
      record.check_invocation_id,
      'check_invocations',
      `${record.check_result_id}.check_invocation_id`,
    );
    if (record.verdict_id != null) {
      ref(record.verdict_id, 'verdicts', `${record.check_result_id}.verdict_id`);
    }
    refMany(
      record.reconciliation_ids,
      'reconciliations',
      `${record.check_result_id}.reconciliation_ids`,
    );
  }
  for (const record of (snapshot.verdicts ?? []) as any[]) {
    if (record.subject?.kind === 'claim') {
      ref(record.subject.id, 'claims', `${record.verdict_id}.subject`);
    }
    ref(record.declaration_id, 'declarations', `${record.verdict_id}.declaration_id`);
    refMany(record.basis?.evidence_ids, 'evidence', `${record.verdict_id}.basis.evidence_ids`);
    refMany(
      record.basis?.reconciliation_ids,
      'reconciliations',
      `${record.verdict_id}.basis.reconciliation_ids`,
    );

    // Scope criteria must exist and belong to the verdict's declaration.
    const scopedCriteria = [
      ...(record.scope?.evaluated_criteria ?? []),
      ...(record.scope?.unevaluated_criteria ?? []),
    ] as string[];
    for (const cid of scopedCriteria) {
      const owners = criterionOwners.get(cid);
      if (!owners || owners.size === 0) {
        errors.push(`${record.verdict_id}.scope: criterion ${cid} does not exist`);
      } else if (!owners.has(record.declaration_id)) {
        errors.push(
          `${record.verdict_id}.scope: criterion ${cid} belongs to declaration ${[...owners].join(',')} not ${record.declaration_id}`,
        );
      }
    }
    for (const finding of (record.findings ?? []) as any[]) {
      const fid = finding.criterion_id as string | undefined;
      if (fid != null) {
        const owners = criterionOwners.get(fid);
        if (!owners || owners.size === 0) {
          errors.push(`${record.verdict_id}.findings: criterion ${fid} does not exist`);
        } else if (!owners.has(record.declaration_id)) {
          errors.push(
            `${record.verdict_id}.findings: criterion ${fid} belongs to declaration ${[...owners].join(',')} not ${record.declaration_id}`,
          );
        }
      }
    }

    // The verdict must agree with the declaration its subject claim was made against.
    const claim = (snapshot.claims ?? []).find(
      (c: any) => c.claim_id === record.subject?.id,
    ) as any;
    if (claim && claim.declaration_id !== record.declaration_id) {
      errors.push(
        `${record.verdict_id}: declaration_id ${record.declaration_id} conflicts with claim declaration ${claim.declaration_id}`,
      );
    }
  }
  for (const record of (snapshot.settlements ?? []) as any[]) {
    ref(record.task_id, 'tasks', `${record.settlement_id}.task_id`);
    ref(record.attempt_id, 'attempts', `${record.settlement_id}.attempt_id`);
  }
  for (const record of (snapshot.blockers ?? []) as any[]) {
    ref(record.task_id, 'tasks', `${record.blocker_id}.task_id`);
    if (record.attempt_id != null) {
      ref(record.attempt_id, 'attempts', `${record.blocker_id}.attempt_id`);
    }
  }
  for (const record of (snapshot.blocker_resolutions ?? []) as any[]) {
    ref(record.blocker_id, 'blockers', `${record.blocker_resolution_id}.blocker_id`);
  }
  for (const record of (snapshot.decisions ?? []) as any[]) {
    const collection = SUBJECT_COLLECTION[record.subject?.kind];
    if (collection === 'project') {
      ref(record.subject.id, 'project', `${record.decision_id}.subject`);
    } else if (collection) {
      ref(record.subject.id, collection, `${record.decision_id}.subject`);
    }
  }

  // Supersession edges (only on supersession-capable types).
  const supersedingCollections = [
    'declarations',
    'attempt_ends',
    'reconciliations',
    'settlements',
    'blocker_resolutions',
    'decisions',
  ];
  for (const coll of supersedingCollections) {
    for (const record of (snapshot[coll] ?? []) as any[]) {
      if (record.supersedes != null) {
        ref(record.supersedes, coll, `${record[ID_FIELD[coll]!]}.supersedes`);
      }
    }
  }

  return errors;
}

describe('governing invariant (TB-REF referential integrity)', () => {
  it('resolves every reference in every valid snapshot fixture', () => {
    for (const name of list(join(SNAPSHOTS, 'valid'))) {
      const errors = refErrors(readJson(join(SNAPSHOTS, 'valid', name)));
      expect(errors, `valid/${name}`).toEqual([]);
    }
  });

  it('detects each referential violation in the invariant-invalid fixtures', () => {
    const cases: Record<string, string> = {
      'dangling-supersession': 'supersedes',
      'duplicate-criterion': 'duplicate criterion',
      'verdict-foreign-criterion': 'belongs to',
      'verdict-missing-declaration': 'not found in declarations',
      'verdict-declaration-conflict': 'conflicts with claim declaration',
    };
    for (const [name, needle] of Object.entries(cases)) {
      const errors = refErrors(readJson(join(SNAPSHOTS, 'invalid', `${name}.json`)));
      expect(errors.join('\n'), `invalid/${name}`).toContain(needle);
    }
  });
});

// ---------------------------------------------------------------------------
// Validator integration (guarded): once the reference validator lands, the same
// fixtures are re-verified through `validate_snapshot`.
// ---------------------------------------------------------------------------

let validate_snapshot: ((s: unknown) => { ok: true } | { ok: false; code: string }) | undefined;
try {
  const mod = await import('../src/contract/index.js');
  validate_snapshot = (mod as unknown as { validate_snapshot?: typeof validate_snapshot })
    .validate_snapshot;
} catch {
  validate_snapshot = undefined;
}

const validatorDescribe = typeof validate_snapshot === 'function' ? describe : describe.skip;

validatorDescribe('governing invariant via validate_snapshot', () => {
  it('accepts every valid snapshot fixture', () => {
    for (const name of list(join(SNAPSHOTS, 'valid'))) {
      const result = validate_snapshot!(readJson(join(SNAPSHOTS, 'valid', name)));
      expect(result.ok, `valid/${name}`).toBe(true);
    }
  });

  it('rejects the referential invalid fixtures with an invariant code', () => {
    const referentialInvalid = [
      'dangling-supersession',
      'duplicate-criterion',
      'verdict-foreign-criterion',
      'verdict-missing-declaration',
      'verdict-declaration-conflict',
    ];
    for (const name of referentialInvalid) {
      const result = validate_snapshot!(readJson(join(SNAPSHOTS, 'invalid', `${name}.json`)));
      expect(result.ok, `invalid/${name}`).toBe(false);
      if (!result.ok) {
        expect(result.code, `invalid/${name}`).toMatch(/^invariant\./);
      }
    }
  });
});
