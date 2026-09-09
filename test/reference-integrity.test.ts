/**
 * Complete, typed reference integrity — and criterion identity across declaration
 * revisions.
 *
 * Two defects are pinned down here.
 *
 * 1. **Criterion identity.** Criteria were indexed through a single global
 *    `criterion_id → declaration_id` map, so whichever declaration was indexed last
 *    "owned" a criterion. SPEC §5.4 says the immutable definition is the pair
 *    `(declaration_id, criterion_id)`, and that a criterion may deliberately retain its
 *    id across a superseding declaration when it is the same conceptual requirement.
 *    Under the old map, publishing that superseding declaration retroactively invalidated
 *    every historical Verdict against the old one.
 *
 * 2. **Partial reference coverage.** Only a handful of references were checked, and those
 *    only for existence. A reference declares the lineage it points at; resolving to an
 *    entity of another type — or to an entity whose own anchors contradict the referring
 *    record — is not made valid by the ID happening to exist.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { validate_snapshot } from '../src/contract/index.js';
import type { Snapshot } from '../src/contract/index.js';

const FIXTURES = join('contract', 'fixtures', 'snapshots');

function load(kind: 'valid' | 'invalid', name: string): Snapshot {
  return JSON.parse(readFileSync(join(FIXTURES, kind, `${name}.json`), 'utf8')) as Snapshot;
}

/** Mutate a deep clone of a fixture, so each case starts from a known-valid graph. */
function mutate(name: string, patch: (s: Snapshot) => void): Snapshot {
  const snapshot = structuredClone(load('valid', name));
  patch(snapshot);
  return snapshot;
}

const U = (n: number, p: string) => `${p}0190b1c0-0000-7000-8000-${String(n).padStart(12, '0')}`;

describe('criterion identity resolves through (declaration_id, criterion_id)', () => {
  it('keeps an old Verdict valid when a superseding declaration retains the criterion id', () => {
    const snapshot = load('valid', 'superseding-declaration-retains-criterion');

    // Two declarations, the newer superseding the older, both defining cri_…0001.
    expect(snapshot.declarations).toHaveLength(2);
    const [older, newer] = [...snapshot.declarations].sort((a, b) =>
      a.declaration_id < b.declaration_id ? -1 : 1,
    );
    expect(newer!.supersedes).toBe(older!.declaration_id);
    expect(older!.criteria[0]!.criterion_id).toBe(newer!.criteria[0]!.criterion_id);
    // The statement was clarified: same conceptual requirement, new wording.
    expect(older!.criteria[0]!.statement).not.toBe(newer!.criteria[0]!.statement);

    // The historical Verdict names the OLD declaration, and stays valid.
    const verdict = snapshot.verdicts[0]!;
    expect(verdict.declaration_id).toBe(older!.declaration_id);
    expect(validate_snapshot(snapshot).ok).toBe(true);
  });

  it('still rejects a criterion that belongs only to another declaration', () => {
    const result = validate_snapshot(load('invalid', 'verdict-foreign-criterion'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invariant.verdict_foreign_criterion');
  });

  it('rejects a Verdict citing a criterion the superseding declaration dropped', () => {
    // The newer declaration replaces the requirement with a materially different one, so
    // the new criterion id is genuinely foreign to the old declaration a Verdict names.
    const snapshot = mutate('superseding-declaration-retains-criterion', (s) => {
      const newer = s.declarations.find((d) => d.supersedes !== undefined)!;
      newer.criteria = [
        {
          criterion_id: U(2, 'cri_'),
          code: 'materially-changed',
          statement: 'A replaced requirement gets a new criterion_id.',
          required: true,
        },
      ];
      // The Verdict now cites the NEW declaration's criterion against the OLD declaration.
      s.verdicts[0]!.scope.evaluated_criteria = [U(2, 'cri_')];
      s.verdicts[0]!.findings[0]!.criterion_id = U(2, 'cri_');
    });
    const result = validate_snapshot(snapshot);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invariant.verdict_foreign_criterion');
  });

  it('rejects a criterion that resolves nowhere at all', () => {
    const snapshot = mutate('complete-graph', (s) => {
      s.verdicts[0]!.scope.evaluated_criteria = [U(9, 'cri_')];
      s.verdicts[0]!.findings[0]!.criterion_id = U(9, 'cri_');
    });
    const result = validate_snapshot(snapshot);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invariant.verdict_scope_unresolved');
  });
});

describe('every canonical reference is checked, and checked typed', () => {
  /**
   * Each case points a reference at an id that does **not** resolve. The point of the
   * table is coverage: a reference nobody validates would quietly pass.
   */
  const unresolved: [string, (s: Snapshot) => void, string][] = [
    [
      'Project → Repository',
      (s) => {
        s.project.repositories[0]!.repository_id = U(9, 'repo_');
      },
      'invariant.reference_unresolved',
    ],
    [
      'Workspace → Repository',
      (s) => {
        s.workspaces[0]!.repository_id = U(9, 'repo_');
      },
      'invariant.reference_unresolved',
    ],
    [
      'Topic → Project',
      (s) => {
        s.topics[0]!.project_id = U(9, 'prj_');
      },
      'invariant.reference_unresolved',
    ],
    [
      'Task → Topic',
      (s) => {
        s.tasks[0]!.topic_id = U(9, 'top_');
      },
      'invariant.reference_unresolved',
    ],
    [
      'Declaration → Task',
      (s) => {
        s.declarations[0]!.task_id = U(9, 'tsk_');
      },
      'invariant.reference_unresolved',
    ],
    [
      'Attempt → Task',
      (s) => {
        s.attempts[0]!.task_id = U(9, 'tsk_');
      },
      'invariant.attempt_unresolved',
    ],
    [
      'Attempt → Workspace',
      (s) => {
        s.attempts[0]!.workspace_id = U(9, 'wsp_');
      },
      'invariant.attempt_unresolved',
    ],
    [
      'Claim → Attempt',
      (s) => {
        s.claims[0]!.attempt_id = U(9, 'att_');
      },
      'invariant.attempt_unresolved',
    ],
    [
      'Claim → Evidence',
      (s) => {
        s.claims[0]!.evidence_ids = [U(9, 'evi_')];
      },
      'invariant.attempt_unresolved',
    ],
    [
      'Evidence → Repository',
      (s) => {
        (s.evidence[0]!.payload as { repository_id: string }).repository_id = U(9, 'repo_');
      },
      'invariant.evidence_reference_unresolved',
    ],
    [
      'Reconciliation → Evidence',
      (s) => {
        s.reconciliations[0]!.evidence_id = U(9, 'evi_');
      },
      'invariant.reference_unresolved',
    ],
    [
      'Reconciliation → observed Workspace',
      (s) => {
        s.reconciliations[0]!.observed_context.workspace_id = U(9, 'wsp_');
      },
      'invariant.reference_unresolved',
    ],
    [
      'Verdict basis → Evidence',
      (s) => {
        s.verdicts[0]!.basis.evidence_ids = [U(9, 'evi_')];
      },
      'invariant.reference_unresolved',
    ],
    [
      'Verdict basis → Reconciliation',
      (s) => {
        s.verdicts[0]!.basis.reconciliation_ids = [U(9, 'rec_')];
      },
      'invariant.reference_unresolved',
    ],
    [
      'Verdict finding → basis ref',
      (s) => {
        s.verdicts[0]!.findings[0]!.basis_refs = [U(9, 'evi_')];
      },
      'invariant.reference_unresolved',
    ],
    [
      'Settlement → Task',
      (s) => {
        s.settlements[0]!.task_id = U(9, 'tsk_');
      },
      'invariant.reference_unresolved',
    ],
    [
      'Settlement → Attempt',
      (s) => {
        s.settlements[0]!.attempt_id = U(9, 'att_');
      },
      'invariant.reference_unresolved',
    ],
    [
      'Settlement basis → Verdict',
      (s) => {
        s.settlements[0]!.basis.verdict_id = U(9, 'ver_');
      },
      'invariant.settlement_basis_unresolved',
    ],
  ];

  it.each(unresolved)('rejects an unresolved %s reference', (_label, patch, code) => {
    const result = validate_snapshot(mutate('complete-graph', patch));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(code);
  });

  it('rejects a reference that resolves to an entity of the wrong type', () => {
    // The id exists — it is this graph's Topic — but a Task is not a Topic.
    const snapshot = mutate('complete-graph', (s) => {
      s.settlements[0]!.task_id = s.topics[0]!.topic_id as never;
    });
    const result = validate_snapshot(snapshot);
    expect(result.ok).toBe(false);
    // The closed schema catches the prefix first, which is itself the right answer:
    // a `top_` id can never occupy a `tsk_` field on the wire.
    if (!result.ok) expect(result.code).toMatch(/^(schema\.unknown_property|invariant\.)/);
  });

  it('checks AttemptEnd → Attempt', () => {
    const snapshot = mutate('attempt-with-end', (s) => {
      s.attempt_ends[0]!.attempt_id = U(9, 'att_');
    });
    const result = validate_snapshot(snapshot);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invariant.reference_unresolved');
  });

  it('checks Blocker → Task and BlockerResolution → Blocker/Evidence', () => {
    const badTask = validate_snapshot(
      mutate('blocker-with-resolution', (s) => {
        s.blockers[0]!.task_id = U(9, 'tsk_');
      }),
    );
    expect(badTask.ok).toBe(false);
    if (!badTask.ok) expect(badTask.code).toBe('invariant.reference_unresolved');

    const badBlocker = validate_snapshot(
      mutate('blocker-with-resolution', (s) => {
        s.blocker_resolutions[0]!.blocker_id = U(9, 'blk_');
      }),
    );
    expect(badBlocker.ok).toBe(false);
    if (!badBlocker.ok) {
      // A missing supersession/blocker target is reported by whichever rule sees it first;
      // either way the dangling reference is refused.
      expect(badBlocker.code).toMatch(/^invariant\./);
    }
  });

  it('checks Decision subject kind against the resolved record type', () => {
    const snapshot = mutate('decision-next-action', (s) => {
      for (const decision of s.decisions) {
        decision.subject = { kind: 'task', id: U(9, 'tsk_') };
      }
    });
    const result = validate_snapshot(snapshot);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invariant.decision_subject_unresolved');
  });

  it('checks CheckInvocation → Claim and evaluated Project', () => {
    const badSubject = validate_snapshot(
      mutate('verdict-withheld-checkresult', (s) => {
        s.check_invocations[0]!.subject = { kind: 'claim', id: U(9, 'clm_') };
      }),
    );
    expect(badSubject.ok).toBe(false);
    if (!badSubject.ok) expect(badSubject.code).toBe('invariant.reference_unresolved');

    const badProject = validate_snapshot(
      mutate('verdict-withheld-checkresult', (s) => {
        s.check_invocations[0]!.evaluated_snapshot.project_id = U(9, 'prj_');
      }),
    );
    expect(badProject.ok).toBe(false);
    if (!badProject.ok) expect(badProject.code).toBe('invariant.reference_unresolved');
  });

  it('rejects an invocation that claims to have evaluated a future revision', () => {
    const snapshot = mutate('verdict-withheld-checkresult', (s) => {
      s.check_invocations[0]!.evaluated_snapshot.revision = s.revision + 5;
    });
    const result = validate_snapshot(snapshot);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invariant.reference_inconsistent');
  });
});

describe('lineage consistency, not just existence', () => {
  it('rejects an Attempt whose Declaration declares another Task', () => {
    const result = validate_snapshot(load('invalid', 'claim-foreign-attempt'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invariant.reference_inconsistent');
  });

  it('rejects an Attempt whose Workspace belongs to another Repository', () => {
    const result = validate_snapshot(load('invalid', 'attempt-workspace-foreign-repository'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invariant.reference_inconsistent');
  });

  it('rejects a Project repository ref whose alias contradicts the Repository record', () => {
    const snapshot = mutate('complete-graph', (s) => {
      s.project.repositories[0]!.alias = 'renamed-in-the-project-record-only';
    });
    const result = validate_snapshot(snapshot);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invariant.reference_inconsistent');
  });

  it('rejects a Settlement settling an Attempt of a different Task', () => {
    const snapshot = mutate('complete-graph', (s) => {
      const otherTask = U(2, 'tsk_');
      s.tasks.push({ task_id: otherTask, topic_id: s.topics[0]!.topic_id, title: 'other' });
      s.tasks.sort((a, b) => (a.task_id < b.task_id ? -1 : 1));
      s.settlements[0]!.task_id = otherTask;
    });
    const result = validate_snapshot(snapshot);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invariant.reference_inconsistent');
  });

  it('rejects a Reconciliation observing a Workspace outside its observed Repository', () => {
    const snapshot = mutate('complete-graph', (s) => {
      const otherRepo = U(2, 'repo_');
      const otherWorkspace = U(2, 'wsp_');
      s.repositories.push({ repository_id: otherRepo, alias: 'docs' });
      s.project.repositories.push({ repository_id: otherRepo, alias: 'docs' });
      s.workspaces.push({ workspace_id: otherWorkspace, repository_id: otherRepo });
      s.reconciliations[0]!.observed_context.workspace_id = otherWorkspace;
    });
    const result = validate_snapshot(snapshot);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invariant.reference_inconsistent');
  });
});

describe('CheckResult bundle integrity', () => {
  it.each([
    [
      'emitted outcome with a null Verdict',
      'checkresult-emitted-null-verdict',
      'invariant.check_result_outcome_mismatch',
    ],
    [
      'withheld outcome carrying a Verdict',
      'checkresult-withheld-with-verdict',
      'invariant.check_result_outcome_mismatch',
    ],
    [
      'a missing Reconciliation',
      'checkresult-missing-reconciliation',
      'invariant.check_result_reference_unresolved',
    ],
    [
      'a foreign Verdict',
      'checkresult-foreign-verdict',
      'invariant.check_result_invocation_mismatch',
    ],
  ])('rejects %s', (_label, fixture, code) => {
    const result = validate_snapshot(load('invalid', fixture));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(code);
  });

  it('rejects a second CheckResult body for one invocation in the same snapshot', () => {
    const snapshot = mutate('verdict-withheld-checkresult', (s) => {
      const duplicate = structuredClone(s.check_results[0]!);
      duplicate.check_result_id = U(2, 'ckr_');
      s.check_results.push(duplicate);
      s.check_results.sort((a, b) => (a.check_result_id < b.check_result_id ? -1 : 1));
    });
    const result = validate_snapshot(snapshot);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invariant.check_result_already_recorded');
  });

  it('rejects a Verdict whose checker contradicts its invocation', () => {
    const snapshot = mutate('complete-graph', (s) => {
      s.check_invocations = [
        {
          check_invocation_id: U(1, 'chk_'),
          subject: { kind: 'claim', id: s.claims[0]!.claim_id },
          checker: { id: 'done-or-not', version: '1' },
          evaluated_snapshot: {
            project_id: s.project.project_id,
            revision: s.revision - 1,
            digest: { algorithm: 'sha-256', value: 'e'.repeat(64) },
          },
          invoked_by: { kind: 'tool', id: 'tallyback-check' },
          invoked_at: '2026-09-02T12:00:00Z',
        },
      ];
      s.check_results = [
        {
          check_result_id: U(1, 'ckr_'),
          check_invocation_id: U(1, 'chk_'),
          outcome: 'verdict_emitted',
          produced_by: { kind: 'tool', id: 'tallyback-check' },
          completed_at: '2026-09-02T13:30:00Z',
          diagnostics: [],
          reconciliation_ids: [s.reconciliations[0]!.reconciliation_id],
          verdict_id: s.verdicts[0]!.verdict_id,
        },
      ];
      // The Verdict names a different checker than the invocation that produced it.
      s.verdicts[0]!.checker = { id: 'some-other-checker', version: '9' };
    });
    const result = validate_snapshot(snapshot);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invariant.check_result_invocation_mismatch');
  });
});
