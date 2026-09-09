import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assembleBundle,
  assembleCheckResult,
  beginCheck,
  CHECK_GATE_CODES,
  MUTATION_REVISION_CONFLICT,
  produceCheckOutput,
  recordCheckOutput,
  runCheck,
  type Checker,
  type CheckerOutput,
  type CheckStore,
  type RunCheckOutcome,
} from '../src/check/flow.js';
import { produceCheckInvocation } from '../src/check/invocation.js';
import type { CheckInvocation, EvaluatedSnapshot } from '../src/contract/index.js';

const U = (n: number) => '0190b1c0-0000-7000-8000-' + String(n).padStart(12, '0');
const PROJECT_ID = `prj_${U(0)}`;

// ---------------------------------------------------------------------------
// Part A — Check boundary (runs now, no ledger dependency).
// The Check flow produces the CheckInvocation and the result bundle, then hands
// them to any structural `CheckStore`. We drive it with an in-memory fake store
// to assert the boundary contract independent of the ledger implementation.
// ---------------------------------------------------------------------------

function makeFakeStore(): CheckStore & { recorded: unknown[]; revision(): number } {
  let revision = 0;
  const recorded: unknown[] = [];
  const store = {
    async currentSnapshot() {
      return { revision, project: { project_id: PROJECT_ID } };
    },
    async beginCheck(invocation: CheckInvocation, expectedRevision: number) {
      if (expectedRevision !== revision) {
        throw { code: MUTATION_REVISION_CONFLICT };
      }
      recorded.push(invocation);
      return {
        check_invocation_id: invocation.check_invocation_id,
        evaluated_snapshot: invocation.evaluated_snapshot,
      };
    },
    async recordCheckOutput(bundle: unknown, expectedRevision: number) {
      if (expectedRevision !== revision) {
        return { ok: false, revision, code: MUTATION_REVISION_CONFLICT };
      }
      revision += 1;
      recorded.push(bundle);
      return { ok: true, revision };
    },
    recorded,
    revision: () => revision,
  };
  return store as unknown as CheckStore & { recorded: unknown[]; revision(): number };
}

const subject = { kind: 'claim', id: `clm_${U(1)}` } as const;
const checkerRef = { id: 'done-or-not', version: '1' } as const;

function evaluated(revision: number): EvaluatedSnapshot {
  return {
    project_id: PROJECT_ID,
    revision,
    digest: { algorithm: 'sha-256', value: 'a'.repeat(64) },
  };
}

describe('Check boundary (Store-agnostic)', () => {
  it('produceCheckInvocation builds a canonical chk_ record', () => {
    const invocation = produceCheckInvocation({
      subject,
      checker: checkerRef,
      evaluated_snapshot: evaluated(0),
    });
    expect(invocation.check_invocation_id).toMatch(/^chk_/);
    expect(invocation.subject).toEqual(subject);
    expect(invocation.checker).toEqual(checkerRef);
    expect(invocation.invoked_by).toEqual({ kind: 'tool', id: 'tallyback-check' });
  });

  it('beginCheck records the invocation and returns the frozen evaluation input', async () => {
    const fake = makeFakeStore();
    const { invocation, frozen } = await beginCheck(fake, { subject, checker: checkerRef });
    expect(frozen.check_invocation_id).toBe(invocation.check_invocation_id);
    expect(frozen.evaluated_snapshot.project_id).toBe(PROJECT_ID);
    expect(frozen.evaluated_snapshot.revision).toBe(0);
    expect(fake.recorded).toHaveLength(1);
    expect(fake.recorded[0]).toMatchObject({ check_invocation_id: invocation.check_invocation_id });
  });

  it('assembleCheckResult maps withheld/failed/verdict outputs to a CheckResult', () => {
    const invocation = produceCheckInvocation({
      subject,
      checker: checkerRef,
      evaluated_snapshot: evaluated(0),
    });

    const withheld = assembleCheckResult(invocation, {
      kind: 'withheld',
      code: CHECK_GATE_CODES.CHECKER_SEMANTICS_MISSING,
      reason: 'no semantics installed',
      reconciliations: [],
      evidence: [],
    } as unknown as CheckerOutput);
    expect(withheld.outcome).toBe('verdict_withheld');
    expect(withheld.verdict_id).toBeNull();
    expect(withheld.diagnostics?.[0]?.code).toBe(CHECK_GATE_CODES.CHECKER_SEMANTICS_MISSING);

    const failed = assembleCheckResult(invocation, {
      kind: 'failed',
      reason: 'checker threw',
      reconciliations: [],
      evidence: [],
    } as unknown as CheckerOutput);
    expect(failed.outcome).toBe('check_failed');
    expect(failed.diagnostics?.[0]?.code).toBe(CHECK_GATE_CODES.CHECK_FAILED);

    const verdict = assembleCheckResult(invocation, {
      kind: 'verdict',
      verdict: { verdict_id: `ver_${U(2)}` },
      reconciliations: [],
      evidence: [],
    } as unknown as CheckerOutput);
    expect(verdict.outcome).toBe('verdict_emitted');
    expect(verdict.verdict_id).toBe(`ver_${U(2)}`);
  });

  it('assembleBundle wraps a verdict output into a self-contained result bundle', () => {
    const invocation = produceCheckInvocation({
      subject,
      checker: checkerRef,
      evaluated_snapshot: evaluated(0),
    });
    const output = {
      kind: 'verdict',
      verdict: { verdict_id: `ver_${U(2)}` },
      reconciliations: [],
      evidence: [],
    } as unknown as CheckerOutput;
    const bundle = assembleBundle(invocation, output);
    expect(bundle.check_result.verdict_id).toBe(`ver_${U(2)}`);
    expect(bundle.verdict).toEqual({ verdict_id: `ver_${U(2)}` });
  });

  it('runCheck drives begin → evaluate → assemble → record end-to-end', async () => {
    const fake = makeFakeStore();
    const checkerFn: Checker = () => ({
      kind: 'withheld',
      code: CHECK_GATE_CODES.DECLARATION_SEMANTICS_MISSING,
      reason: 'no declaration semantics',
      reconciliations: [],
      evidence: [],
    });
    const outcome: RunCheckOutcome = await runCheck({
      subject,
      checker: checkerRef,
      checkerFn,
      store: fake,
      resolution: {} as never,
    });
    // `emitted` (what the checker judged) stays distinct from `recorded` (what Store
    // confirmed into the canonical graph) — SPEC §8.
    expect(outcome.outcome).toBe('verdict_withheld');
    expect(outcome.invocation.check_invocation_id).toMatch(/^chk_/);
    expect(outcome.bundle.check_result.outcome).toBe('verdict_withheld');
    expect(outcome.recorded).toBe(true);
    expect(outcome.recording.ok).toBe(true);
    expect(outcome.revision).toBe(1);
    // The complete flow records BOTH records: the invocation and the result bundle.
    expect(fake.recorded).toHaveLength(2);
    expect(fake.recorded[0]).toMatchObject({
      check_invocation_id: outcome.invocation.check_invocation_id,
    });
    expect(fake.recorded[1]).toMatchObject({
      check_result: { check_result_id: outcome.bundle.check_result.check_result_id },
    });
  });

  it('produceCheckOutput is the produce-only API: it records no result', async () => {
    const fake = makeFakeStore();
    const checkerFn: Checker = () => ({
      kind: 'failed',
      reason: 'the checker threw',
      reconciliations: [],
      evidence: [],
    });
    const produced = await produceCheckOutput({
      subject,
      checker: checkerRef,
      checkerFn,
      store: fake,
      resolution: {} as never,
    });
    expect(produced.outcome).toBe('check_failed');
    // Only the invocation reached Store: `chk_` with no `ckr_` is the documented
    // "invoked, but no result recorded" state (SPEC §5.9).
    expect(fake.recorded).toHaveLength(1);
    expect(fake.revision()).toBe(0);
    expect(produced).not.toHaveProperty('recorded');
  });

  it('recordCheckOutput retries on revision conflict, then succeeds', async () => {
    let calls = 0;
    const store = {
      async currentSnapshot() {
        return { revision: calls, project: { project_id: PROJECT_ID } };
      },
      async beginCheck() {
        throw new Error('unused');
      },
      async recordCheckOutput(_bundle: unknown, _expectedRevision: number) {
        calls += 1;
        if (calls < 3) {
          return { ok: false, revision: calls, code: MUTATION_REVISION_CONFLICT };
        }
        return { ok: true, revision: calls };
      },
    } as unknown as CheckStore;
    const result = await recordCheckOutput(store, {} as never);
    expect(result.ok).toBe(true);
    expect(calls).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Part B — Store → Check ingestion (guarded on the ledger barrel).
// The ledger's Store imports `validate_append` / `validate_snapshot` from the
// contract barrel, which land with the reference validator (task #4). Until
// then the barrel cannot instantiate and this end-to-end is skipped.
// ---------------------------------------------------------------------------

interface StoreStatic {
  init(root: string, options?: unknown): Promise<any>;
  open(root: string): Promise<any>;
}

let ledgerStore: StoreStatic | undefined;
let hasLedgerValidator = false;
let ledgerLoadError: string | undefined;
try {
  const contract = (await import('../src/contract/index.js')) as unknown as {
    validate_append?: unknown;
    validate_snapshot?: unknown;
  };
  hasLedgerValidator =
    typeof contract.validate_append === 'function' &&
    typeof contract.validate_snapshot === 'function';
  if (hasLedgerValidator) {
    const mod = (await import('../src/ledger/index.js')) as unknown as { Store: StoreStatic };
    ledgerStore = mod.Store;
  }
} catch (err) {
  ledgerLoadError = err instanceof Error ? err.message : String(err);
}

const storeDescribe = ledgerStore ? describe : describe.skip;

storeDescribe('Store → Check ingestion (tmpdir, persisted)', () => {
  async function buildLedger(): Promise<{ store: any; root: string }> {
    const root = await mkdtemp(join(tmpdir(), 'tallyback-accept-'));
    const store = await ledgerStore!.init(root, {
      project_id: PROJECT_ID,
      topic: { name: 'release', goal: 'ship it' },
      created_by: { kind: 'human', id: 'alice' },
    });
    return { store, root };
  }

  async function appendOrThrow(
    store: any,
    records: unknown[],
    expectedRevision: number,
  ): Promise<number> {
    const result = await store.append({
      kind: 'append_records',
      expected_revision: expectedRevision,
      records,
      provenance: { submitted_by: { kind: 'tool', id: 'tallyback' } },
    });
    if (!result.ok) {
      throw new Error(`append failed: ${result.code}`);
    }
    return result.revision;
  }

  it('persists a full Declare → Dispatch → Observe → Verify cycle', async () => {
    const { store, root } = await buildLedger();
    const snap0 = store.currentSnapshot();
    const repoId = snap0.repositories[0].repository_id as string;
    const topicId = snap0.topics[0].topic_id as string;

    const taskId = `tsk_${U(1)}`;
    const workspaceId = `wsp_${U(1)}`;
    const criterionId = `cri_${U(1)}`;

    const alice = { kind: 'human', id: 'alice' };
    const agent = { kind: 'executor', id: 'agent-7' };
    const checker = { kind: 'tool', id: 'tallyback-check' };

    let rev = 0;
    rev = await appendOrThrow(
      store,
      [{ task_id: taskId, topic_id: topicId, title: 'Implement validation' }],
      rev,
    );
    rev = await appendOrThrow(store, [{ workspace_id: workspaceId, repository_id: repoId }], rev);

    // Declare (command).
    const declared = await store.declare(
      {
        task_id: taskId,
        objective: 'Implement validation.',
        criteria: [
          {
            criterion_id: criterionId,
            code: 'invalid-record-rejected',
            statement: 'Reject invalid records.',
            required: true,
          },
        ],
        declared_by: alice,
      },
      rev,
    );
    expect(declared.ok).toBe(true);
    rev = declared.revision;

    // Dispatch (command).
    const dispatched = await store.dispatch(
      {
        task_id: taskId,
        declaration_id: declared.declaration.declaration_id,
        repository_id: repoId,
        workspace_id: workspaceId,
        executor: agent,
        dispatched_by: alice,
      },
      rev,
    );
    expect(dispatched.ok).toBe(true);
    rev = dispatched.revision;

    // Observe a claim (command).
    const claimed = await store.observeClaim(
      {
        task_id: taskId,
        attempt_id: dispatched.attempt.attempt_id,
        declaration_id: declared.declaration.declaration_id,
        statement: 'The validation work is complete.',
        evidence_ids: [],
        claimed_by: agent,
      },
      rev,
    );
    expect(claimed.ok).toBe(true);
    rev = claimed.revision;

    // Verify (Check boundary): produce the invocation and a verdict bundle.
    const invocation = produceCheckInvocation({
      subject: { kind: 'claim', id: claimed.claim.claim_id },
      checker: checkerRef,
      evaluated_snapshot: evaluated(rev),
    });
    const begin = await store.beginCheck(invocation, rev);
    expect(begin.check_invocation_id).toBe(invocation.check_invocation_id);
    rev = rev + 1;

    const verdict = {
      verdict_id: `ver_${U(1)}`,
      subject: { kind: 'claim', id: claimed.claim.claim_id },
      declaration_id: declared.declaration.declaration_id,
      scope: { evaluated_criteria: [criterionId], unevaluated_criteria: [] },
      conclusion: 'supported',
      finality: 'final',
      basis: { evidence_ids: [`evi_${U(1)}`], reconciliation_ids: [`rec_${U(1)}`] },
      findings: [
        { criterion_id: criterionId, assessment: 'supported', summary: 'resolved', basis_refs: [] },
      ],
      confidence: { level: 'high', rationale: 'n/a' },
      rationale: 'test',
      uncertainty: [],
      limitations: [],
      issued_by: checker,
      issued_at: '2026-09-02T13:00:00Z',
      checker: checkerRef,
    };
    const bundle = {
      check_result: {
        check_result_id: `ckr_${U(1)}`,
        check_invocation_id: invocation.check_invocation_id,
        outcome: 'verdict_emitted',
        produced_by: checker,
        completed_at: '2026-09-02T13:00:00Z',
        verdict_id: `ver_${U(1)}`,
        reconciliation_ids: [`rec_${U(1)}`],
        diagnostics: [],
      },
      reconciliations: [
        {
          reconciliation_id: `rec_${U(1)}`,
          evidence_id: `evi_${U(1)}`,
          checked_by: checker,
          checked_at: '2026-09-02T12:00:00Z',
          method: { name: 'git-object-inspection', version: '1' },
          observed_context: { repository_id: repoId },
          checks: [
            {
              predicate: 'git.object.exists',
              outcome: 'confirmed',
              observed: { object_id: 'abc' },
            },
          ],
          limitations: [],
        },
      ],
      produced_evidence: [
        {
          evidence_id: `evi_${U(1)}`,
          kind: 'observation',
          submitted_by: agent,
          submitted_at: '2026-09-02T10:00:00Z',
          payload: { text: 'git object exists' },
        },
      ],
      verdict,
    };
    const recorded = await store.recordCheckOutput(bundle, rev);
    expect(recorded.ok).toBe(true);
    rev = recorded.revision;

    // The whole cycle is durable: reload from disk and assert the graph.
    const reopened = await ledgerStore!.open(root);
    const snap = reopened.currentSnapshot();
    expect(snap.revision).toBe(rev);
    expect(snap.tasks.map((t: any) => t.task_id)).toContain(taskId);
    expect(snap.declarations.map((d: any) => d.declaration_id)).toContain(
      declared.declaration.declaration_id,
    );
    expect(snap.check_invocations.map((c: any) => c.check_invocation_id)).toContain(
      invocation.check_invocation_id,
    );
    expect(snap.check_results.map((c: any) => c.check_result_id)).toContain(`ckr_${U(1)}`);
    expect(snap.verdicts.map((v: any) => v.verdict_id)).toContain(`ver_${U(1)}`);
  });
});

if (!ledgerStore) {
  describe('Store integration availability', () => {
    it('documents that the ledger barrel cannot run until the reference validator lands', () => {
      expect(hasLedgerValidator).toBe(false);
      expect(ledgerLoadError ?? 'validate_append/validate_snapshot not exported').toBeTruthy();
    });
  });
}
