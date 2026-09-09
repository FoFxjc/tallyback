/**
 * The public Store API.
 *
 * `Store` extends the `LedgerStore` engine with the explicit command surface of the
 * accountability loop (Declare → Dispatch → Observe → Verify → Settle), the two-step
 * Check flow (`beginCheck` / `recordCheckOutput`), and read accessors. Check never writes
 * the ledger; only Store does.
 *
 * `Store` structurally satisfies Check's `CheckStore` interface (`currentSnapshot()`,
 * `beginCheck(invocation, expectedRevision)`, `recordCheckOutput(bundle, expectedRevision)`)
 * — Check produces the full `CheckInvocation` itself and submits it here; the ledger only
 * records it.
 */

import { LedgerStore, StoreError, type InitOptions } from './store.js';
import {
  newId,
  nowIso,
  readBindings,
  snapshotDigest,
  writeBindings,
  type Bindings,
} from './snapshot.js';
import { canonicalizeSetArraysInRecord } from '../contract/index.js';
import type {
  Actor,
  AnyRecord,
  AppendOperation,
  Attempt,
  AttemptEnd,
  AttemptEndOutcome,
  Blocker,
  BlockerResolution,
  CheckerMeta,
  CheckInvocation,
  CheckResult,
  CheckResultBundle,
  CheckResultOutcome,
  Claim,
  Decision,
  DecisionRole,
  DecisionSubject,
  Diagnostic,
  Disposition,
  EvaluatedSnapshot,
  Evidence,
  Reconciliation,
  Repository,
  Settlement,
  SettlementBasis,
  SettlementDecision,
  Task,
  TaskDeclaration,
  Timestamp,
  Topic,
  Verdict,
  Workspace,
} from '../contract/index.js';

export type MutationSuccess<T> = { ok: true; revision: number } & T;
export type MutationFailure = { ok: false; code: string; message?: string };
export type MutationOutcome<T = object> = MutationSuccess<T> | MutationFailure;

/** Returned by `beginCheck`; matches Check's `BeginCheckResult` (frozen evaluation input). */
export interface BeginCheckResult {
  check_invocation_id: string;
  evaluated_snapshot: EvaluatedSnapshot;
}

/** Returned by `recordCheckOutput`; matches Check's `RecordCheckOutputResult`. */
export interface RecordCheckOutputResult {
  ok: boolean;
  revision: number;
  code?: string;
}

// ---------------------------------------------------------------------------
// Command inputs
// ---------------------------------------------------------------------------

export interface CreateTopicInput {
  name: string;
  goal: string;
  created_by: Actor;
  created_at?: Timestamp;
}

export interface CreateTaskInput {
  topic_id: string;
  title: string;
  /** Local human-facing alias (e.g. `T1`). Never used as a wire reference. */
  alias?: string;
}

export interface RegisterWorkspaceInput {
  repository_id: string;
  /** Portable, non-machine-specific hints only — never a local path. */
  branch?: string;
  ref?: string;
}

export interface BindWorkspaceInput {
  repository_id: string;
  workspace_id: string;
  /** Absolute local path. Machine-local only: it never reaches a committable file. */
  root: string;
}

export interface BeginCheckForInput {
  /** The Claim under check (`clm_`). */
  claim_id: string;
  checker: CheckerMeta;
  invoked_by?: Actor;
  invoked_at?: Timestamp;
  expected_revision?: number;
}

export interface RecordCheckResultInput {
  check_invocation_id: string;
  outcome: CheckResultOutcome;
  diagnostics?: Diagnostic[];
  reconciliations?: Reconciliation[];
  produced_evidence?: Evidence[];
  verdict?: Verdict | null;
  produced_by?: Actor;
  completed_at?: Timestamp;
  /** Revision-conflict retries for the record phase (SPEC §8.1). Default 5. */
  maxRetries?: number;
}

export interface CriterionInput {
  criterion_id?: string;
  code: string;
  statement: string;
  required?: boolean;
}

export interface DeclareInput {
  task_id: string;
  objective: string;
  criteria: CriterionInput[];
  declared_by: Actor;
  declared_at?: Timestamp;
  supersedes?: string;
}

export interface DispatchInput {
  task_id: string;
  declaration_id: string;
  repository_id: string;
  workspace_id: string;
  executor: Actor;
  session_id?: string;
  dispatched_by: Actor;
  dispatched_at?: Timestamp;
}

export interface EndAttemptInput {
  attempt_id: string;
  outcome: AttemptEndOutcome;
  reported_by: Actor;
  ended_at?: Timestamp;
  reason?: string;
  supersedes?: string;
}

export interface ObserveClaimInput {
  task_id: string;
  attempt_id: string;
  declaration_id: string;
  statement: string;
  evidence_ids?: string[];
  claimed_by: Actor;
  claimed_at?: Timestamp;
}

/** A full Evidence record minus its producer-assigned identity and (optional) timestamp. */
export type ObserveEvidenceInput = Omit<Evidence, 'evidence_id' | 'submitted_at'> & {
  submitted_at?: Timestamp;
};

export interface RaiseBlockerInput {
  task_id: string;
  description: string;
  raised_by: Actor;
  raised_at?: Timestamp;
  attempt_id?: string;
}

export interface ResolveBlockerInput {
  blocker_id: string;
  disposition: Disposition;
  resolved_by: Actor;
  resolved_at?: Timestamp;
  explanation?: string;
  evidence_ids?: string[];
  supersedes?: string;
}

export interface SettleInput {
  task_id: string;
  attempt_id: string;
  decision: SettlementDecision;
  decided_by: Actor;
  decided_at?: Timestamp;
  basis: SettlementBasis;
  verification_exception?: string | null;
  rationale: string;
  supersedes?: string;
}

export interface RecordDecisionInput {
  subject: DecisionSubject;
  role: DecisionRole;
  question: string;
  choice: string;
  rationale: string;
  decided_by: Actor;
  decided_at?: Timestamp;
  basis?: string[];
  supersedes?: string;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/**
 * Recursively drop properties whose value is `undefined`.
 *
 * An optional field a host did not supply must be **absent**, not present-and-undefined:
 * JSON has no `undefined`, JCS refuses to serialize it, and the closed record schemas
 * distinguish "absent" from "present". A host adapter that spreads an options object
 * naturally produces `note: undefined` — and a nested one produces
 * `payload: { observed_at: undefined }` — so the ledger normalizes them away at the point
 * it builds the record rather than letting canonicalization fail later. A record the
 * ledger did *not* build is rejected with `schema.undefined_value` instead of normalized.
 */
function withoutUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => withoutUndefined(item)) as unknown as T;
  }
  if (typeof value !== 'object' || value === null) return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (item !== undefined) out[key] = withoutUndefined(item);
  }
  return out as T;
}

export class Store extends LedgerStore {
  /** Open an existing ledger (fails closed on any mismatch). */
  static async open(projectRoot = process.cwd()): Promise<Store> {
    const store = new Store(projectRoot);
    await store.load();
    return store;
  }

  /** Initialize a fresh ledger under `projectRoot`. */
  static async init(projectRoot: string, options?: InitOptions): Promise<Store> {
    const store = new Store(projectRoot);
    await store.initialize(options);
    return store;
  }

  /** Override the actor recorded as the mutation submitter in `provenance.submitted_by`. */
  setSubmitter(actor: Actor): void {
    this.submitter = actor;
  }

  // -- Bootstrap (Topic / Task / Workspace / bindings) -----------------------
  //
  // SPEC §5.3: "Topic is required in v1 — a single-topic project still has one explicit
  // Topic, not a topicless mode." A Declaration needs a Task and a dispatch needs a
  // Workspace, so `init` alone cannot reach `declare`/`dispatch` without these.

  createTopic(
    input: CreateTopicInput,
    expectedRevision?: number,
  ): Promise<MutationOutcome<{ topic: Topic }>> {
    const topic: Topic = {
      topic_id: newId('top_'),
      project_id: this.projectId(this.currentSnapshot()),
      name: input.name,
      goal: input.goal,
      created_by: input.created_by,
      created_at: input.created_at !== undefined ? input.created_at : nowIso(),
    };
    return this.submit([topic], expectedRevision, { topic });
  }

  /**
   * Create a Task with a canonical ID and an optional local human alias.
   *
   * SPEC §4.2: the alias is a display convenience carried on the Task record; every
   * cross-record reference uses the canonical `tsk_` id, never the alias.
   */
  createTask(
    input: CreateTaskInput,
    expectedRevision?: number,
  ): Promise<MutationOutcome<{ task: Task }>> {
    const task: Task = {
      task_id: newId('tsk_'),
      topic_id: input.topic_id,
      title: input.title,
    };
    if (input.alias) task.alias = input.alias;
    return this.submit([task], expectedRevision, { task });
  }

  /**
   * Register a portable Workspace under an existing Repository.
   *
   * SPEC §5.2: a Workspace record carries non-machine-specific hints (intended branch/ref)
   * but never an absolute path — the path is a separate machine-local binding.
   */
  registerWorkspace(
    input: RegisterWorkspaceInput,
    expectedRevision?: number,
  ): Promise<MutationOutcome<{ workspace: Workspace }>> {
    const workspace: Workspace = {
      workspace_id: newId('wsp_'),
      repository_id: input.repository_id,
    };
    if (input.branch) workspace.branch = input.branch;
    if (input.ref) workspace.ref = input.ref;
    return this.submit([workspace], expectedRevision, { workspace });
  }

  /**
   * Bind a Workspace to a local path in the machine-local `runtime/bindings.json`.
   *
   * This is not a ledger mutation: it writes no record and does not advance the revision.
   * SPEC §5.2 — "Absolute paths live only in the machine-local binding, never in a
   * committable file." The Repository and Workspace must already exist in the canonical
   * graph, and the Workspace must belong to that Repository, so a binding can never assert
   * an identity the ledger does not have.
   */
  async bindWorkspace(input: BindWorkspaceInput): Promise<MutationOutcome<{ root: string }>> {
    const snapshot = this.currentSnapshot();
    const repository = snapshot.repositories.find((r) => r.repository_id === input.repository_id);
    if (!repository) {
      return {
        ok: false,
        code: 'invariant.reference_unresolved',
        message: `no Repository ${input.repository_id} in this ledger`,
      };
    }
    const workspace = snapshot.workspaces.find((w) => w.workspace_id === input.workspace_id);
    if (!workspace) {
      return {
        ok: false,
        code: 'invariant.reference_unresolved',
        message: `no Workspace ${input.workspace_id} in this ledger`,
      };
    }
    if (workspace.repository_id !== input.repository_id) {
      return {
        ok: false,
        code: 'invariant.reference_inconsistent',
        message: `workspace ${input.workspace_id} belongs to repository ${workspace.repository_id}`,
      };
    }
    return this.withLock(async () => {
      const bindings: Bindings = await readBindings(this.root);
      const repoEntry = bindings.repositories[input.repository_id] ?? { workspaces: {} };
      repoEntry.workspaces[input.workspace_id] = { root: input.root };
      bindings.repositories[input.repository_id] = repoEntry;
      await writeBindings(this.root, bindings);
      return { ok: true, revision: this.currentRevision(), root: input.root } as const;
    });
  }

  /** The machine-local bindings, validated against `bindings.schema.json`. */
  async bindings(): Promise<Bindings> {
    return readBindings(this.root);
  }

  // -- Read accessors --------------------------------------------------------

  listRepositories(): readonly Repository[] {
    return this.currentSnapshot().repositories;
  }

  listWorkspaces(): readonly Workspace[] {
    return this.currentSnapshot().workspaces;
  }

  listTopics(): readonly Topic[] {
    return this.currentSnapshot().topics;
  }

  listTasks(): readonly Task[] {
    return this.currentSnapshot().tasks;
  }

  /**
   * Resolve a local human alias (e.g. `T1`) to its canonical `tsk_` id.
   *
   * Aliases are a local display affordance: they are resolved *here*, at the edge, and
   * only the canonical id crosses into a record. An ambiguous alias resolves to nothing
   * rather than to an arbitrary Task.
   */
  resolveTaskAlias(alias: string): string | null {
    const matches = this.currentSnapshot().tasks.filter((t) => t.alias === alias);
    return matches.length === 1 ? (matches[0] as Task).task_id : null;
  }

  /** Resolve a `tsk_` id or a local alias to a canonical `tsk_` id. */
  resolveTaskRef(ref: string): string | null {
    if (this.currentSnapshot().tasks.some((t) => t.task_id === ref)) return ref;
    return this.resolveTaskAlias(ref);
  }

  // -- Declare -------------------------------------------------------------

  declare(
    input: DeclareInput,
    expectedRevision?: number,
  ): Promise<MutationOutcome<{ declaration: TaskDeclaration }>> {
    const declaration: TaskDeclaration = {
      declaration_id: newId('dcl_'),
      task_id: input.task_id,
      declared_by: input.declared_by,
      declared_at: input.declared_at !== undefined ? input.declared_at : nowIso(),
      objective: input.objective,
      criteria: input.criteria.map((c) => ({
        criterion_id: c.criterion_id ?? newId('cri_'),
        code: c.code,
        statement: c.statement,
        required: c.required ?? true,
      })),
    };
    if (input.supersedes) declaration.supersedes = input.supersedes;
    // `declaration.criteria` is a registered `set` array keyed by criterion_id; a producer
    // emits it already canonical (contract/canonicalization.json, SPEC §10).
    canonicalizeSetArraysInRecord(declaration);
    return this.submit([declaration], expectedRevision, { declaration });
  }

  // -- Dispatch -------------------------------------------------------------

  dispatch(
    input: DispatchInput,
    expectedRevision?: number,
  ): Promise<MutationOutcome<{ attempt: Attempt }>> {
    const attempt: Attempt = {
      attempt_id: newId('att_'),
      task_id: input.task_id,
      declaration_id: input.declaration_id,
      repository_id: input.repository_id,
      workspace_id: input.workspace_id,
      executor: input.executor,
      dispatched_by: input.dispatched_by,
      dispatched_at: input.dispatched_at !== undefined ? input.dispatched_at : nowIso(),
    };
    if (input.session_id) attempt.session_id = input.session_id;
    return this.submit([attempt], expectedRevision, { attempt });
  }

  // -- Observe --------------------------------------------------------------

  endAttempt(
    input: EndAttemptInput,
    expectedRevision?: number,
  ): Promise<MutationOutcome<{ attempt_end: AttemptEnd }>> {
    const attemptEnd: AttemptEnd = {
      attempt_end_id: newId('ate_'),
      attempt_id: input.attempt_id,
      outcome: input.outcome,
      reported_by: input.reported_by,
      ended_at: input.ended_at !== undefined ? input.ended_at : nowIso(),
    };
    if (input.reason) attemptEnd.reason = input.reason;
    if (input.supersedes) attemptEnd.supersedes = input.supersedes;
    return this.submit([attemptEnd], expectedRevision, { attempt_end: attemptEnd });
  }

  observeClaim(
    input: ObserveClaimInput,
    expectedRevision?: number,
  ): Promise<MutationOutcome<{ claim: Claim }>> {
    const claim: Claim = {
      claim_id: newId('clm_'),
      task_id: input.task_id,
      attempt_id: input.attempt_id,
      declaration_id: input.declaration_id,
      statement: input.statement,
      evidence_ids: input.evidence_ids ?? [],
      claimed_by: input.claimed_by,
      claimed_at: input.claimed_at !== undefined ? input.claimed_at : nowIso(),
    };
    canonicalizeSetArraysInRecord(claim);
    return this.submit([claim], expectedRevision, { claim });
  }

  observeEvidence(
    input: ObserveEvidenceInput,
    expectedRevision?: number,
  ): Promise<MutationOutcome<{ evidence: Evidence }>> {
    // Payload/kind pairing is enforced by the contract validator at append; the ledger
    // constructs the record and lets `validate_append` reject mismatched payloads.
    const evidence = withoutUndefined({
      ...input,
      evidence_id: newId('evi_'),
      submitted_at: input.submitted_at !== undefined ? input.submitted_at : nowIso(),
    }) as Evidence;
    return this.submit([evidence], expectedRevision, { evidence });
  }

  raiseBlocker(
    input: RaiseBlockerInput,
    expectedRevision?: number,
  ): Promise<MutationOutcome<{ blocker: Blocker }>> {
    const blocker: Blocker = {
      blocker_id: newId('blk_'),
      task_id: input.task_id,
      description: input.description,
      raised_by: input.raised_by,
      raised_at: input.raised_at !== undefined ? input.raised_at : nowIso(),
    };
    if (input.attempt_id) blocker.attempt_id = input.attempt_id;
    return this.submit([blocker], expectedRevision, { blocker });
  }

  resolveBlocker(
    input: ResolveBlockerInput,
    expectedRevision?: number,
  ): Promise<MutationOutcome<{ blocker_resolution: BlockerResolution }>> {
    const resolution: BlockerResolution = {
      blocker_resolution_id: newId('brs_'),
      blocker_id: input.blocker_id,
      disposition: input.disposition,
      resolved_by: input.resolved_by,
      resolved_at: input.resolved_at !== undefined ? input.resolved_at : nowIso(),
    };
    if (input.explanation) resolution.explanation = input.explanation;
    if (input.evidence_ids) resolution.evidence_ids = input.evidence_ids;
    if (input.supersedes) resolution.supersedes = input.supersedes;
    canonicalizeSetArraysInRecord(resolution);
    return this.submit([resolution], expectedRevision, { blocker_resolution: resolution });
  }

  // -- Settle ---------------------------------------------------------------

  settle(
    input: SettleInput,
    expectedRevision?: number,
  ): Promise<MutationOutcome<{ settlement: Settlement }>> {
    const settlement: Settlement = {
      settlement_id: newId('set_'),
      task_id: input.task_id,
      attempt_id: input.attempt_id,
      decision: input.decision,
      decided_by: input.decided_by,
      decided_at: input.decided_at !== undefined ? input.decided_at : nowIso(),
      basis: input.basis,
      rationale: input.rationale,
    };
    if (input.verification_exception !== undefined) {
      settlement.verification_exception = input.verification_exception;
    }
    if (input.supersedes) settlement.supersedes = input.supersedes;
    canonicalizeSetArraysInRecord(settlement);
    return this.submit([settlement], expectedRevision, { settlement });
  }

  recordDecision(
    input: RecordDecisionInput,
    expectedRevision?: number,
  ): Promise<MutationOutcome<{ decision: Decision }>> {
    const decision: Decision = {
      decision_id: newId('dec_'),
      subject: input.subject,
      role: input.role,
      question: input.question,
      choice: input.choice,
      rationale: input.rationale,
      decided_by: input.decided_by,
      decided_at: input.decided_at !== undefined ? input.decided_at : nowIso(),
    };
    if (input.basis) decision.basis = input.basis;
    if (input.supersedes) decision.supersedes = input.supersedes;
    return this.submit([decision], expectedRevision, { decision });
  }

  // -- Verify (Check boundary) ---------------------------------------------

  /**
   * Record an invoker-produced CheckInvocation against the current snapshot and advance
   * the revision. Returns the frozen evaluation input (the invocation id + the
   * `evaluated_snapshot` the invocation asserts it evaluated). Throws `StoreError` on a
   * revision conflict (Check's `beginCheck` does not retry this phase).
   */
  async beginCheck(
    invocation: CheckInvocation,
    expectedRevision: number,
  ): Promise<BeginCheckResult> {
    const operation: AppendOperation = {
      kind: 'append_records',
      expected_revision: expectedRevision,
      records: [invocation],
      provenance: { submitted_by: this.submitter },
    };
    const result = await this.append(operation);
    if (!result.ok) {
      throw new StoreError(result.code, result.message);
    }
    return {
      check_invocation_id: invocation.check_invocation_id,
      evaluated_snapshot: invocation.evaluated_snapshot,
    };
  }

  /**
   * Validate + atomically ingest a Check result bundle (CheckResult + Reconciliations +
   * produced Evidence + optional Verdict) under the current expected revision. Returns
   * `{ ok, revision, code? }`; never throws — a failed transition is an ordinary outcome.
   */
  async recordCheckOutput(
    bundle: CheckResultBundle,
    expectedRevision: number,
  ): Promise<RecordCheckOutputResult> {
    const records: AnyRecord[] = [
      bundle.check_result,
      ...bundle.reconciliations,
      ...bundle.produced_evidence,
    ];
    if (bundle.verdict) records.push(bundle.verdict);

    const operation: AppendOperation = {
      kind: 'append_records',
      expected_revision: expectedRevision,
      records,
      provenance: { submitted_by: this.submitter },
    };
    const result = await this.append(operation);
    if (!result.ok) {
      return { ok: false, revision: this.currentRevision(), code: result.code };
    }
    return { ok: true, revision: result.revision };
  }

  /**
   * Begin a Check from structured inputs: the Store freezes the evaluated snapshot itself
   * and produces the `chk_` record.
   *
   * SPEC §8.2 — a checker is a **named, installed provider interface** referenced by
   * stable id + version. No command string is accepted here, or anywhere else, because
   * Tallyback holds no shell authority to hand one to.
   */
  async beginCheckFor(
    input: BeginCheckForInput,
  ): Promise<
    MutationOutcome<{ invocation: CheckInvocation; evaluated_snapshot: EvaluatedSnapshot }>
  > {
    const snapshot = this.currentSnapshot();
    if (!snapshot.claims.some((c) => c.claim_id === input.claim_id)) {
      return {
        ok: false,
        code: 'invariant.reference_unresolved',
        message: `no Claim ${input.claim_id} in this ledger`,
      };
    }
    // A caller-supplied `expected_revision` is a pre-flight assertion ("I read the ledger
    // at revision X"), checked against the snapshot this method is about to hash. It is
    // NEVER passed through to the append as the revision to submit at — see below.
    if (input.expected_revision !== undefined && input.expected_revision !== snapshot.revision) {
      return {
        ok: false,
        code: 'mutation.revision_conflict',
        message: `expected revision ${input.expected_revision} does not match current ${snapshot.revision}`,
      };
    }
    const evaluated_snapshot: EvaluatedSnapshot = {
      project_id: this.projectId(snapshot),
      revision: snapshot.revision,
      digest: snapshotDigest(snapshot),
    };
    const invocation: CheckInvocation = {
      check_invocation_id: newId('chk_'),
      subject: { kind: 'claim', id: input.claim_id },
      checker: input.checker,
      evaluated_snapshot,
      invoked_by: input.invoked_by ?? { kind: 'tool', id: 'tallyback-check' },
      invoked_at: input.invoked_at !== undefined ? input.invoked_at : nowIso(),
    };
    // Pin the append to EXACTLY `snapshot.revision` — the revision `evaluated_snapshot`
    // was hashed from. Leaving this unpinned (as `submit`'s "append at current" default
    // does for every OTHER command) would let another writer advance the ledger between
    // the read above and the lock this append takes; the invocation would then land at
    // whatever revision is current *inside* the lock while its own `evaluated_snapshot`
    // still names the older one it actually hashed — a recorded observation about a
    // snapshot body the Store no longer retains anywhere. A concurrent writer must
    // instead force this to `mutation.revision_conflict`, exactly as `Check`'s own
    // `beginCheck` (src/check/flow.ts) already does by passing its read revision through.
    return this.submit([invocation], snapshot.revision, { invocation, evaluated_snapshot });
  }

  /**
   * Assemble and record a Check result from structured inputs, retrying an ordinary
   * revision conflict against a freshly read revision.
   *
   * SPEC §8.1: the frozen `evaluated_snapshot` is never rewritten on retry — an unrelated
   * writer advancing the ledger does not invalidate a historical observation, it only
   * changes which revision the result is recorded *at*.
   */
  async recordCheckResult(
    input: RecordCheckResultInput,
  ): Promise<MutationOutcome<{ check_result: CheckResult; bundle: CheckResultBundle }>> {
    const reconciliations = input.reconciliations ?? [];
    const verdict = input.verdict ?? null;
    const check_result: CheckResult = {
      check_result_id: newId('ckr_'),
      check_invocation_id: input.check_invocation_id,
      outcome: input.outcome,
      produced_by: input.produced_by ?? { kind: 'tool', id: 'tallyback-check' },
      completed_at: input.completed_at !== undefined ? input.completed_at : nowIso(),
      diagnostics: input.diagnostics ?? [],
      reconciliation_ids: reconciliations.map((r) => r.reconciliation_id),
      verdict_id: verdict ? verdict.verdict_id : null,
    };
    canonicalizeSetArraysInRecord(check_result);
    const bundle: CheckResultBundle = {
      check_result,
      reconciliations,
      produced_evidence: input.produced_evidence ?? [],
      verdict,
    };

    const maxRetries = input.maxRetries ?? 5;
    let last: RecordCheckOutputResult = { ok: false, revision: this.currentRevision() };
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      last = await this.recordCheckOutput(bundle, this.currentRevision());
      if (last.ok) {
        return { ok: true, revision: last.revision, check_result, bundle };
      }
      if (last.code !== 'mutation.revision_conflict') break;
      await this.reload();
    }
    return {
      ok: false,
      code: last.code ?? 'mutation.revision_conflict',
      message: `recording the check result failed after ${maxRetries} retries`,
    };
  }

  // -- Internal -------------------------------------------------------------

  /**
   * Submit an append.
   *
   * When the caller pins `expectedRevision`, the strict optimistic check applies and a
   * ledger that moved underneath is rejected with `mutation.revision_conflict`. When they
   * do not, the revision is resolved *inside* the write lock against the on-disk snapshot,
   * so "append at current" means the committed current revision rather than this
   * instance's possibly-stale view.
   */
  private async submit<T extends object>(
    records: AnyRecord[],
    expectedRevision: number | undefined,
    success: T,
  ): Promise<MutationOutcome<T>> {
    const result = await this.appendAtCurrent(records, expectedRevision);
    if (!result.ok) return { ok: false, code: result.code, message: result.message };
    return { ok: true, revision: result.revision, ...success };
  }
}

// Re-export the engine error so callers can match on mutation codes (e.g. revision conflict).
export { StoreError };
