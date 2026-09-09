/**
 * Regressions for correctness findings from a second code-review round.
 *
 * Each test failed against the code as reviewed and passes against the fix. They live in
 * one file so this round's findings stay individually traceable, mirroring
 * review-regressions.test.ts's convention.
 */

import { describe, expect, it } from 'vitest';

import { ALICE, buildLedger } from './helpers/ledger.js';

describe('finding 1 — a same-operation end+redispatch to one workspace is not a workspace conflict', () => {
  it('accepts ending attempt A and dispatching attempt B to the same workspace in one append', async () => {
    const fixture = await buildLedger('tallyback-rr2a-');

    // fixture.attempt_id already owns fixture.workspace_id (via buildLedger's dispatch).
    // Appending its AttemptEnd and a brand-new Attempt to the SAME workspace in one batch
    // must succeed: A is ending in this very operation, so B taking over the workspace is
    // not a real conflict.
    const revision = fixture.store.currentRevision();
    const result = await fixture.store.append({
      kind: 'append_records',
      expected_revision: revision,
      records: [
        {
          attempt_end_id: 'ate_0190b1c0-0000-7000-8000-000000000099',
          attempt_id: fixture.attempt_id,
          outcome: 'returned',
          reported_by: ALICE,
          ended_at: null,
        },
        {
          attempt_id: 'att_0190b1c0-0000-7000-8000-000000000099',
          task_id: fixture.task_id,
          declaration_id: fixture.declaration_id,
          repository_id: fixture.repository_id,
          workspace_id: fixture.workspace_id,
          executor: { kind: 'executor', id: 'agent-8' },
          dispatched_by: ALICE,
          dispatched_at: null,
        },
      ],
      provenance: { submitted_by: { kind: 'tool', id: 'tallyback' } },
    });

    expect(result.ok).toBe(true);
  });
});

describe('finding 2 — the settlement basis matrix forbids verification_exception on retry/abandon', () => {
  it('rejects a retry Settlement that cites a verification_exception with no verdict', async () => {
    const fixture = await buildLedger('tallyback-rr2b-');

    const outcome = await fixture.store.settle({
      task_id: fixture.task_id,
      attempt_id: fixture.attempt_id,
      decision: 'retry',
      decided_by: ALICE,
      basis: { verdict_id: null, attempt_end_id: null, blocker_ids: [] },
      verification_exception: 'not applicable to retry',
      rationale: 'r',
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('invariant.settlement_basis_matrix');
  });

  it('still accepts a retry Settlement citing neither a verdict nor an exception', async () => {
    const fixture = await buildLedger('tallyback-rr2b-');

    const outcome = await fixture.store.settle({
      task_id: fixture.task_id,
      attempt_id: fixture.attempt_id,
      decision: 'retry',
      decided_by: ALICE,
      basis: { verdict_id: null, attempt_end_id: null, blocker_ids: [] },
      rationale: 'try again',
    });

    expect(outcome.ok).toBe(true);
  });
});

describe('finding 3 — begin-check rejects an empty checker id/version', () => {
  it('rejects rather than recording a CheckInvocation with an empty checker id', async () => {
    const fixture = await buildLedger('tallyback-rr2c-');

    const outcome = await fixture.store.beginCheckFor({
      claim_id: fixture.claim_id,
      checker: { id: '', version: '1' },
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('check_error');
  });

  it('rejects an empty checker version the same way', async () => {
    const fixture = await buildLedger('tallyback-rr2c-');

    const outcome = await fixture.store.beginCheckFor({
      claim_id: fixture.claim_id,
      checker: { id: 'done-or-not', version: '' },
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('check_error');
  });

  it('still accepts a well-formed checker id/version', async () => {
    const fixture = await buildLedger('tallyback-rr2c-');

    const outcome = await fixture.store.beginCheckFor({
      claim_id: fixture.claim_id,
      checker: { id: 'done-or-not', version: '1' },
    });

    expect(outcome.ok).toBe(true);
  });
});
