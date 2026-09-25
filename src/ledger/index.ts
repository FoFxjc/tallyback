/**
 * Ledger barrel — the Store is the sole writer of the ledger; Check is read-only.
 *
 * This barrel re-exports the Store API, the pure append/supersession/projection helpers,
 * the snapshot persistence surface, and the shared record types (from the contract, the
 * single source of truth for record shapes).
 */

// -- Store + command API ------------------------------------------------------

export { Store, StoreError } from './commands.js';
export type {
  BeginCheckResult,
  CriterionInput,
  DeclareInput,
  DispatchInput,
  EndAttemptInput,
  MutationFailure,
  MutationOutcome,
  MutationSuccess,
  ObserveClaimInput,
  ObserveEvidenceInput,
  RaiseBlockerInput,
  RecordCheckOutputResult,
  RecordDecisionInput,
  ResolveBlockerInput,
  SettleInput,
} from './commands.js';

export { LedgerStore } from './store.js';
export type { InitOptions, InitTopic } from './store.js';

// -- Diagnosis + pre-merge reconciliation (the paths `Store.open` deliberately refuses) --

export { diagnoseLedger } from './diagnose.js';
export type { DiagnosisLayer, LedgerDiagnosis, LedgerProblem } from './diagnose.js';
export { planReconciliation, reconcileLedger, RECONCILE_CODES } from './reconcile-heads.js';
export type { ReconcileOutcome, ReconcilePlan, ReconcileRewrite } from './reconcile-heads.js';

// -- Pure mutation core -------------------------------------------------------

export { applyAppend } from './append.js';
export type { AppendFailure, AppendResult, AppendSuccess } from './append.js';

// -- Projections --------------------------------------------------------------

export {
  computeProjections,
  computeProjectionValues,
  isLandSettlementVerificationReady,
  isPositiveVerification,
  isTaskStale,
  lastActivityAt,
  staleTaskIds,
  verdictClaimId,
  withProjections,
} from './projections.js';
export type { ProjectionValues, StalePolicy } from './projections.js';

// -- Supersession -------------------------------------------------------------

export {
  effectiveIds,
  effectiveRecords,
  findSupersessionCycle,
  getSupersedes,
  isSupersessionCapable,
  supersededIds,
  supersessionSubject,
  SUPERSESSION_CAPABLE_PREFIXES,
} from './supersession.js';

// -- Snapshot persistence + canonical digest ---------------------------------

export {
  ALL_RECORD_TYPES,
  allRecords,
  appendHistory,
  canonicalizeRecord,
  canonicalSnapshotForDigest,
  cloneSnapshot,
  DEFAULT_PROJECTION_POLICY,
  emptySnapshot,
  findProjectRoot,
  findRecord,
  getCollection,
  idPrefix,
  isCanonicalId,
  isLedgerAbsent,
  ledgerRoot,
  LEDGER_RECORD_TYPES,
  newId,
  nowIso,
  PROJECT_RECORD_TYPE,
  readBindings,
  readHistory,
  readProject,
  readSnapshot,
  RECORD_TYPE_BY_PREFIX,
  recordDigestHex,
  recordId,
  recordTypeOf,
  SCHEMA_VERSION,
  snapshotDigest,
  snapshotDigestHex,
  writeBindings,
  writeProject,
  writeSnapshot,
} from './snapshot.js';
export type {
  Bindings,
  CollectionKey,
  HistoryEntry,
  ProjectManifest,
  RecordTypeInfo,
  ValidationResult,
} from './snapshot.js';

// -- Shared record types (contract is the single source of truth) -------------

export type {
  Actor,
  ActorKind,
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
  ClaimSubject,
  Confidence,
  ConfidenceLevel,
  Criterion,
  Decision,
  DecisionRole,
  DecisionSubject,
  DecisionSubjectKind,
  Diagnostic,
  Digest,
  Disposition,
  EvaluatedSnapshot,
  Evidence,
  EvidenceKind,
  EvidencePayload,
  EvidencePayloadByKind,
  ExtensionPayload,
  Finality,
  Finding,
  FindingCode,
  NativeJudgment,
  ObservedContext,
  Project,
  Projections,
  Reconciliation,
  ReconciliationCheck,
  ReconciliationCheckOutcome,
  Repository,
  RepositoryRef,
  Settlement,
  SettlementBasis,
  SettlementDecision,
  Snapshot,
  Task,
  TaskDeclaration,
  Timestamp,
  Topic,
  Verdict,
  VerdictBasis,
  VerdictConclusion,
  VerdictScope,
  WorkingTreeState,
  Workspace,
} from '../contract/index.js';
