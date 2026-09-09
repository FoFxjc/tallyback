/**
 * Reference TypeScript types derived from the structural schemas.
 *
 * These are convenience types — NOT a second source of truth. The JSON Schemas under
 * `contract/schemas/` are authoritative for the wire contract; changing an interface here
 * alone does not change the contract. IDs are plain `string`s; prefix + UUIDv7 syntax is
 * enforced by the schemas and by `ids.ts`, not by the TypeScript type system.
 */

/** ISO-8601 timestamp. Nullable only for the legacy provenance variant (actor `unknown`). */
export type Timestamp = string | null;

export const ACTOR_KINDS = ['human', 'subagent', 'executor', 'tool', 'unknown', 'migrated'] as const;
export type ActorKind = (typeof ACTOR_KINDS)[number];

/** Shared provenance shape: `{ kind, id }`. */
export interface Actor {
  kind: ActorKind;
  id: string;
}

/** The shared digest object. The field shape never collapses to a bare hash string. */
export interface Digest {
  algorithm: 'sha-256';
  value: string;
}

export interface CheckerMeta {
  id: string;
  version: string;
}

/** The one explicitly open, namespaced checker-native extension boundary. */
export interface NativeJudgment {
  namespace: string;
  schema_version: string;
  payload: Record<string, unknown>;
}

export interface Diagnostic {
  code: string;
  message: string;
}

/** Scoped lineage identifier for a Criterion (nested inside a TaskDeclaration). */
export interface Criterion {
  criterion_id: string;
  code: string;
  statement: string;
  required: boolean;
}

export interface ClaimSubject {
  kind: 'claim';
  id: string;
}

export const DECISION_SUBJECT_KINDS = ['project', 'topic', 'task', 'attempt'] as const;
export type DecisionSubjectKind = (typeof DECISION_SUBJECT_KINDS)[number];

export interface DecisionSubject {
  kind: DecisionSubjectKind;
  id: string;
}

export interface RepositoryRef {
  repository_id: string;
  alias: string;
}

export interface Project {
  project_id: string;
  repositories: RepositoryRef[];
}

export interface Repository {
  repository_id: string;
  alias: string;
}

export interface Workspace {
  workspace_id: string;
  repository_id: string;
  /** Portable branch/ref hints — never absolute paths. */
  branch?: string;
  ref?: string;
}

export interface Topic {
  topic_id: string;
  project_id: string;
  name: string;
  goal: string;
  created_by: Actor;
  created_at: Timestamp;
}

export interface Task {
  task_id: string;
  topic_id: string;
  title: string;
  /** Mutable, store-local alias — never identity. */
  alias?: string;
}

export interface TaskDeclaration {
  declaration_id: string;
  task_id: string;
  declared_by: Actor;
  declared_at: Timestamp;
  objective: string;
  criteria: Criterion[];
  supersedes?: string;
}

export interface Attempt {
  attempt_id: string;
  task_id: string;
  declaration_id: string;
  repository_id: string;
  workspace_id: string;
  executor: Actor;
  dispatched_by: Actor;
  dispatched_at: Timestamp;
  session_id?: string;
}

export const ATTEMPT_END_OUTCOMES = ['returned', 'failed', 'cancelled'] as const;
export type AttemptEndOutcome = (typeof ATTEMPT_END_OUTCOMES)[number];

export interface AttemptEnd {
  attempt_end_id: string;
  attempt_id: string;
  outcome: AttemptEndOutcome;
  reported_by: Actor;
  ended_at: Timestamp;
  reason?: string;
  supersedes?: string;
}

export interface Claim {
  claim_id: string;
  task_id: string;
  attempt_id: string;
  declaration_id: string;
  statement: string;
  evidence_ids: string[];
  claimed_by: Actor;
  claimed_at: Timestamp;
}

export type EvidenceKind =
  | 'git_commit'
  | 'git_diff'
  | 'file_snapshot'
  | 'command_run'
  | 'test_run'
  | 'artifact'
  | 'observation'
  | 'extension';

export type WorkingTreeState = 'clean' | 'dirty';

export interface GitCommitPayload {
  repository_id: string;
  object_id: string;
  object_format: 'sha1' | 'sha256';
}

export interface GitDiffPayload {
  repository_id: string;
  base_object_id?: string;
  head_object_id?: string;
  path?: string;
  digest?: Digest;
}

export interface FileSnapshotPayload {
  repository_id: string;
  object_id?: string;
  path: string;
  digest?: Digest;
}

export interface CommandRunPayload {
  command: string;
  exit_code: number;
  started_at?: Timestamp;
  finished_at?: Timestamp;
  repository_id?: string;
  workspace_id?: string;
  working_tree?: WorkingTreeState;
  output_digest?: Digest;
}

export interface TestRunPayload {
  command?: string;
  exit_code: number;
  started_at?: Timestamp;
  finished_at?: Timestamp;
  repository_id?: string;
  workspace_id?: string;
  working_tree?: WorkingTreeState;
  output_digest?: Digest;
}

export interface ArtifactPayload {
  locator?: string;
  digest?: Digest;
}

export interface ObservationPayload {
  observer?: Actor;
  observed_at?: Timestamp;
  text: string;
}

export interface ExtensionPayload {
  namespace: string;
  extension_kind: string;
  ref: { evidence_id: string };
}

export interface EvidencePayloadByKind {
  git_commit: GitCommitPayload;
  git_diff: GitDiffPayload;
  file_snapshot: FileSnapshotPayload;
  command_run: CommandRunPayload;
  test_run: TestRunPayload;
  artifact: ArtifactPayload;
  observation: ObservationPayload;
  extension: ExtensionPayload;
}

export type EvidencePayload = EvidencePayloadByKind[EvidenceKind];

export type Evidence = {
  evidence_id: string;
  submitted_by: Actor;
  submitted_at: Timestamp;
  note?: string;
} & {
  [K in EvidenceKind]: { kind: K; payload: EvidencePayloadByKind[K] };
}[EvidenceKind];

export interface Method {
  name: string;
  version: string;
}

export interface ObservedContext {
  repository_id: string;
  workspace_id?: string;
  head_oid?: string;
  tree_oid?: string;
  index_oid?: string;
  working_tree?: WorkingTreeState;
  worktree_fingerprint?: string;
}

export type ReconciliationCheckOutcome = 'confirmed' | 'mismatch' | 'unresolved';

export interface ReconciliationCheck {
  predicate: string;
  outcome: ReconciliationCheckOutcome;
  observed?: Record<string, unknown>;
  reason?: string;
}

export interface Reconciliation {
  reconciliation_id: string;
  evidence_id: string;
  checked_by: Actor;
  checked_at: Timestamp;
  method: Method;
  observed_context: ObservedContext;
  checks: ReconciliationCheck[];
  limitations: string[];
  supersedes?: string;
}

export interface EvaluatedSnapshot {
  project_id: string;
  revision: number;
  digest: Digest;
}

export interface CheckInvocation {
  check_invocation_id: string;
  subject: ClaimSubject;
  checker: CheckerMeta;
  evaluated_snapshot: EvaluatedSnapshot;
  invoked_by: Actor;
  invoked_at: Timestamp;
}

export const CHECK_RESULT_OUTCOMES = ['verdict_emitted', 'verdict_withheld', 'check_failed'] as const;
export type CheckResultOutcome = (typeof CHECK_RESULT_OUTCOMES)[number];

export interface CheckResult {
  check_result_id: string;
  check_invocation_id: string;
  outcome: CheckResultOutcome;
  produced_by: Actor;
  completed_at: Timestamp;
  diagnostics?: Diagnostic[];
  reconciliation_ids?: string[];
  verdict_id?: string | null;
}

export type VerdictConclusion = 'supported' | 'partially_supported' | 'unsupported' | 'contradicted';
export type Finality = 'preliminary' | 'final';
export type ConfidenceLevel = 'low' | 'medium' | 'high';
export type FindingCode =
  | 'insufficient_evidence'
  | 'scope_gap'
  | 'missing_implementation'
  | 'non_operational'
  | 'drift'
  | 'conflicting_evidence';

export interface Finding {
  criterion_id: string;
  assessment: VerdictConclusion;
  code?: FindingCode;
  summary: string;
  basis_refs: string[];
}

export interface VerdictScope {
  evaluated_criteria: string[];
  unevaluated_criteria: string[];
}

export interface VerdictBasis {
  evidence_ids: string[];
  reconciliation_ids: string[];
}

export interface Confidence {
  level: ConfidenceLevel;
  rationale: string;
}

export interface Verdict {
  verdict_id: string;
  subject: ClaimSubject;
  declaration_id: string;
  scope: VerdictScope;
  conclusion: VerdictConclusion;
  finality: Finality;
  basis: VerdictBasis;
  findings: Finding[];
  confidence: Confidence;
  rationale: string;
  uncertainty: string[];
  limitations: string[];
  issued_by: Actor;
  issued_at: Timestamp;
  checker?: CheckerMeta;
  native_judgment?: NativeJudgment;
}

export const SETTLEMENT_DECISIONS = ['accept', 'retry', 'abandon', 'land'] as const;
export type SettlementDecision = (typeof SETTLEMENT_DECISIONS)[number];

export interface SettlementBasis {
  verdict_id?: string | null;
  attempt_end_id?: string | null;
  blocker_ids?: string[];
}

export interface Settlement {
  settlement_id: string;
  task_id: string;
  attempt_id: string;
  decision: SettlementDecision;
  decided_by: Actor;
  decided_at: Timestamp;
  basis: SettlementBasis;
  verification_exception?: string | null;
  rationale: string;
  supersedes?: string;
}

export interface Blocker {
  blocker_id: string;
  task_id: string;
  attempt_id?: string;
  description: string;
  raised_by: Actor;
  raised_at: Timestamp;
}

export const DISPOSITIONS = ['resolved', 'withdrawn'] as const;
export type Disposition = (typeof DISPOSITIONS)[number];

export interface BlockerResolution {
  blocker_resolution_id: string;
  blocker_id: string;
  disposition: Disposition;
  resolved_by: Actor;
  resolved_at: Timestamp;
  explanation?: string;
  evidence_ids?: string[];
  supersedes?: string;
}

export const DECISION_ROLES = ['execution_choice', 'next_action'] as const;
export type DecisionRole = (typeof DECISION_ROLES)[number];

export interface Decision {
  decision_id: string;
  subject: DecisionSubject;
  role: DecisionRole;
  question: string;
  choice: string;
  rationale: string;
  decided_by: Actor;
  decided_at: Timestamp;
  basis?: string[];
  supersedes?: string;
}

/** Union of the 18 top-level canonical record types. */
export type AnyRecord =
  | Project
  | Repository
  | Workspace
  | Topic
  | Task
  | TaskDeclaration
  | Attempt
  | AttemptEnd
  | Claim
  | Evidence
  | Reconciliation
  | CheckInvocation
  | CheckResult
  | Verdict
  | Settlement
  | Blocker
  | BlockerResolution
  | Decision;

export interface Projections {
  computed_from_revision: number;
  policy_id: string;
  values: Record<string, unknown>;
}

/** The portable canonical semantic snapshot (`state.json`). */
export interface Snapshot {
  schema_version: '1.0.0';
  revision: number;
  included_through: number;
  project: Project;
  repositories: Repository[];
  workspaces: Workspace[];
  topics: Topic[];
  tasks: Task[];
  declarations: TaskDeclaration[];
  attempts: Attempt[];
  attempt_ends: AttemptEnd[];
  claims: Claim[];
  evidence: Evidence[];
  reconciliations: Reconciliation[];
  check_invocations: CheckInvocation[];
  check_results: CheckResult[];
  verdicts: Verdict[];
  settlements: Settlement[];
  blockers: Blocker[];
  blocker_resolutions: BlockerResolution[];
  decisions: Decision[];
  projections?: Projections;
}

/** A single mutation submitted to `validate_append` / `record_check_output`. */
export interface AppendOperation {
  kind: 'append_records';
  expected_revision: number;
  records: AnyRecord[];
  provenance: { submitted_by: Actor };
}

/**
 * The self-contained result bundle a Check emits (never writes to the ledger itself).
 * `verdict` is absent (or null) when Check withholds (e.g. missing acceptance semantics).
 */
export interface CheckResultBundle {
  check_result: CheckResult;
  produced_evidence: Evidence[];
  reconciliations: Reconciliation[];
  verdict?: Verdict | null;
}
