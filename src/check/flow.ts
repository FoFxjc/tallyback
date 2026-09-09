/**
 * Check flow: `begin_check` → evaluate → assemble → record.
 *
 * Two records are produced: the CheckInvocation (`chk_`, produced by the
 * invoker **before** execution) and, when the checker returns, the CheckResult
 * (`ckr_`). Check is read-only with respect to the ledger: it never mutates
 * the ledger itself, only produces canonical record bundles and submits them
 * through `Store.recordCheckOutput`.
 *
 * Checkers are **named, installed provider interfaces** — a pure function
 * referenced by stable `id` + `version` — never a raw shell command string.
 *
 * Expected `../contract/index.js` exports used here (verify when landed):
 *   - types `CheckInvocation`, `CheckResult`, `CheckResultBundle`, `Verdict`,
 *     `Evidence`, `Reconciliation`, `Snapshot`
 *   - value `digest` (canonical snapshot digest → `{ algorithm, value }`)
 */

import { newId, now } from './ids.js';
import type {
  CheckInvocation,
  CheckResult,
  CheckResultBundle,
  Evidence,
  Reconciliation,
  Snapshot,
  Verdict,
} from '../contract/index.js';
import { canonicalizeSetArray, semanticSnapshotDigest } from '../contract/index.js';
import type { Actor, CheckerRef, Digest, EvaluatedSnapshot, Subject } from './types.js';
import { DEFAULT_INVOKER } from './types.js';
import type { ResolvedWorkspace } from './resolution.js';
import { produceCheckInvocation } from './invocation.js';

/** Check gate diagnostics (`check.*` namespace). */
export const CHECK_GATE_CODES = {
  DECLARATION_SEMANTICS_MISSING: 'check.declaration_semantics_missing',
  CHECKER_SEMANTICS_MISSING: 'check.checker_semantics_missing',
  CHECK_FAILED: 'check.check_failed',
} as const;

export type WithheldCode =
  | typeof CHECK_GATE_CODES.DECLARATION_SEMANTICS_MISSING
  | typeof CHECK_GATE_CODES.CHECKER_SEMANTICS_MISSING;

export type CheckResultOutcome = 'verdict_emitted' | 'verdict_withheld' | 'check_failed';

export const MUTATION_REVISION_CONFLICT = 'mutation.revision_conflict';

/* ------------------------------------------------------------------ */
/* Checker interface (the pluggable pure function)                     */
/* ------------------------------------------------------------------ */

/** The frozen, read-only input handed to a checker. */
export interface CheckerInput {
  /** The recorded invocation (`chk_`). */
  invocation: CheckInvocation;
  /** The subject being checked (e.g. a `clm_`). */
  subject: Subject;
  /** Frozen evaluation input (project_id + revision + digest). */
  evaluated_snapshot: EvaluatedSnapshot;
  /** The full reference snapshot, read-only. */
  snapshot: Snapshot;
  /** The resolved, validated workspace capability. */
  resolution: ResolvedWorkspace;
}

/** A checker that emitted a Verdict. */
export interface VerdictOutput {
  kind: 'verdict';
  verdict: Verdict;
  reconciliations: Reconciliation[];
  evidence: Evidence[];
}

/** A checker that withheld a Verdict (a meaningful model state, not an error). */
export interface WithheldOutput {
  kind: 'withheld';
  code: WithheldCode;
  reason: string;
  reconciliations: Reconciliation[];
  evidence: Evidence[];
}

/** A checker that produced an explicit, recordable failure. */
export interface FailedOutput {
  kind: 'failed';
  reason: string;
  reconciliations: Reconciliation[];
  evidence: Evidence[];
}

export type CheckerOutput = VerdictOutput | WithheldOutput | FailedOutput;

/** A pluggable, pure checker: `(input) => output`. Never a shell string. */
export type Checker = (input: CheckerInput) => CheckerOutput | Promise<CheckerOutput>;

/* ------------------------------------------------------------------ */
/* Store interface (ledger dependency, structurally satisfied)         */
/* ------------------------------------------------------------------ */

export interface BeginCheckResult {
  check_invocation_id: string;
  evaluated_snapshot: EvaluatedSnapshot;
}

export interface RecordCheckOutputResult {
  ok: boolean;
  revision: number;
  code?: string;
}

/**
 * The minimal Store surface Check depends on. The ledger's `Store` class
 * satisfies this structurally. Method returns may be sync or async.
 */
export interface CheckStore {
  currentSnapshot(): Snapshot | Promise<Snapshot>;
  beginCheck(
    invocation: CheckInvocation,
    expectedRevision: number,
  ): BeginCheckResult | Promise<BeginCheckResult>;
  recordCheckOutput(
    bundle: CheckResultBundle,
    expectedRevision: number,
  ): RecordCheckOutputResult | Promise<RecordCheckOutputResult>;
}

/* ------------------------------------------------------------------ */
/* Snapshot helpers                                                     */
/* ------------------------------------------------------------------ */

export function snapshotRevision(snapshot: Snapshot): number {
  const rev = (snapshot as unknown as { revision?: unknown }).revision;
  if (typeof rev !== 'number' || !Number.isInteger(rev)) {
    throw new Error('check_error: snapshot has no integer revision');
  }
  return rev;
}

/**
 * Raised when a caller-supplied snapshot override does not match the invocation's frozen
 * `evaluated_snapshot` — see `produceCheckOutput`.
 */
export class MismatchedEvaluatedSnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MismatchedEvaluatedSnapshotError';
  }
}

/**
 * Assert that `snapshot` is exactly the snapshot `evaluated` names: same project, same
 * revision, and — recomputed with the same `digestFn` the invocation itself used — the
 * same digest. Throws rather than returning a result, because a mismatch here is a
 * programming error in the caller, not an ordinary Check outcome.
 */
function assertSnapshotMatchesEvaluated(
  snapshot: Snapshot,
  evaluated: EvaluatedSnapshot,
  digestFn: ((snapshot: Snapshot) => Digest) | undefined,
): void {
  const projectId = snapshotProjectId(snapshot);
  if (projectId !== evaluated.project_id) {
    throw new MismatchedEvaluatedSnapshotError(
      `check_error: the supplied snapshot's project ${projectId} does not match the ` +
        `invocation's evaluated_snapshot.project_id ${evaluated.project_id}`,
    );
  }
  const revision = snapshotRevision(snapshot);
  if (revision !== evaluated.revision) {
    throw new MismatchedEvaluatedSnapshotError(
      `check_error: the supplied snapshot is at revision ${revision}, but the invocation's ` +
        `evaluated_snapshot names revision ${evaluated.revision}`,
    );
  }
  const digest = (digestFn ?? semanticSnapshotDigest)(snapshot);
  if (digest.value !== evaluated.digest.value) {
    throw new MismatchedEvaluatedSnapshotError(
      `check_error: the supplied snapshot's digest does not match the invocation's ` +
        `evaluated_snapshot.digest — it is not the snapshot this invocation actually evaluated`,
    );
  }
}

export function snapshotProjectId(snapshot: Snapshot): string {
  const s = snapshot as unknown as { project?: { project_id?: unknown } };
  const pid = s.project?.project_id;
  if (typeof pid === 'string' && pid.length > 0) return pid;
  throw new Error('check_error: snapshot exposes no project_id');
}

/* ------------------------------------------------------------------ */
/* Phase 1 — begin_check                                                */
/* ------------------------------------------------------------------ */

export interface BeginCheckOptions {
  subject: Subject;
  checker: CheckerRef;
  invoked_by?: Actor;
  /**
   * Compute the `evaluated_snapshot.digest`.
   *
   * Defaults to the contract's **semantic** snapshot digest (SPEC §10: records ordered by
   * `(record_type, id)`, `projections` excluded). The generic `digest()` is not a
   * substitute: it hashes the discardable `projections` cache too, so two consumers at the
   * same revision would record different digests depending on whether projections happened
   * to be materialized. Override only to plug in a different agreed digest.
   */
  digestFn?: (snapshot: Snapshot) => Digest;
}

export interface BeginCheckOutcome {
  invocation: CheckInvocation;
  frozen: BeginCheckResult;
  /**
   * The exact snapshot `evaluated_snapshot` identifies and hashes.
   *
   * Recording the invocation advances the ledger from N to N+1, so re-reading
   * `currentSnapshot()` afterwards yields N+1 — different data than the frozen input
   * claims. Handing this snapshot to the checker is what makes `evaluated_snapshot` an
   * honest description of what was evaluated.
   */
  evaluated: Snapshot;
}

/**
 * Produce the CheckInvocation against the current snapshot, then submit it via
 * `Store.beginCheck`. Returns the produced invocation and the frozen
 * evaluation input returned by Store.
 */
export async function beginCheck(
  store: CheckStore,
  options: BeginCheckOptions,
): Promise<BeginCheckOutcome> {
  const snapshot = await store.currentSnapshot();
  const revision = snapshotRevision(snapshot);
  const digestFn = options.digestFn ?? semanticSnapshotDigest;
  const evaluated_snapshot: EvaluatedSnapshot = {
    project_id: snapshotProjectId(snapshot),
    revision,
    digest: digestFn(snapshot),
  };
  const invocation = produceCheckInvocation({
    subject: options.subject,
    checker: options.checker,
    evaluated_snapshot,
    invoked_by: options.invoked_by,
  });
  const frozen = await store.beginCheck(invocation, revision);
  // `snapshot` was read BEFORE the invocation was recorded, so it is revision N — the one
  // `evaluated_snapshot` names. The ledger is now at N+1; that is not what was evaluated.
  return { invocation, frozen, evaluated: snapshot };
}

/* ------------------------------------------------------------------ */
/* Phase 2/3 — evaluate and assemble                                    */
/* ------------------------------------------------------------------ */

/** Map a checker output to a CheckResult record. */
export function assembleCheckResult(
  invocation: CheckInvocation,
  output: CheckerOutput,
): CheckResult {
  // `check_result.reconciliation_ids` is a registered `set` array (lexical-by-id): a
  // producer emits it already sorted and duplicate-free, because Store rejects — never
  // silently normalizes — a non-canonical set array (SPEC §10).
  const reconciliation_ids = canonicalizeSetArray(
    output.reconciliations.map((r) => r.reconciliation_id),
  );
  const base = {
    check_result_id: newId('ckr_'),
    check_invocation_id: invocation.check_invocation_id,
    produced_by: DEFAULT_INVOKER,
    completed_at: now(),
    reconciliation_ids,
  };
  switch (output.kind) {
    case 'verdict':
      return {
        ...base,
        outcome: 'verdict_emitted' as const,
        diagnostics: [],
        verdict_id: output.verdict.verdict_id,
      };
    case 'withheld':
      return {
        ...base,
        outcome: 'verdict_withheld' as const,
        diagnostics: [{ code: output.code, message: output.reason }],
        verdict_id: null,
      };
    case 'failed':
      return {
        ...base,
        outcome: 'check_failed' as const,
        diagnostics: [{ code: CHECK_GATE_CODES.CHECK_FAILED, message: output.reason }],
        verdict_id: null,
      };
  }
}

/** Assemble a self-contained canonical result bundle. */
export function assembleBundle(
  invocation: CheckInvocation,
  output: CheckerOutput,
): CheckResultBundle {
  const check_result = assembleCheckResult(invocation, output);
  return {
    check_result,
    reconciliations: output.reconciliations,
    produced_evidence: output.evidence,
    verdict: output.kind === 'verdict' ? output.verdict : null,
  };
}

/* ------------------------------------------------------------------ */
/* Phase 4 — record (with optimistic-concurrency retry)                 */
/* ------------------------------------------------------------------ */

function isRevisionConflict(err: unknown): boolean {
  if (err && typeof err === 'object') {
    const e = err as { code?: unknown; message?: unknown };
    if (e.code === MUTATION_REVISION_CONFLICT) return true;
    if (typeof e.message === 'string' && e.message.includes(MUTATION_REVISION_CONFLICT)) {
      return true;
    }
  }
  return false;
}

/**
 * Submit the result bundle under the ledger's **current** expected revision.
 * On `mutation.revision_conflict`, re-read the current revision and retry —
 * **without** changing the frozen `evaluated_snapshot`. The historical result
 * remains recordable even if an unrelated writer advanced the ledger.
 */
export async function recordCheckOutput(
  store: CheckStore,
  bundle: CheckResultBundle,
  options: { maxRetries?: number } = {},
): Promise<RecordCheckOutputResult> {
  const maxRetries = options.maxRetries ?? 5;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const snapshot = await store.currentSnapshot();
    const revision = snapshotRevision(snapshot);
    try {
      const result = await store.recordCheckOutput(bundle, revision);
      if (result && typeof result === 'object' && result.ok === false) {
        if (result.code === MUTATION_REVISION_CONFLICT) {
          continue; // retry against a freshly read revision
        }
      }
      return result;
    } catch (err) {
      if (isRevisionConflict(err)) {
        continue;
      }
      throw err;
    }
  }
  throw new Error(
    `check_error: exceeded ${maxRetries} retries recording check output (${MUTATION_REVISION_CONFLICT})`,
  );
}

/* ------------------------------------------------------------------ */
/* End-to-end run                                                       */
/* ------------------------------------------------------------------ */

export interface RunCheckOptions {
  subject: Subject;
  checker: CheckerRef;
  checkerFn: Checker;
  store: CheckStore;
  resolution: ResolvedWorkspace;
  invoked_by?: Actor;
  /**
   * Override the snapshot handed to the checker. Defaults to the snapshot the invocation
   * froze; supply one only when the caller has its own pinned copy of that same revision.
   */
  snapshot?: Snapshot;
  /** Passed through to `beginCheck`; defaults to `contract`'s generic `digest`. */
  digestFn?: (snapshot: Snapshot) => Digest;
  /** Revision-conflict retries for the record phase. Default 5 (see `recordCheckOutput`). */
  maxRetries?: number;
}

/**
 * The result of producing — but deliberately **not** recording — a Check output.
 *
 * SPEC §8: "`emitted` ≠ `recorded` ≠ `accepted` ≠ `landed`." This is the emitted stage:
 * the bundle exists and is referenceable, and nothing is in the canonical graph yet.
 */
export interface ProduceCheckOutcome {
  invocation: CheckInvocation;
  frozen: BeginCheckResult;
  bundle: CheckResultBundle;
  /** The **emitted** outcome the checker produced. */
  outcome: CheckResultOutcome;
}

export interface RunCheckOutcome extends ProduceCheckOutcome {
  /** The Store's answer for the record phase (`{ ok, revision, code? }`). */
  recording: RecordCheckOutputResult;
  /** Whether Store confirmed the bundle into the canonical graph. */
  recorded: boolean;
  /** The ledger revision the bundle was recorded at; the current revision on failure. */
  revision: number;
}

/**
 * Begin the invocation, run the checker, and assemble the result bundle — **without**
 * recording it.
 *
 * This is the lower-level "produce only" API, named so it cannot be mistaken for the
 * complete flow. It leaves the ledger holding a `chk_` and no `ckr_`, which SPEC §5.9
 * describes exactly: "invoked, but no result recorded". Callers that want the whole loop
 * want `runCheck`.
 */
export async function produceCheckOutput(options: RunCheckOptions): Promise<ProduceCheckOutcome> {
  const { invocation, frozen, evaluated } = await beginCheck(options.store, {
    subject: options.subject,
    checker: options.checker,
    invoked_by: options.invoked_by,
    digestFn: options.digestFn,
  });
  // The frozen snapshot, never a fresh read: `beginCheck` has already advanced the ledger
  // past it, so `currentSnapshot()` here would hand the checker revision N+1 while its
  // recorded `evaluated_snapshot` identifies and hashes N.
  const snapshot = options.snapshot ?? evaluated;
  if (options.snapshot !== undefined) {
    // A caller-supplied override is trusted only after it is PROVEN to be the exact
    // snapshot `evaluated_snapshot` already names. Handing the checker something else —
    // a stale copy, an unrelated ledger's snapshot — while the recorded invocation still
    // claims to have evaluated `frozen.evaluated_snapshot` would let the checker emit
    // (and Store record) a Verdict whose basis never actually matched what it says it did.
    assertSnapshotMatchesEvaluated(snapshot, frozen.evaluated_snapshot, options.digestFn);
  }
  const input: CheckerInput = {
    invocation,
    subject: options.subject,
    evaluated_snapshot: frozen.evaluated_snapshot,
    snapshot,
    resolution: options.resolution,
  };
  const output = await options.checkerFn(input);
  const bundle = assembleBundle(invocation, output);
  return { invocation, frozen, bundle, outcome: bundle.check_result.outcome };
}

/**
 * Run the **complete** Check flow against a resolved workspace: begin the invocation,
 * evaluate, assemble the bundle, and record it through the retrying `recordCheckOutput`.
 *
 * Check remains read-only with respect to the ledger — it produces records and submits
 * them; only Store mutates. The returned outcome keeps `emitted` and `recorded` distinct:
 * `outcome` is what the checker emitted (including `verdict_withheld`, a meaningful model
 * state rather than an error), while `recorded`/`revision` say whether and where Store
 * confirmed it. A recording failure is an ordinary outcome, not an exception, so a caller
 * can see a checker's judgment even when ingestion did not land.
 */
export async function runCheck(options: RunCheckOptions): Promise<RunCheckOutcome> {
  const produced = await produceCheckOutput(options);
  const recording = await recordCheckOutput(options.store, produced.bundle, {
    maxRetries: options.maxRetries,
  });
  return {
    ...produced,
    recording,
    recorded: recording.ok === true,
    revision: recording.revision,
  };
}
