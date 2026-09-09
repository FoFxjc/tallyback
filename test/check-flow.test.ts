/**
 * The Check flow against a real, persisted Store.
 *
 * The defect this suite pins down: `runCheck` began the invocation and assembled a bundle
 * but never recorded it, so a "complete" run left the ledger holding a `chk_` with no
 * `ckr_` and told the caller nothing about it.
 *
 * These tests drive the flow through the actual ledger rather than a fake store, so what
 * is asserted is what ends up in `state.json`.
 */

import { describe, expect, it } from 'vitest';

import {
  CHECK_GATE_CODES,
  produceCheckOutput,
  runCheck,
  type Checker,
  type CheckerInput,
} from '../src/check/flow.js';
import { Store } from '../src/ledger/index.js';
import { newId, snapshotDigest } from '../src/ledger/snapshot.js';
import type { Evidence, Reconciliation, Verdict } from '../src/contract/index.js';
import { buildLedger, type LedgerFixture } from './helpers/ledger.js';

const CHECKER = { id: 'done-or-not', version: '1' } as const;

function reconciliation(fixture: LedgerFixture): Reconciliation {
  return {
    reconciliation_id: newId('rec_'),
    evidence_id: fixture.evidence_id,
    checked_by: { kind: 'tool', id: 'tallyback-check' },
    checked_at: new Date().toISOString(),
    method: { name: 'git-object-inspection', version: '1' },
    observed_context: {
      repository_id: fixture.repository_id,
      workspace_id: fixture.workspace_id,
      working_tree: 'clean',
    },
    checks: [{ predicate: 'git.object.exists', outcome: 'confirmed' }],
    limitations: [],
  };
}

function producedEvidence(): Evidence {
  return {
    evidence_id: newId('evi_'),
    kind: 'observation',
    submitted_by: { kind: 'tool', id: 'tallyback-check' },
    submitted_at: new Date().toISOString(),
    payload: { text: 'the checker observed the tree' },
  };
}

function verdict(fixture: LedgerFixture, rec: Reconciliation, evi: Evidence): Verdict {
  return {
    verdict_id: newId('ver_'),
    subject: { kind: 'claim', id: fixture.claim_id },
    declaration_id: fixture.declaration_id,
    scope: { evaluated_criteria: [fixture.criterion_id], unevaluated_criteria: [] },
    conclusion: 'supported',
    finality: 'final',
    basis: {
      evidence_ids: [evi.evidence_id],
      reconciliation_ids: [rec.reconciliation_id],
    },
    findings: [
      {
        criterion_id: fixture.criterion_id,
        assessment: 'supported',
        summary: 'The declared criterion is satisfied.',
        basis_refs: [evi.evidence_id, rec.reconciliation_id].sort(),
      },
    ],
    confidence: { level: 'high', rationale: 'the observation is confirmed' },
    rationale: 'The criterion is satisfied by confirmed evidence.',
    uncertainty: [],
    limitations: [],
    issued_by: { kind: 'tool', id: 'tallyback-check' },
    issued_at: new Date().toISOString(),
    checker: CHECKER,
  };
}

/** The §10 semantic snapshot digest, which the ledger (not the generic digest) owns. */
const digestFn = snapshotDigest;

async function persisted(root: string): Promise<Store> {
  return Store.open(root);
}

describe('runCheck records both records', () => {
  it('persists chk_ and ckr_ on the verdict-emitted path', async () => {
    const fixture = await buildLedger('tallyback-check-');
    const rec = reconciliation(fixture);
    const evi = producedEvidence();
    const ver = verdict(fixture, rec, evi);

    const checkerFn: Checker = () => ({
      kind: 'verdict',
      verdict: ver,
      reconciliations: [rec],
      evidence: [evi],
    });

    const outcome = await runCheck({
      subject: { kind: 'claim', id: fixture.claim_id },
      checker: CHECKER,
      checkerFn,
      store: fixture.store,
      resolution: {} as never,
      digestFn,
    });

    expect(outcome.outcome).toBe('verdict_emitted');
    expect(outcome.recorded).toBe(true);
    expect(outcome.recording.ok).toBe(true);

    // The assertion that matters: both records are in the PERSISTED ledger.
    const reopened = await persisted(fixture.root);
    expect(
      reopened.currentSnapshot().check_invocations.map((c) => c.check_invocation_id),
    ).toContain(outcome.invocation.check_invocation_id);
    expect(reopened.currentSnapshot().check_results.map((c) => c.check_result_id)).toContain(
      outcome.bundle.check_result.check_result_id,
    );
    expect(reopened.currentSnapshot().verdicts.map((v) => v.verdict_id)).toContain(ver.verdict_id);
    expect(reopened.currentSnapshot().reconciliations.map((r) => r.reconciliation_id)).toContain(
      rec.reconciliation_id,
    );
    expect(reopened.currentRevision()).toBe(outcome.revision);
    expect(reopened.validate_snapshot().ok).toBe(true);
  });

  it('persists chk_ and ckr_ on the verdict-withheld path, with no Verdict', async () => {
    const fixture = await buildLedger('tallyback-check-');
    const rec = reconciliation(fixture);

    const checkerFn: Checker = () => ({
      kind: 'withheld',
      code: CHECK_GATE_CODES.DECLARATION_SEMANTICS_MISSING,
      reason: 'no usable acceptance semantics were available',
      reconciliations: [rec],
      evidence: [],
    });

    const outcome = await runCheck({
      subject: { kind: 'claim', id: fixture.claim_id },
      checker: CHECKER,
      checkerFn,
      store: fixture.store,
      resolution: {} as never,
      digestFn,
    });

    // Withheld is a meaningful model state, not an error: it records, and records no Verdict.
    expect(outcome.outcome).toBe('verdict_withheld');
    expect(outcome.recorded).toBe(true);
    expect(outcome.bundle.verdict).toBeNull();

    const reopened = await persisted(fixture.root);
    const snapshot = reopened.currentSnapshot();
    expect(snapshot.check_invocations).toHaveLength(1);
    expect(snapshot.check_results).toHaveLength(1);
    expect(snapshot.check_results[0]!.outcome).toBe('verdict_withheld');
    expect(snapshot.check_results[0]!.verdict_id).toBeNull();
    expect(snapshot.check_results[0]!.diagnostics?.[0]?.code).toBe(
      CHECK_GATE_CODES.DECLARATION_SEMANTICS_MISSING,
    );
    expect(snapshot.verdicts).toHaveLength(0);
  });

  it('persists a checker failure as a recordable check_failed result', async () => {
    const fixture = await buildLedger('tallyback-check-');
    const checkerFn: Checker = () => ({
      kind: 'failed',
      reason: 'the checker could not complete',
      reconciliations: [],
      evidence: [],
    });

    const outcome = await runCheck({
      subject: { kind: 'claim', id: fixture.claim_id },
      checker: CHECKER,
      checkerFn,
      store: fixture.store,
      resolution: {} as never,
      digestFn,
    });

    expect(outcome.outcome).toBe('check_failed');
    expect(outcome.recorded).toBe(true);

    const snapshot = (await persisted(fixture.root)).currentSnapshot();
    expect(snapshot.check_results[0]!.outcome).toBe('check_failed');
    expect(snapshot.check_results[0]!.verdict_id).toBeNull();
    expect(snapshot.check_results[0]!.diagnostics?.[0]?.code).toBe(CHECK_GATE_CODES.CHECK_FAILED);
  });

  it('records the result after an unrelated writer advances the ledger (retry path)', async () => {
    const fixture = await buildLedger('tallyback-check-');
    const rec = reconciliation(fixture);

    // An unrelated writer commits between the invocation and the result.
    const interloper = await Store.open(fixture.root);
    const checkerFn: Checker = async (input: CheckerInput) => {
      const advanced = await interloper.createTask({
        topic_id: fixture.topic_id,
        title: 'an unrelated append during the check',
      });
      expect(advanced.ok).toBe(true);
      // The checker still sees the FROZEN evaluation input it was handed.
      expect(input.evaluated_snapshot.revision).toBeLessThan(
        advanced.ok ? advanced.revision : Number.MAX_SAFE_INTEGER,
      );
      return {
        kind: 'withheld',
        code: CHECK_GATE_CODES.CHECKER_SEMANTICS_MISSING,
        reason: 'no checker installed',
        reconciliations: [rec],
        evidence: [],
      };
    };

    const outcome = await runCheck({
      subject: { kind: 'claim', id: fixture.claim_id },
      checker: CHECKER,
      checkerFn,
      store: fixture.store,
      resolution: {} as never,
      digestFn,
    });

    expect(outcome.recorded).toBe(true);
    // SPEC §8.1: the frozen evaluated snapshot is NOT rewritten by the retry.
    expect(outcome.invocation.evaluated_snapshot.revision).toBeLessThan(outcome.revision);
    expect(outcome.bundle.check_result.check_invocation_id).toBe(
      outcome.invocation.check_invocation_id,
    );

    const snapshot = (await persisted(fixture.root)).currentSnapshot();
    expect(snapshot.check_invocations).toHaveLength(1);
    expect(snapshot.check_results).toHaveLength(1);
    expect(snapshot.check_invocations[0]!.evaluated_snapshot.revision).toBe(
      outcome.invocation.evaluated_snapshot.revision,
    );
  });

  it('produceCheckOutput leaves the documented "invoked, no result" state', async () => {
    const fixture = await buildLedger('tallyback-check-');
    const checkerFn: Checker = () => ({
      kind: 'failed',
      reason: 'crashed',
      reconciliations: [],
      evidence: [],
    });

    const produced = await produceCheckOutput({
      subject: { kind: 'claim', id: fixture.claim_id },
      checker: CHECKER,
      checkerFn,
      store: fixture.store,
      resolution: {} as never,
      digestFn,
    });

    const snapshot = (await persisted(fixture.root)).currentSnapshot();
    expect(snapshot.check_invocations.map((c) => c.check_invocation_id)).toContain(
      produced.invocation.check_invocation_id,
    );
    expect(snapshot.check_results).toHaveLength(0);
  });
});

describe('Store.recordCheckResult (structured host input)', () => {
  it('assembles and records a withheld result from structured inputs', async () => {
    const fixture = await buildLedger('tallyback-check-');
    const begun = await fixture.store.beginCheckFor({
      claim_id: fixture.claim_id,
      checker: CHECKER,
    });
    expect(begun.ok).toBe(true);
    if (!begun.ok) return;

    const rec = reconciliation(fixture);
    const outcome = await fixture.store.recordCheckResult({
      check_invocation_id: begun.invocation.check_invocation_id,
      outcome: 'verdict_withheld',
      diagnostics: [
        { code: CHECK_GATE_CODES.CHECKER_SEMANTICS_MISSING, message: 'no checker installed' },
      ],
      reconciliations: [rec],
    });

    expect(outcome.ok).toBe(true);
    const snapshot = (await persisted(fixture.root)).currentSnapshot();
    expect(snapshot.check_results).toHaveLength(1);
    expect(snapshot.check_results[0]!.reconciliation_ids).toEqual([rec.reconciliation_id]);
  });

  it('rejects a malformed result rather than recording it', async () => {
    const fixture = await buildLedger('tallyback-check-');
    const begun = await fixture.store.beginCheckFor({
      claim_id: fixture.claim_id,
      checker: CHECKER,
    });
    expect(begun.ok).toBe(true);
    if (!begun.ok) return;

    // `verdict_emitted` with no Verdict: the exact malformed CheckResult the review names.
    const outcome = await fixture.store.recordCheckResult({
      check_invocation_id: begun.invocation.check_invocation_id,
      outcome: 'verdict_emitted',
      verdict: null,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('invariant.check_result_outcome_mismatch');
    expect((await persisted(fixture.root)).currentSnapshot().check_results).toHaveLength(0);
  });

  it('refuses to begin a check against a claim that is not in the ledger', async () => {
    const fixture = await buildLedger('tallyback-check-');
    const outcome = await fixture.store.beginCheckFor({
      claim_id: 'clm_0190b1c0-0000-7000-8000-000000000099',
      checker: CHECKER,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('invariant.reference_unresolved');
  });
});
