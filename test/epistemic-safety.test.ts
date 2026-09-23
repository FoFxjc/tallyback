/**
 * No-success-by-absence invariant: unknown / missing / preliminary / partial / unsupported
 * / contradicted must never collapse into positive verification or readiness merely
 * because contradictory evidence is absent. An explicit `verification_exception` is an
 * authorization override, not proof, and must never make `isPositiveVerification` return
 * `true`.
 *
 * This suite pins down the shared predicate (`isPositiveVerification`,
 * `src/ledger/projections.ts`) and its two consumers — `ready_to_land`
 * (`computeProjectionValues` / `src/land/report.ts`) and View's `status.verified`
 * (`src/view/report.ts`) — against the full regression matrix:
 *
 *   no verdict · claim only · reconciliation without verdict · preliminary supported ·
 *   final partially_supported · final unsupported · final contradicted ·
 *   final supported + low/medium/high confidence · unevaluated required criterion ·
 *   verification_exception with no verdict
 *
 * and proves the specific distinctions the invariant depends on:
 *
 *   absence of contradiction != support
 *   existence of a Verdict != positive verification
 *   finality != correctness
 *   Settlement != verification
 *   verification_exception != verification
 */

import { describe, expect, it } from 'vitest';

import { computeProjectionValues, isPositiveVerification } from '../src/ledger/index.js';
import { newId } from '../src/ledger/snapshot.js';
import { buildLandReport, type GitResolver } from '../src/land/report.js';
import { buildTaskViews } from '../src/view/report.js';
import type {
  Confidence,
  Finality,
  Reconciliation,
  TaskDeclaration,
  Verdict,
  VerdictConclusion,
} from '../src/contract/index.js';
import { ALICE, buildLedger, type LedgerFixture } from './helpers/ledger.js';

function unwrap<T extends object>(outcome: { ok: boolean; code?: string } & Partial<T>): T {
  if (!outcome.ok) throw new Error(`store command failed: ${String(outcome.code)}`);
  return outcome as unknown as T;
}

/** A structurally complete Verdict citing `fixture`'s claim/declaration/criterion. */
function makeVerdict(fixture: LedgerFixture, overrides: Partial<Verdict> = {}): Verdict {
  return {
    verdict_id: newId('ver_'),
    subject: { kind: 'claim', id: fixture.claim_id },
    declaration_id: fixture.declaration_id,
    scope: { evaluated_criteria: [fixture.criterion_id], unevaluated_criteria: [] },
    conclusion: 'supported',
    finality: 'final',
    basis: { evidence_ids: [fixture.evidence_id], reconciliation_ids: [] },
    findings: [
      {
        criterion_id: fixture.criterion_id,
        assessment: 'supported',
        summary: 'assessed',
        basis_refs: [fixture.evidence_id],
      },
    ],
    confidence: { level: 'high', rationale: 'r' },
    rationale: 'r',
    uncertainty: [],
    limitations: [],
    issued_by: { kind: 'tool', id: 'tallyback-check' },
    issued_at: null,
    ...overrides,
  };
}

async function appendVerdict(fixture: LedgerFixture, verdict: Verdict): Promise<void> {
  const outcome = await fixture.store.append({
    kind: 'append_records',
    expected_revision: fixture.store.currentRevision(),
    records: [verdict],
    provenance: { submitted_by: { kind: 'tool', id: 'tallyback' } },
  });
  expect(outcome.ok).toBe(true);
}

async function settleLandCitingVerdict(
  fixture: LedgerFixture,
  verdictId: string,
): Promise<boolean> {
  const outcome = await fixture.store.settle({
    task_id: fixture.task_id,
    attempt_id: fixture.attempt_id,
    decision: 'land',
    decided_by: ALICE,
    basis: { verdict_id: verdictId, attempt_end_id: null, blocker_ids: [] },
    rationale: 'citing the recorded verdict',
  });
  return outcome.ok;
}

async function settleLandWithException(fixture: LedgerFixture): Promise<boolean> {
  const outcome = await fixture.store.settle({
    task_id: fixture.task_id,
    attempt_id: fixture.attempt_id,
    decision: 'land',
    decided_by: ALICE,
    basis: { verdict_id: null, attempt_end_id: null, blocker_ids: [] },
    verification_exception: 'accepted by hand',
    rationale: 'explicit authority override',
  });
  return outcome.ok;
}

const NO_RESOLVER: GitResolver = () => ({ status: 'ready', files: [] });

describe('isPositiveVerification — the one shared predicate', () => {
  it('fails closed for no Verdict at all', () => {
    expect(isPositiveVerification(undefined)).toBe(false);
  });

  const base: Omit<Verdict, 'verdict_id' | 'finality' | 'conclusion' | 'confidence'> = {
    subject: { kind: 'claim', id: 'clm_0190b1c0-0000-7000-8000-000000000001' },
    declaration_id: 'dcl_0190b1c0-0000-7000-8000-000000000001',
    scope: { evaluated_criteria: [], unevaluated_criteria: [] },
    basis: { evidence_ids: [], reconciliation_ids: [] },
    findings: [
      {
        criterion_id: 'cri_0190b1c0-0000-7000-8000-000000000001',
        assessment: 'supported',
        summary: 's',
        basis_refs: [],
      },
    ],
    rationale: 'r',
    uncertainty: [],
    limitations: [],
    issued_by: { kind: 'tool', id: 'tallyback-check' },
    issued_at: null,
  };

  function verdict(
    finality: Finality,
    conclusion: VerdictConclusion,
    confidence: Confidence,
  ): Verdict {
    return { ...base, verdict_id: newId('ver_'), finality, conclusion, confidence };
  }

  const HIGH: Confidence = { level: 'high', rationale: 'r' };
  const MEDIUM: Confidence = { level: 'medium', rationale: 'r' };
  const LOW: Confidence = { level: 'low', rationale: 'r' };

  it.each<[string, Verdict, boolean]>([
    ['preliminary supported, high confidence', verdict('preliminary', 'supported', HIGH), false],
    [
      'final partially_supported, high confidence',
      verdict('final', 'partially_supported', HIGH),
      false,
    ],
    ['final unsupported, high confidence', verdict('final', 'unsupported', HIGH), false],
    ['final contradicted, high confidence', verdict('final', 'contradicted', HIGH), false],
    ['final supported, low confidence', verdict('final', 'supported', LOW), false],
    ['final supported, medium confidence', verdict('final', 'supported', MEDIUM), true],
    ['final supported, high confidence', verdict('final', 'supported', HIGH), true],
  ])('%s -> isPositiveVerification === %s', (_name, v, expected) => {
    expect(isPositiveVerification(v)).toBe(expected);
  });

  it('fails closed when a required Criterion is left unevaluated, even final+supported+high', () => {
    const declaration: TaskDeclaration = {
      declaration_id: 'dcl_0190b1c0-0000-7000-8000-000000000001',
      task_id: 'tsk_0190b1c0-0000-7000-8000-000000000001',
      declared_by: { kind: 'human', id: 'alice' },
      declared_at: null,
      objective: 'o',
      criteria: [
        { criterion_id: 'cri_req', code: 'req', statement: 'required thing', required: true },
        { criterion_id: 'cri_opt', code: 'opt', statement: 'optional thing', required: false },
      ],
    };
    const v: Verdict = {
      ...base,
      verdict_id: newId('ver_'),
      declaration_id: declaration.declaration_id,
      // Only the optional criterion was evaluated; the required one was not.
      scope: { evaluated_criteria: ['cri_opt'], unevaluated_criteria: ['cri_req'] },
      finality: 'final',
      conclusion: 'supported',
      confidence: HIGH,
    };
    expect(isPositiveVerification(v, declaration)).toBe(false);
  });

  it('still passes when only a NON-required Criterion is left unevaluated', () => {
    const declaration: TaskDeclaration = {
      declaration_id: 'dcl_0190b1c0-0000-7000-8000-000000000002',
      task_id: 'tsk_0190b1c0-0000-7000-8000-000000000001',
      declared_by: { kind: 'human', id: 'alice' },
      declared_at: null,
      objective: 'o',
      criteria: [
        { criterion_id: 'cri_req', code: 'req', statement: 'required thing', required: true },
        { criterion_id: 'cri_opt', code: 'opt', statement: 'optional thing', required: false },
      ],
    };
    const v: Verdict = {
      ...base,
      verdict_id: newId('ver_'),
      declaration_id: declaration.declaration_id,
      scope: { evaluated_criteria: ['cri_req'], unevaluated_criteria: ['cri_opt'] },
      finality: 'final',
      conclusion: 'supported',
      confidence: HIGH,
    };
    expect(isPositiveVerification(v, declaration)).toBe(true);
  });

  it('an explicit verification_exception never makes this predicate true — it has no verdict to evaluate', () => {
    // isPositiveVerification only ever looks at a Verdict; a Settlement's
    // verification_exception is a completely separate authorization path
    // (see isLandSettlementVerificationReady). Nothing here to call with an
    // exception — the point is structural: this function's signature never accepts one.
    expect(isPositiveVerification(undefined)).toBe(false);
  });
});

describe('computeProjectionValues / View / Land — full-loop regression matrix', () => {
  it('no verdict at all: a freshly declared task is not verified and not ready_to_land', async () => {
    const fixture = await buildLedger('tallyback-eps-a-');
    const values = computeProjectionValues(fixture.store.currentSnapshot());
    expect(values.verified[fixture.task_id] ?? []).toEqual([]);
    expect(values.verified_positive[fixture.task_id] ?? []).toEqual([]);
    expect(values.ready_to_land).not.toContain(fixture.task_id);
  });

  it('claim only, no verdict: existence of a Claim is not verification', async () => {
    // buildLedger already produces exactly this state: Declare -> Dispatch -> Claim, no Check.
    const fixture = await buildLedger('tallyback-eps-b-');
    const snapshot = fixture.store.currentSnapshot();
    expect(snapshot.claims.some((c) => c.claim_id === fixture.claim_id)).toBe(true);
    const values = computeProjectionValues(snapshot);
    expect(values.verified[fixture.task_id] ?? []).toEqual([]);
    expect(values.verified_positive[fixture.task_id] ?? []).toEqual([]);

    const [view] = buildTaskViews(snapshot, [fixture.task_id]);
    expect(view!.status.verified).toBe(false);
  });

  it('reconciliation without verdict: a Reconciliation record alone is not verification', async () => {
    const fixture = await buildLedger('tallyback-eps-c-');
    const rec: Reconciliation = {
      reconciliation_id: newId('rec_'),
      evidence_id: fixture.evidence_id,
      checked_by: { kind: 'tool', id: 'tallyback-check' },
      checked_at: null,
      method: { name: 'git-object-inspection', version: '1' },
      observed_context: {
        repository_id: fixture.repository_id,
        workspace_id: fixture.workspace_id,
      },
      checks: [{ predicate: 'git.object.exists', outcome: 'confirmed' }],
      limitations: [],
    };
    const outcome = await fixture.store.append({
      kind: 'append_records',
      expected_revision: fixture.store.currentRevision(),
      records: [rec],
      provenance: { submitted_by: { kind: 'tool', id: 'tallyback' } },
    });
    expect(outcome.ok).toBe(true);

    const snapshot = fixture.store.currentSnapshot();
    expect(
      snapshot.reconciliations.some((r) => r.reconciliation_id === rec.reconciliation_id),
    ).toBe(true);
    const values = computeProjectionValues(snapshot);
    expect(values.verified[fixture.task_id] ?? []).toEqual([]);
    expect(values.verified_positive[fixture.task_id] ?? []).toEqual([]);
  });

  const CASES: {
    name: string;
    finality: Finality;
    conclusion: VerdictConclusion;
    confidenceLevel: 'low' | 'medium' | 'high';
    expectPositive: boolean;
  }[] = [
    {
      name: 'preliminary supported',
      finality: 'preliminary',
      conclusion: 'supported',
      confidenceLevel: 'high',
      expectPositive: false,
    },
    {
      name: 'final partially_supported',
      finality: 'final',
      conclusion: 'partially_supported',
      confidenceLevel: 'high',
      expectPositive: false,
    },
    {
      name: 'final unsupported',
      finality: 'final',
      conclusion: 'unsupported',
      confidenceLevel: 'high',
      expectPositive: false,
    },
    {
      name: 'final contradicted',
      finality: 'final',
      conclusion: 'contradicted',
      confidenceLevel: 'high',
      expectPositive: false,
    },
    {
      name: 'final supported + low confidence',
      finality: 'final',
      conclusion: 'supported',
      confidenceLevel: 'low',
      expectPositive: false,
    },
    {
      name: 'final supported + medium confidence',
      finality: 'final',
      conclusion: 'supported',
      confidenceLevel: 'medium',
      expectPositive: true,
    },
    {
      name: 'final supported + high confidence',
      finality: 'final',
      conclusion: 'supported',
      confidenceLevel: 'high',
      expectPositive: true,
    },
  ];

  for (const c of CASES) {
    it(`${c.name} -> verified=${c.expectPositive}, ready_to_land=${c.expectPositive} (Settlement citing the Verdict, not an exception)`, async () => {
      const fixture = await buildLedger(`tallyback-eps-m-`);
      const v = makeVerdict(fixture, {
        finality: c.finality,
        conclusion: c.conclusion,
        confidence: { level: c.confidenceLevel, rationale: 'r' },
      });
      await appendVerdict(fixture, v);

      // Prove absence-of-contradiction != support and existence-of-Verdict != positive
      // verification independent of any Settlement at all.
      const preSettleValues = computeProjectionValues(fixture.store.currentSnapshot());
      expect(preSettleValues.verified[fixture.task_id]).toContain(v.verdict_id);
      expect(
        (preSettleValues.verified_positive[fixture.task_id] ?? []).includes(v.verdict_id),
      ).toBe(c.expectPositive);

      // Settlement authority: TB-LC-005 only requires verdict_id XOR verification_exception
      // — it does not care about the Verdict's polarity, so this settle() call must succeed
      // (Settlement authority is preserved) REGARDLESS of expectPositive.
      const settleOk = await settleLandCitingVerdict(fixture, v.verdict_id);
      expect(settleOk).toBe(true);

      const values = computeProjectionValues(fixture.store.currentSnapshot());
      expect(values.ready_to_land.includes(fixture.task_id)).toBe(c.expectPositive);

      const [view] = buildTaskViews(fixture.store.currentSnapshot(), [fixture.task_id]);
      expect(view!.status.verified).toBe(c.expectPositive);
      expect(view!.status.ready_to_land).toBe(c.expectPositive);
      // Settled is a recorded-decision fact, independent of verification polarity —
      // Settlement != verification.
      expect(view!.status.settled).toBe(true);

      if (c.finality === 'final') {
        const report = await buildLandReport(fixture.store.currentSnapshot(), NO_RESOLVER, 'main');
        const inReady = report.ready.some((cand) => cand.task_id === fixture.task_id);
        expect(inReady).toBe(c.expectPositive);
      }
    });
  }

  it('verification_exception with no Verdict: authorized (ready_to_land), but NEVER counted as verified', async () => {
    const fixture = await buildLedger('tallyback-eps-x-');
    const settleOk = await settleLandWithException(fixture);
    expect(settleOk).toBe(true);

    const snapshot = fixture.store.currentSnapshot();
    const values = computeProjectionValues(snapshot);
    // verification_exception != verification: authorized to land, but not verified.
    expect(values.ready_to_land).toContain(fixture.task_id);
    expect(values.verified[fixture.task_id] ?? []).toEqual([]);
    expect(values.verified_positive[fixture.task_id] ?? []).toEqual([]);

    const [view] = buildTaskViews(snapshot, [fixture.task_id]);
    expect(view!.status.ready_to_land).toBe(true);
    expect(view!.status.verified).toBe(false);
    expect(view!.settlement?.verification_exception).toBe('accepted by hand');

    const report = await buildLandReport(snapshot, NO_RESOLVER, 'main');
    expect(report.ready.some((c) => c.task_id === fixture.task_id)).toBe(true);
  });

  it('a land Settlement directly citing a contradicted Verdict is a VALID record (Settlement authority preserved) but never ready_to_land, and is distinguishable from an exception-authorized Settlement', async () => {
    const fixture = await buildLedger('tallyback-eps-y-');
    const v = makeVerdict(fixture, { conclusion: 'contradicted', finality: 'final' });
    await appendVerdict(fixture, v);

    // Store still accepts recording the decision -- TB-LC-005 does not gate on polarity.
    const settleOk = await settleLandCitingVerdict(fixture, v.verdict_id);
    expect(settleOk).toBe(true);

    const snapshot = fixture.store.currentSnapshot();
    expect(computeProjectionValues(snapshot).ready_to_land).not.toContain(fixture.task_id);

    const [view] = buildTaskViews(snapshot, [fixture.task_id]);
    // The Settlement is recorded and visible (authority), but carries no exception --
    // a consumer can tell this apart from an authorized override: no
    // verification_exception, and the cited Verdict's own conclusion is right there.
    expect(view!.status.settled).toBe(true);
    expect(view!.status.ready_to_land).toBe(false);
    expect(view!.status.verified).toBe(false);
    expect(view!.settlement?.verification_exception ?? null).toBeNull();
    expect(view!.verification.find((x) => x.verdict_id === v.verdict_id)?.conclusion).toBe(
      'contradicted',
    );
  });
});

describe('a positive Verdict on one attempt must not make a different attempt ready', () => {
  it("does not admit attempt A's contradicted-verdict land Settlement just because attempt B's settlement made the task ready_to_land", async () => {
    const fixture = await buildLedger('tallyback-eps-multi-');

    // Attempt A (the fixture's original attempt): final + contradicted verdict, cited directly.
    const badVerdict = makeVerdict(fixture, { conclusion: 'contradicted', finality: 'final' });
    await appendVerdict(fixture, badVerdict);
    const badSettleOk = await settleLandCitingVerdict(fixture, badVerdict.verdict_id);
    expect(badSettleOk).toBe(true);

    // Attempt B: a fresh dispatch + claim + a genuinely positive verdict.
    const secondWorkspace = unwrap<{ workspace: { workspace_id: string } }>(
      await fixture.store.registerWorkspace({
        repository_id: fixture.repository_id,
        branch: 'feature/b',
      }),
    ).workspace;
    const secondAttempt = unwrap<{ attempt: { attempt_id: string } }>(
      await fixture.store.dispatch({
        task_id: fixture.task_id,
        declaration_id: fixture.declaration_id,
        repository_id: fixture.repository_id,
        workspace_id: secondWorkspace.workspace_id,
        executor: { kind: 'executor', id: 'agent-8' },
        dispatched_by: ALICE,
      }),
    ).attempt;
    const secondEvidence = unwrap<{ evidence: { evidence_id: string } }>(
      await fixture.store.observeEvidence({
        kind: 'observation',
        submitted_by: { kind: 'executor', id: 'agent-8' },
        payload: { text: 'attempt B evidence' },
      }),
    ).evidence;
    const secondClaim = unwrap<{ claim: { claim_id: string } }>(
      await fixture.store.observeClaim({
        task_id: fixture.task_id,
        attempt_id: secondAttempt.attempt_id,
        declaration_id: fixture.declaration_id,
        statement: 'attempt B is complete',
        evidence_ids: [secondEvidence.evidence_id],
        claimed_by: { kind: 'executor', id: 'agent-8' },
      }),
    ).claim;
    const goodVerdict = makeVerdict(fixture, {
      subject: { kind: 'claim', id: secondClaim.claim_id },
      conclusion: 'supported',
      finality: 'final',
      confidence: { level: 'high', rationale: 'r' },
    });
    await appendVerdict(fixture, goodVerdict);

    const secondSettleOutcome = await fixture.store.settle({
      task_id: fixture.task_id,
      attempt_id: secondAttempt.attempt_id,
      decision: 'land',
      decided_by: ALICE,
      basis: { verdict_id: goodVerdict.verdict_id, attempt_end_id: null, blocker_ids: [] },
      rationale: "attempt B's verdict is genuinely positive",
    });
    expect(secondSettleOutcome.ok).toBe(true);

    const snapshot = fixture.store.currentSnapshot();
    // The task-level projection says ready_to_land (attempt B qualifies) ...
    expect(computeProjectionValues(snapshot).ready_to_land).toContain(fixture.task_id);
    // ... but Land classifies exactly ONE candidate as git_ready: attempt B's settlement,
    // never attempt A's contradicted-verdict settlement riding along.
    const report = await buildLandReport(snapshot, NO_RESOLVER, 'main');
    const readyForTask = report.ready.filter((c) => c.task_id === fixture.task_id);
    expect(readyForTask).toHaveLength(1);
    expect(readyForTask[0]!.attempt_id).toBe(secondAttempt.attempt_id);
  });
});
