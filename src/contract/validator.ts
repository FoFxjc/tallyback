/**
 * Reference validator: the two contract entry points.
 *
 * - `validate_snapshot(snapshot)` — structural (JSON Schema) + canonical-serialization +
 *   referential validity of a final snapshot.
 * - `validate_append(current, operation)` — transition validity: optimistic revision
 *   check, id immutability/collision/replay, lifecycle guards, result-bundle atomicity,
 *   and the candidate graph validated as a whole against the same referential rules.
 *
 * The JSON Schemas under `contract/schemas/` are authoritative for structure,
 * `contract/canonicalization.json` for `set`-array canonicalization, and
 * `contract/invariants.json` for the graph/lifecycle rule catalog this module implements.
 * Violation codes stay in their layers (`schema.*` malformed wire data,
 * `invariant.*` invalid graph/lifecycle, `mutation.*` transaction/concurrency) per SPEC §11.
 *
 * Reference integrity is **typed**: a reference is valid only when it resolves to an
 * entity of the expected record type, and — where the contract binds two records to a
 * shared lineage — when the resolved entity's own anchors agree. An ID that merely exists
 * somewhere in the graph is never enough.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ajv2020, type AnySchema } from 'ajv/dist/2020.js';

import {
  checkRecordsSetArrays,
  checkSnapshotSetArrays,
  findAbsolutePath,
} from './canonical-arrays.js';
import { findSupersessionConflicts, supersessionSubjectKey } from './supersession.js';
import { canonicalizeJson } from './jcs.js';
import { isValidId } from './ids.js';
import {
  allSnapshotRecords as allRecords,
  recordIdOf as recordId,
  recordTypeOf,
} from './record-types.js';
import type { AnyRecord, AppendOperation, Snapshot } from './types.js';

/** A validation outcome shared by `validate_snapshot` / `validate_append`. */
export type ValidationResult =
  | { ok: true }
  | { ok: false; code: string; message?: string; details?: unknown };

const okResult = (): ValidationResult => ({ ok: true });
const failResult = (code: string, message?: string, details?: unknown): ValidationResult => ({
  ok: false,
  code,
  message,
  details,
});

// The record-type registry stays module-private here: the ledger publishes its own richer
// registry under the same names, and the public barrel must not carry two symbols with
// one name. `src/contract/record-types.ts` is the single definition both layers derive from.

const EVIDENCE_KINDS = new Set([
  'git_commit',
  'git_diff',
  'file_snapshot',
  'command_run',
  'test_run',
  'artifact',
  'observation',
  'extension',
]);

type AnyObject = Record<string, unknown>;

function field(record: unknown, name: string): unknown {
  return typeof record === 'object' && record !== null
    ? (record as AnyObject)[name]
    : undefined;
}

function strField(record: unknown, name: string): string | null {
  const v = field(record, name);
  return typeof v === 'string' ? v : null;
}

function strArrayField(record: unknown, name: string): string[] {
  const v = field(record, name);
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

// ---------------------------------------------------------------------------
// Graph context
// ---------------------------------------------------------------------------

interface GraphContext {
  records: AnyRecord[];
  byId: Map<string, AnyRecord>;
  /** id → canonical record-type name, so every reference can be resolved *typed*. */
  typeById: Map<string, string>;
  /**
   * declaration_id → the criterion ids that declaration defines.
   *
   * A Criterion's immutable definition is identified by the pair
   * `(declaration_id, criterion_id)` (SPEC §5.4). A criterion may deliberately retain its
   * `criterion_id` across a superseding declaration when it is the same conceptual
   * requirement, so criteria are indexed **per declaration** — never through a single
   * global `criterion_id → declaration_id` map, which would silently re-point a historical
   * Verdict at whichever declaration happened to be indexed last.
   */
  declarationCriteria: Map<string, Set<string>>;
  /** criterion_id → every declaration that defines it (existence, not ownership). */
  criterionDeclarations: Map<string, Set<string>>;
}

function buildGraph(records: AnyRecord[]): GraphContext {
  const byId = new Map<string, AnyRecord>();
  const typeById = new Map<string, string>();
  const declarationCriteria = new Map<string, Set<string>>();
  const criterionDeclarations = new Map<string, Set<string>>();
  for (const rec of records) {
    const info = recordTypeOf(rec);
    const id = recordId(rec);
    if (id !== null) {
      byId.set(id, rec);
      if (info) typeById.set(id, info.type);
    }
    if (info?.type === 'declaration') {
      const declId = strField(rec, 'declaration_id');
      const criteria = field(rec, 'criteria');
      if (declId !== null && Array.isArray(criteria)) {
        const owned = declarationCriteria.get(declId) ?? new Set<string>();
        for (const c of criteria) {
          const cid = strField(c, 'criterion_id');
          if (cid === null) continue;
          owned.add(cid);
          const declarations = criterionDeclarations.get(cid) ?? new Set<string>();
          declarations.add(declId);
          criterionDeclarations.set(cid, declarations);
        }
        declarationCriteria.set(declId, owned);
      }
    }
  }
  return { records, byId, typeById, declarationCriteria, criterionDeclarations };
}

/** Whether `id` resolves to any record in the graph. */
function resolve(ctx: GraphContext, id: string | null | undefined): boolean {
  return id != null && ctx.byId.has(id);
}

/** Whether `id` resolves to a record of exactly `type` (typed reference integrity). */
function resolvesAs(ctx: GraphContext, id: string | null | undefined, type: string): boolean {
  return id != null && ctx.typeById.get(id) === type;
}

/** Whether `id` resolves to a record of any one of `types`. */
function resolvesAsOneOf(ctx: GraphContext, id: string | null | undefined, types: string[]): boolean {
  if (id == null) return false;
  const actual = ctx.typeById.get(id);
  return actual !== undefined && types.includes(actual);
}

function recordsOfType(ctx: GraphContext, type: string): AnyRecord[] {
  return ctx.records.filter((rec) => recordTypeOf(rec)?.type === type);
}

/** Every criterion id referenced by a verdict's scope + findings, in order. */
function verdictCriterionRefs(rec: AnyRecord): string[] {
  const scope = field(rec, 'scope') as AnyObject | undefined;
  const findings = field(rec, 'findings');
  const refs: string[] = [];
  for (const key of ['evaluated_criteria', 'unevaluated_criteria']) {
    const arr = scope?.[key];
    if (Array.isArray(arr)) {
      for (const item of arr) {
        if (typeof item === 'string') refs.push(item);
      }
    }
  }
  if (Array.isArray(findings)) {
    for (const f of findings) {
      const cid = strField(f, 'criterion_id');
      if (cid !== null) refs.push(cid);
    }
  }
  return refs;
}

// ---------------------------------------------------------------------------
// Schema loading (Ajv 2020-12)
// ---------------------------------------------------------------------------

const CONTRACT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'contract');
const SCHEMA_DIR = join(CONTRACT_DIR, 'schemas');
const SNAPSHOT_SCHEMA_ID = 'urn:tallyback:contract:v1:snapshot.schema.json';
const APPEND_SCHEMA_ID = 'urn:tallyback:contract:v1:append-operation.schema.json';
const PROJECT_SCHEMA_ID = 'urn:tallyback:contract:v1:project.schema.json';
const BINDINGS_SCHEMA_ID = 'urn:tallyback:contract:v1:bindings.schema.json';
const MIGRATION_REPORT_SCHEMA_ID = 'urn:tallyback:contract:v1:migration-report.schema.json';

type SchemaValidator = ((data: unknown) => boolean) & {
  errors?: Array<{ instancePath?: string; message?: string }> | null;
};

interface CompiledValidators {
  snapshot: SchemaValidator;
  append: SchemaValidator;
  project: SchemaValidator;
  bindings: SchemaValidator;
  migrationReport: SchemaValidator;
}

let compiled: CompiledValidators | null = null;

function getCompiled(): CompiledValidators {
  if (compiled) return compiled;
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  const load = (name: string): AnySchema =>
    JSON.parse(readFileSync(join(SCHEMA_DIR, `${name}.schema.json`), 'utf8')) as AnySchema;
  ajv.addSchema(load('records'));
  ajv.addSchema(load('snapshot'));
  ajv.addSchema(load('append-operation'));
  ajv.addSchema(load('project'));
  ajv.addSchema(load('bindings'));
  ajv.addSchema(load('migration-report'));
  const get = (id: string): SchemaValidator => {
    const v = ajv.getSchema(id) as SchemaValidator | undefined;
    if (!v) throw new Error(`contract: failed to compile reference schema ${id}`);
    return v;
  };
  compiled = {
    snapshot: get(SNAPSHOT_SCHEMA_ID),
    append: get(APPEND_SCHEMA_ID),
    project: get(PROJECT_SCHEMA_ID),
    bindings: get(BINDINGS_SCHEMA_ID),
    migrationReport: get(MIGRATION_REPORT_SCHEMA_ID),
  };
  return compiled;
}

/** First schema error as a human-readable message. */
function firstSchemaError(v: SchemaValidator): string | undefined {
  const first = v.errors?.[0];
  if (!first) return undefined;
  return `${first.instancePath ?? '/'} ${first.message ?? 'invalid'}`.trim();
}

/**
 * Validate the portable project manifest (`project.json`) against its frozen schema.
 * Malformed identity data is wire data, so it fails with a `schema.*` code.
 */
export function validate_project_manifest(manifest: unknown): ValidationResult {
  const { project: validate } = getCompiled();
  if (!validate(manifest)) {
    return failResult(
      'schema.invalid_project_manifest',
      firstSchemaError(validate) ?? 'project.json is malformed',
    );
  }
  return okResult();
}

/** Validate the machine-local bindings file (`runtime/bindings.json`). */
export function validate_bindings(bindings: unknown): ValidationResult {
  const { bindings: validate } = getCompiled();
  if (!validate(bindings)) {
    return failResult(
      'schema.invalid_bindings',
      firstSchemaError(validate) ?? 'runtime/bindings.json is malformed',
    );
  }
  return okResult();
}

/** Validate a migration report against its frozen schema. */
export function validate_migration_report(report: unknown): ValidationResult {
  const { migrationReport: validate } = getCompiled();
  if (!validate(report)) {
    return failResult(
      'schema.invalid_migration_report',
      firstSchemaError(validate) ?? 'migration report is malformed',
    );
  }
  return okResult();
}

// ---------------------------------------------------------------------------
// Pre-schema structural guards (produce invariant/schema codes that the closed
// schema would otherwise report as a generic `unknown_property`).
// ---------------------------------------------------------------------------

/** TB-SUP-004: only supersession-capable record types may carry `supersedes`. */
function checkSupersedesCapability(records: AnyRecord[]): ValidationResult | null {
  for (const rec of records) {
    const info = recordTypeOf(rec);
    if (!info) continue;
    if (!info.supersessionCapable && 'supersedes' in rec) {
      return failResult(
        'invariant.supersession_unsupported',
        `${info.type} (${info.prefix}) is not supersession-capable and must not carry \`supersedes\``,
      );
    }
  }
  return null;
}

/** Closed evidence-kind guard: unknown kinds are malformed wire data. */
function checkEvidenceKinds(records: AnyRecord[]): ValidationResult | null {
  for (const rec of records) {
    if (recordTypeOf(rec)?.type !== 'evidence') continue;
    const kind = strField(rec, 'kind');
    if (kind !== null && !EVIDENCE_KINDS.has(kind)) {
      return failResult('schema.unknown_evidence_kind', `unknown evidence kind ${JSON.stringify(kind)}`);
    }
  }
  return null;
}

/**
 * JSON has no `undefined`. A property that is *present* with an `undefined` value is
 * neither absent nor a JSON value: JCS cannot serialize it, so it would otherwise reach
 * canonicalization and throw where an ordinary rejection belongs. It is malformed wire
 * data, reported as such.
 */
function checkNoUndefinedValues(records: AnyRecord[]): ValidationResult | null {
  const walk = (value: unknown, trail: string): string | null => {
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        if (value[i] === undefined) return `${trail}[${i}]`;
        const found = walk(value[i], `${trail}[${i}]`);
        if (found !== null) return found;
      }
      return null;
    }
    if (typeof value !== 'object' || value === null) return null;
    for (const [key, child] of Object.entries(value as AnyObject)) {
      const here = trail ? `${trail}.${key}` : key;
      if (child === undefined) return here;
      const found = walk(child, here);
      if (found !== null) return found;
    }
    return null;
  };
  for (const rec of records) {
    const at = walk(rec, '');
    if (at !== null) {
      return failResult(
        'schema.undefined_value',
        `${at} is present with an undefined value; omit the property instead`,
      );
    }
  }
  return null;
}

/**
 * Reject a Project record inside an append operation.
 *
 * `operation.records` is a bare array — nothing on the wire distinguishes "this is meant
 * to be appended to a collection" from "this happens to be schema-valid as a Project" —
 * so this has to be checked explicitly rather than left to `snapshotWithRecords` to
 * discover by throwing. Applies only to `validate_append`: `validate_snapshot` walks a
 * full `Snapshot`, whose singleton `project` field always legitimately exists there.
 */
function checkNoSingletonRecordsInAppend(records: AnyRecord[]): ValidationResult | null {
  for (const rec of records) {
    const info = recordTypeOf(rec);
    if (info?.type === 'project') {
      return failResult(
        'invariant.non_appendable_record',
        'a Project record cannot be appended: it is created once at init and never mutated through append_records',
      );
    }
  }
  return null;
}

/** Pre-schema guards, run before Ajv so they report their own codes. */
function preChecks(records: AnyRecord[]): ValidationResult | null {
  return (
    checkNoUndefinedValues(records) ??
    checkSupersedesCapability(records) ??
    checkEvidenceKinds(records)
  );
}

// ---------------------------------------------------------------------------
// Canonical serialization (SPEC §10 / contract/canonicalization.json)
// ---------------------------------------------------------------------------

/** TB-CAN-001 / TB-CAN-002 — every registered `set` array is sorted and duplicate-free. */
function checkRecordCanonicalArrays(records: readonly AnyRecord[]): ValidationResult | null {
  const violation = checkRecordsSetArrays(records);
  return violation ? failResult(violation.code, violation.message) : null;
}

/** TB-CAN-001 / TB-CAN-002 over a whole snapshot (collections included). */
function checkSnapshotCanonicalArrays(snapshot: Snapshot): ValidationResult | null {
  const violation = checkSnapshotSetArrays(snapshot);
  return violation ? failResult(violation.code, violation.message) : null;
}

// ---------------------------------------------------------------------------
// Graph / referential invariants (snapshot phase)
// ---------------------------------------------------------------------------

/** TB-REF-001 — a Verdict's subject, declaration, and criterion references all resolve. */
function checkVerdictScopeResolves(ctx: GraphContext): ValidationResult | null {
  for (const rec of recordsOfType(ctx, 'verdict')) {
    const subjectId = strField(field(rec, 'subject'), 'id');
    if (!resolvesAs(ctx, subjectId, 'claim')) {
      return failResult('invariant.verdict_scope_unresolved', 'verdict subject claim does not resolve');
    }
    if (!resolvesAs(ctx, strField(rec, 'declaration_id'), 'declaration')) {
      return failResult('invariant.verdict_scope_unresolved', 'verdict declaration_id does not resolve');
    }
    for (const cid of verdictCriterionRefs(rec)) {
      if (!ctx.criterionDeclarations.has(cid)) {
        return failResult('invariant.verdict_scope_unresolved', `criterion ${cid} does not resolve`);
      }
    }
  }
  return null;
}

/** TB-REF-002 — a Verdict's declaration matches its Claim's declaration. */
function checkVerdictDeclarationConsistent(ctx: GraphContext): ValidationResult | null {
  for (const rec of recordsOfType(ctx, 'verdict')) {
    const declId = strField(rec, 'declaration_id');
    const claimId = strField(field(rec, 'subject'), 'id');
    if (claimId === null) continue;
    const claim = ctx.byId.get(claimId);
    if (!claim) continue;
    if (strField(claim, 'declaration_id') !== declId) {
      return failResult('invariant.verdict_declaration_conflict', 'verdict declaration_id differs from claim declaration_id');
    }
  }
  return null;
}

/**
 * TB-REF-003 — criteria referenced by a Verdict belong to **that exact declaration**.
 *
 * Resolution is through the `(declaration_id, criterion_id)` pair, so a superseding
 * declaration that deliberately retains a `criterion_id` leaves the historical Verdict
 * valid against its own declaration, while a criterion defined only by some *other*
 * declaration still fails.
 */
function checkVerdictCriteriaBelong(ctx: GraphContext): ValidationResult | null {
  for (const rec of recordsOfType(ctx, 'verdict')) {
    const declId = strField(rec, 'declaration_id');
    if (declId === null) continue;
    const owned = ctx.declarationCriteria.get(declId);
    for (const cid of verdictCriterionRefs(rec)) {
      if (!owned?.has(cid)) {
        return failResult('invariant.verdict_foreign_criterion', `criterion ${cid} does not belong to declaration ${declId}`);
      }
    }
  }
  return null;
}

/** TB-REF-004 — Attempt and Claim references resolve, typed, and agree with each other. */
function checkAttemptClaimResolve(ctx: GraphContext): ValidationResult | null {
  for (const rec of ctx.records) {
    const type = recordTypeOf(rec)?.type;
    if (type === 'attempt') {
      const taskId = strField(rec, 'task_id');
      const declarationId = strField(rec, 'declaration_id');
      const repositoryId = strField(rec, 'repository_id');
      const workspaceId = strField(rec, 'workspace_id');
      if (
        !resolvesAs(ctx, taskId, 'task') ||
        !resolvesAs(ctx, declarationId, 'declaration') ||
        !resolvesAs(ctx, repositoryId, 'repository') ||
        !resolvesAs(ctx, workspaceId, 'workspace')
      ) {
        return failResult(
          'invariant.attempt_unresolved',
          'attempt references an unknown task, declaration, repository, or workspace',
        );
      }
    } else if (type === 'claim') {
      if (
        !resolvesAs(ctx, strField(rec, 'task_id'), 'task') ||
        !resolvesAs(ctx, strField(rec, 'attempt_id'), 'attempt') ||
        !resolvesAs(ctx, strField(rec, 'declaration_id'), 'declaration')
      ) {
        return failResult('invariant.attempt_unresolved', 'claim references an unknown task, attempt, or declaration');
      }
      for (const eid of strArrayField(rec, 'evidence_ids')) {
        if (!resolvesAs(ctx, eid, 'evidence')) {
          return failResult('invariant.attempt_unresolved', `claim references unknown evidence ${eid}`);
        }
      }
    }
  }
  return null;
}

/** TB-REF-005 — every `supersedes` target body is present. */
function checkSupersedesTargetPresent(ctx: GraphContext): ValidationResult | null {
  for (const rec of ctx.records) {
    if (recordTypeOf(rec)?.supersessionCapable !== true) continue;
    const target = strField(rec, 'supersedes');
    if (target !== null && !resolve(ctx, target)) {
      return failResult('invariant.dangling_supersession', `supersedes target ${target} is missing`);
    }
  }
  return null;
}

/** TB-REF-006 — Settlement basis references resolve, typed. */
function checkSettlementBasisResolves(ctx: GraphContext): ValidationResult | null {
  for (const rec of recordsOfType(ctx, 'settlement')) {
    const basis = field(rec, 'basis') as AnyObject | undefined;
    const verdictId = strField(basis, 'verdict_id');
    const attemptEndId = strField(basis, 'attempt_end_id');
    if (verdictId !== null && !resolvesAs(ctx, verdictId, 'verdict')) {
      return failResult('invariant.settlement_basis_unresolved', `settlement basis verdict ${verdictId} is missing`);
    }
    if (attemptEndId !== null && !resolvesAs(ctx, attemptEndId, 'attempt_end')) {
      return failResult('invariant.settlement_basis_unresolved', `settlement basis attempt_end ${attemptEndId} is missing`);
    }
    for (const bid of strArrayField(basis, 'blocker_ids')) {
      if (!resolvesAs(ctx, bid, 'blocker')) {
        return failResult('invariant.settlement_basis_unresolved', `settlement basis blocker ${bid} is missing`);
      }
    }
  }
  return null;
}

/** TB-REF-007 — Evidence payload repository/workspace references resolve, typed. */
function checkEvidenceReferencesResolve(ctx: GraphContext): ValidationResult | null {
  for (const rec of recordsOfType(ctx, 'evidence')) {
    const payload = field(rec, 'payload') as AnyObject | undefined;
    if (!payload) continue;
    const repositoryId = strField(payload, 'repository_id');
    const workspaceId = strField(payload, 'workspace_id');
    if (repositoryId !== null && !resolvesAs(ctx, repositoryId, 'repository')) {
      return failResult('invariant.evidence_reference_unresolved', `evidence repository ${repositoryId} is missing`);
    }
    if (workspaceId !== null && !resolvesAs(ctx, workspaceId, 'workspace')) {
      return failResult('invariant.evidence_reference_unresolved', `evidence workspace ${workspaceId} is missing`);
    }
    // An `extension` evidence is pointer-grounded: its referenced evidence must resolve.
    const ref = field(payload, 'ref');
    const refId = strField(ref, 'evidence_id');
    if (refId !== null && !resolvesAs(ctx, refId, 'evidence')) {
      return failResult('invariant.evidence_reference_unresolved', `extension evidence ref ${refId} is missing`);
    }
  }
  return null;
}

/** TB-REF-008 — a Decision subject resolves to an entity of its declared kind. */
function checkDecisionSubjectResolves(ctx: GraphContext): ValidationResult | null {
  const kindToType: Record<string, string> = {
    project: 'project',
    topic: 'topic',
    task: 'task',
    attempt: 'attempt',
  };
  for (const rec of recordsOfType(ctx, 'decision')) {
    const subject = field(rec, 'subject');
    const subjectId = strField(subject, 'id');
    const subjectKind = strField(subject, 'kind');
    if (subjectId === null || subjectKind === null) continue;
    const expected = kindToType[subjectKind];
    if (expected === undefined || !resolvesAs(ctx, subjectId, expected)) {
      return failResult(
        'invariant.decision_subject_unresolved',
        `decision subject ${subjectId} does not resolve to a ${subjectKind}`,
      );
    }
  }
  return null;
}

/**
 * TB-REF-010 — a CheckResult is consistent with its CheckInvocation.
 *
 * The invocation must exist, the emitted Verdict (when present) must judge the same
 * subject the invocation named and come from the same checker, and one invocation may
 * carry at most one result body in the graph.
 */
function checkCheckResultInvocation(ctx: GraphContext): ValidationResult | null {
  const seenInvocations = new Set<string>();
  for (const rec of recordsOfType(ctx, 'check_result')) {
    const invocationId = strField(rec, 'check_invocation_id');
    if (invocationId === null) continue;
    if (!resolvesAs(ctx, invocationId, 'check_invocation')) {
      return failResult(
        'invariant.check_result_invocation_mismatch',
        `check_result invocation ${invocationId} is missing`,
      );
    }
    if (seenInvocations.has(invocationId)) {
      return failResult(
        'invariant.check_result_already_recorded',
        `invocation ${invocationId} carries more than one check_result`,
      );
    }
    seenInvocations.add(invocationId);

    const invocation = ctx.byId.get(invocationId);
    const verdictId = strField(rec, 'verdict_id');
    if (verdictId === null) continue;
    const verdict = ctx.byId.get(verdictId);
    if (!verdict || recordTypeOf(verdict)?.type !== 'verdict') continue; // TB-REF-011 reports it

    const invocationSubject = strField(field(invocation, 'subject'), 'id');
    const verdictSubject = strField(field(verdict, 'subject'), 'id');
    if (invocationSubject !== verdictSubject) {
      return failResult(
        'invariant.check_result_invocation_mismatch',
        `verdict ${verdictId} judges ${String(verdictSubject)} but invocation ${invocationId} named ${String(invocationSubject)}`,
      );
    }
    const invocationChecker = field(invocation, 'checker');
    const verdictChecker = field(verdict, 'checker');
    if (verdictChecker !== undefined && canonicalizeJson(verdictChecker) !== canonicalizeJson(invocationChecker)) {
      return failResult(
        'invariant.check_result_invocation_mismatch',
        `verdict ${verdictId} names a different checker than invocation ${invocationId}`,
      );
    }
  }
  return null;
}

/** TB-REF-011 — every CheckResult reference resolves to a record of the expected type. */
function checkCheckResultReferences(ctx: GraphContext): ValidationResult | null {
  for (const rec of recordsOfType(ctx, 'check_result')) {
    for (const rid of strArrayField(rec, 'reconciliation_ids')) {
      if (!resolvesAs(ctx, rid, 'reconciliation')) {
        return failResult(
          'invariant.check_result_reference_unresolved',
          `check_result reconciliation ${rid} does not resolve to a Reconciliation`,
        );
      }
    }
    const verdictId = strField(rec, 'verdict_id');
    if (verdictId !== null && !resolvesAs(ctx, verdictId, 'verdict')) {
      return failResult(
        'invariant.check_result_reference_unresolved',
        `check_result verdict ${verdictId} does not resolve to a Verdict`,
      );
    }
  }
  return null;
}

/**
 * TB-REF-012 — a CheckResult's `outcome` agrees with its Verdict linkage.
 *
 * `verdict_emitted` requires exactly one resolved Verdict; `verdict_withheld` and
 * `check_failed` are meaningful model states that carry **no** Verdict, so `verdict_id`
 * must be null.
 */
function checkCheckResultOutcome(ctx: GraphContext): ValidationResult | null {
  for (const rec of recordsOfType(ctx, 'check_result')) {
    const outcome = strField(rec, 'outcome');
    const verdictId = strField(rec, 'verdict_id');
    if (outcome === 'verdict_emitted') {
      if (verdictId === null) {
        return failResult(
          'invariant.check_result_outcome_mismatch',
          'outcome verdict_emitted requires a non-null verdict_id',
        );
      }
      if (!resolvesAs(ctx, verdictId, 'verdict')) {
        return failResult(
          'invariant.check_result_outcome_mismatch',
          `outcome verdict_emitted requires exactly one resolved Verdict; ${verdictId} does not resolve`,
        );
      }
    } else if (outcome === 'verdict_withheld' || outcome === 'check_failed') {
      if (verdictId !== null) {
        return failResult(
          'invariant.check_result_outcome_mismatch',
          `outcome ${outcome} must not carry a verdict_id (got ${verdictId})`,
        );
      }
    }
  }
  return null;
}

/**
 * TB-REF-013 — every remaining canonical reference resolves to an entity of the right
 * record type. An ID that merely exists in the graph is never enough: a reference field
 * declares the lineage it points at, and resolving to another lineage is a violation.
 */
function checkCanonicalReferencesResolve(ctx: GraphContext): ValidationResult | null {
  const unresolved = (what: string, id: string, type: string): ValidationResult =>
    failResult('invariant.reference_unresolved', `${what} ${id} does not resolve to a ${type}`);

  for (const rec of ctx.records) {
    const info = recordTypeOf(rec);
    if (!info) continue;
    switch (info.type) {
      case 'project': {
        const repositories = field(rec, 'repositories');
        if (Array.isArray(repositories)) {
          for (const ref of repositories) {
            const repoId = strField(ref, 'repository_id');
            if (repoId === null) continue;
            if (!resolvesAs(ctx, repoId, 'repository')) {
              return unresolved('project repository', repoId, 'Repository');
            }
          }
        }
        break;
      }
      case 'workspace': {
        const repoId = strField(rec, 'repository_id');
        if (repoId !== null && !resolvesAs(ctx, repoId, 'repository')) {
          return unresolved('workspace repository', repoId, 'Repository');
        }
        break;
      }
      case 'topic': {
        const projectId = strField(rec, 'project_id');
        if (projectId !== null && !resolvesAs(ctx, projectId, 'project')) {
          return unresolved('topic project', projectId, 'Project');
        }
        break;
      }
      case 'task': {
        const topicId = strField(rec, 'topic_id');
        if (topicId !== null && !resolvesAs(ctx, topicId, 'topic')) {
          return unresolved('task topic', topicId, 'Topic');
        }
        break;
      }
      case 'declaration': {
        const taskId = strField(rec, 'task_id');
        if (taskId !== null && !resolvesAs(ctx, taskId, 'task')) {
          return unresolved('declaration task', taskId, 'Task');
        }
        break;
      }
      case 'attempt_end': {
        const attemptId = strField(rec, 'attempt_id');
        if (attemptId !== null && !resolvesAs(ctx, attemptId, 'attempt')) {
          return unresolved('attempt_end attempt', attemptId, 'Attempt');
        }
        break;
      }
      case 'reconciliation': {
        const evidenceId = strField(rec, 'evidence_id');
        if (evidenceId !== null && !resolvesAs(ctx, evidenceId, 'evidence')) {
          return unresolved('reconciliation evidence', evidenceId, 'Evidence');
        }
        const observed = field(rec, 'observed_context');
        const repoId = strField(observed, 'repository_id');
        const wspId = strField(observed, 'workspace_id');
        if (repoId !== null && !resolvesAs(ctx, repoId, 'repository')) {
          return unresolved('reconciliation observed repository', repoId, 'Repository');
        }
        if (wspId !== null && !resolvesAs(ctx, wspId, 'workspace')) {
          return unresolved('reconciliation observed workspace', wspId, 'Workspace');
        }
        break;
      }
      case 'check_invocation': {
        const subjectId = strField(field(rec, 'subject'), 'id');
        if (subjectId !== null && !resolvesAs(ctx, subjectId, 'claim')) {
          return unresolved('check_invocation subject', subjectId, 'Claim');
        }
        const projectId = strField(field(rec, 'evaluated_snapshot'), 'project_id');
        if (projectId !== null && !resolvesAs(ctx, projectId, 'project')) {
          return unresolved('check_invocation evaluated project', projectId, 'Project');
        }
        break;
      }
      case 'verdict': {
        const basis = field(rec, 'basis');
        for (const eid of strArrayField(basis, 'evidence_ids')) {
          if (!resolvesAs(ctx, eid, 'evidence')) {
            return unresolved('verdict basis evidence', eid, 'Evidence');
          }
        }
        for (const rid of strArrayField(basis, 'reconciliation_ids')) {
          if (!resolvesAs(ctx, rid, 'reconciliation')) {
            return unresolved('verdict basis reconciliation', rid, 'Reconciliation');
          }
        }
        const findings = field(rec, 'findings');
        if (Array.isArray(findings)) {
          for (const finding of findings) {
            for (const ref of strArrayField(finding, 'basis_refs')) {
              if (!resolvesAsOneOf(ctx, ref, ['evidence', 'reconciliation'])) {
                return unresolved('verdict finding basis ref', ref, 'Evidence or Reconciliation');
              }
            }
          }
        }
        break;
      }
      case 'settlement': {
        const taskId = strField(rec, 'task_id');
        const attemptId = strField(rec, 'attempt_id');
        if (taskId !== null && !resolvesAs(ctx, taskId, 'task')) {
          return unresolved('settlement task', taskId, 'Task');
        }
        if (attemptId !== null && !resolvesAs(ctx, attemptId, 'attempt')) {
          return unresolved('settlement attempt', attemptId, 'Attempt');
        }
        break;
      }
      case 'blocker': {
        const taskId = strField(rec, 'task_id');
        const attemptId = strField(rec, 'attempt_id');
        if (taskId !== null && !resolvesAs(ctx, taskId, 'task')) {
          return unresolved('blocker task', taskId, 'Task');
        }
        if (attemptId !== null && !resolvesAs(ctx, attemptId, 'attempt')) {
          return unresolved('blocker attempt', attemptId, 'Attempt');
        }
        break;
      }
      case 'blocker_resolution': {
        const blockerId = strField(rec, 'blocker_id');
        if (blockerId !== null && !resolvesAs(ctx, blockerId, 'blocker')) {
          return unresolved('blocker_resolution blocker', blockerId, 'Blocker');
        }
        for (const eid of strArrayField(rec, 'evidence_ids')) {
          if (!resolvesAs(ctx, eid, 'evidence')) {
            return unresolved('blocker_resolution evidence', eid, 'Evidence');
          }
        }
        break;
      }
      case 'decision': {
        // `basis` is free-form ordered text; any entry shaped as a canonical ID must resolve.
        for (const entry of strArrayField(rec, 'basis')) {
          if (isValidId(entry) && !resolve(ctx, entry)) {
            return unresolved('decision basis', entry, 'record in the graph');
          }
        }
        break;
      }
      default:
        break;
    }
  }
  return null;
}

/**
 * TB-REF-014 — references that resolve must also agree on lineage.
 *
 * A reference resolving to an entity of the wrong lineage is not valid merely because
 * the ID exists: an Attempt's Declaration must declare the Attempt's Task, its Workspace
 * must belong to its Repository, a Claim must sit on an Attempt of the same Task and
 * Declaration, and a Settlement/Blocker must cite an Attempt of the Task it settles.
 */
function checkCanonicalReferencesConsistent(ctx: GraphContext): ValidationResult | null {
  const inconsistent = (message: string): ValidationResult =>
    failResult('invariant.reference_inconsistent', message);

  for (const rec of ctx.records) {
    const info = recordTypeOf(rec);
    if (!info) continue;
    switch (info.type) {
      case 'project': {
        const projectId = strField(rec, 'project_id');
        const repositories = field(rec, 'repositories');
        if (!Array.isArray(repositories)) break;
        for (const ref of repositories) {
          const repoId = strField(ref, 'repository_id');
          const alias = strField(ref, 'alias');
          if (repoId === null) continue;
          const repository = ctx.byId.get(repoId);
          if (!repository) continue;
          if (strField(repository, 'alias') !== alias) {
            return inconsistent(
              `project ${String(projectId)} declares repository ${repoId} with alias ${String(alias)} but the Repository record says ${String(strField(repository, 'alias'))}`,
            );
          }
        }
        break;
      }
      case 'attempt': {
        const taskId = strField(rec, 'task_id');
        const declaration = ctx.byId.get(strField(rec, 'declaration_id') ?? '');
        if (declaration && strField(declaration, 'task_id') !== taskId) {
          return inconsistent(
            `attempt ${String(recordId(rec))} cites a declaration of a different task`,
          );
        }
        const workspace = ctx.byId.get(strField(rec, 'workspace_id') ?? '');
        if (workspace && strField(workspace, 'repository_id') !== strField(rec, 'repository_id')) {
          return inconsistent(
            `attempt ${String(recordId(rec))} cites a workspace that belongs to a different repository`,
          );
        }
        break;
      }
      case 'claim': {
        const attempt = ctx.byId.get(strField(rec, 'attempt_id') ?? '');
        if (attempt) {
          if (strField(attempt, 'task_id') !== strField(rec, 'task_id')) {
            return inconsistent(`claim ${String(recordId(rec))} cites an attempt of a different task`);
          }
          if (strField(attempt, 'declaration_id') !== strField(rec, 'declaration_id')) {
            return inconsistent(
              `claim ${String(recordId(rec))} cites a declaration other than the one its attempt was dispatched under`,
            );
          }
        }
        const declaration = ctx.byId.get(strField(rec, 'declaration_id') ?? '');
        if (declaration && strField(declaration, 'task_id') !== strField(rec, 'task_id')) {
          return inconsistent(`claim ${String(recordId(rec))} cites a declaration of a different task`);
        }
        break;
      }
      case 'reconciliation': {
        const observed = field(rec, 'observed_context');
        const wspId = strField(observed, 'workspace_id');
        const repoId = strField(observed, 'repository_id');
        const workspace = wspId === null ? undefined : ctx.byId.get(wspId);
        if (workspace && repoId !== null && strField(workspace, 'repository_id') !== repoId) {
          return inconsistent(
            `reconciliation ${String(recordId(rec))} observed a workspace that belongs to a different repository`,
          );
        }
        break;
      }
      case 'settlement': {
        const attempt = ctx.byId.get(strField(rec, 'attempt_id') ?? '');
        if (attempt && strField(attempt, 'task_id') !== strField(rec, 'task_id')) {
          return inconsistent(`settlement ${String(recordId(rec))} settles an attempt of a different task`);
        }
        break;
      }
      case 'blocker': {
        const attemptId = strField(rec, 'attempt_id');
        const attempt = attemptId === null ? undefined : ctx.byId.get(attemptId);
        if (attempt && strField(attempt, 'task_id') !== strField(rec, 'task_id')) {
          return inconsistent(`blocker ${String(recordId(rec))} cites an attempt of a different task`);
        }
        break;
      }
      case 'topic': {
        // A Topic must belong to the graph's own Project (there is exactly one).
        break;
      }
      default:
        break;
    }
  }
  return null;
}

/**
 * TB-REF-016 — no machine-local absolute path in a portable record.
 *
 * The Store's write path refuses to *emit* one; this refuses to *accept* one, so a
 * hand-written or hand-merged `state.json` cannot smuggle a local path into a file that
 * is meant to travel.
 */
function checkNoAbsolutePaths(ctx: GraphContext): ValidationResult | null {
  for (const rec of ctx.records) {
    const found = findAbsolutePath(rec);
    if (found) {
      return failResult(
        'invariant.absolute_path_in_portable_file',
        `${String(recordId(rec))} carries the absolute path ${JSON.stringify(found.value)} at ` +
          `${found.at}; absolute paths belong only in runtime/bindings.json`,
      );
    }
  }
  return null;
}

/**
 * TB-LC-002 — no duplicate criterion_id within one declaration.
 *
 * `declaration.criteria` is also a registered `set` array keyed by `criterion_id`, so a
 * repeated criterion is simultaneously a TB-CAN-002 duplicate. TB-LC-002 is the specific,
 * documented rule for this fact, so it is evaluated first and its code is the one reported.
 */
function checkNoDuplicateCriterionIn(records: readonly AnyRecord[]): ValidationResult | null {
  for (const rec of records) {
    if (recordTypeOf(rec)?.type !== 'declaration') continue;
    const criteria = field(rec, 'criteria');
    if (!Array.isArray(criteria)) continue;
    const seen = new Set<string>();
    for (const c of criteria) {
      const cid = strField(c, 'criterion_id');
      if (cid === null) continue;
      if (seen.has(cid)) {
        return failResult('invariant.duplicate_criterion', `duplicate criterion_id ${cid}`);
      }
      seen.add(cid);
    }
  }
  return null;
}

function checkNoDuplicateCriterion(ctx: GraphContext): ValidationResult | null {
  return checkNoDuplicateCriterionIn(ctx.records);
}

/** TB-LC-005 — Settlement basis satisfies the per-action matrix. */
function checkSettlementBasisMatrix(ctx: GraphContext): ValidationResult | null {
  for (const rec of recordsOfType(ctx, 'settlement')) {
    const decision = strField(rec, 'decision');
    const basis = field(rec, 'basis') as AnyObject | undefined;
    const verdictId = strField(basis, 'verdict_id');
    const exception = strField(rec, 'verification_exception');
    const hasVerdict = verdictId !== null;
    const hasException = exception !== null;
    if (decision === 'accept' || decision === 'land') {
      if (hasVerdict === hasException) {
        return failResult(
          'invariant.settlement_basis_matrix',
          `${decision} requires exactly one of basis.verdict_id or verification_exception`,
        );
      }
    } else if (decision === 'retry' || decision === 'abandon') {
      // SPEC §5 (per-action matrix): verification_exception is documented as "the
      // exceptional accept/land override" — it has no meaning for retry/abandon, so it is
      // forbidden here exactly like verdict_id, not merely left unchecked.
      if (hasVerdict) {
        return failResult('invariant.settlement_basis_matrix', `${decision} must not cite a verdict`);
      }
      if (hasException) {
        return failResult(
          'invariant.settlement_basis_matrix',
          `${decision} must not cite a verification_exception (accept/land only)`,
        );
      }
    }
  }
  return null;
}

/** TB-SUP-001 — `supersedes` targets a record of the same type. */
function checkSupersessionSameType(ctx: GraphContext): ValidationResult | null {
  for (const rec of ctx.records) {
    const info = recordTypeOf(rec);
    if (info?.supersessionCapable !== true) continue;
    const target = strField(rec, 'supersedes');
    if (target === null) continue;
    const targetRec = ctx.byId.get(target);
    if (targetRec && recordTypeOf(targetRec)?.type !== info.type) {
      return failResult('invariant.supersession_type', `${info.type} supersedes a ${String(recordTypeOf(targetRec)?.type)}`);
    }
  }
  return null;
}

/** TB-SUP-002 — `supersedes` targets the same logical subject (lineage). */
function checkSupersessionSameSubject(ctx: GraphContext): ValidationResult | null {
  for (const rec of ctx.records) {
    const info = recordTypeOf(rec);
    if (info?.supersessionCapable !== true) continue;
    const target = strField(rec, 'supersedes');
    if (target === null) continue;
    const targetRec = ctx.byId.get(target);
    if (!targetRec) continue;
    if (supersessionSubjectKey(rec) !== supersessionSubjectKey(targetRec)) {
      return failResult('invariant.supersession_subject', `${info.type} supersedes a different subject`);
    }
  }
  return null;
}

/**
 * TB-SUP-005 — a lineage has at most one unsuperseded head.
 *
 * SPEC §5.4: "Concurrent unsuperseded heads are an explicit declaration conflict requiring
 * reconciliation; Store must not choose one by timestamp." The way Store avoids choosing
 * is by refusing the state: a revision must say what it supersedes. Accepting two live
 * heads would leave every consumer to pick one, and picking is precisely what the contract
 * forbids — so the conflict is reported here rather than deferred to whoever reads next.
 *
 * A fork can only enter a snapshot out-of-band (a merge of divergent histories, or a hand
 * edit); no write path through the Store can create one. Repairing it is likewise a
 * file-level operation, because `supersedes` is single-valued — see `ledger/reconcile.ts`.
 */
function checkNoConcurrentSupersessionHeads(ctx: GraphContext): ValidationResult | null {
  const conflicts = findSupersessionConflicts(ctx.records);
  const first = conflicts[0];
  if (!first) return null;
  return failResult(
    'invariant.supersession_conflict',
    `lineage ${first.key} has ${first.heads.length} concurrent unsuperseded heads ` +
      `(${first.heads.join(', ')}); a revision must declare what it supersedes — ` +
      'Store never selects one by timestamp',
  );
}

/** TB-SUP-003 — the supersession graph is acyclic. */
function checkSupersessionAcyclic(ctx: GraphContext): ValidationResult | null {
  const supersedesBy = new Map<string, string>();
  for (const rec of ctx.records) {
    const info = recordTypeOf(rec);
    if (info?.supersessionCapable !== true) continue;
    const id = strField(rec, info.idField);
    const target = strField(rec, 'supersedes');
    if (id !== null && target !== null) supersedesBy.set(id, target);
  }
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (id: string): boolean => {
    if (done.has(id)) return false;
    if (visiting.has(id)) return true;
    visiting.add(id);
    const next = supersedesBy.get(id);
    if (next !== undefined && visit(next)) return true;
    visiting.delete(id);
    done.add(id);
    return false;
  };
  for (const id of supersedesBy.keys()) {
    if (visit(id)) return failResult('invariant.supersession_cycle', `supersession cycle at ${id}`);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Transition (mutation) lifecycle guards
// ---------------------------------------------------------------------------

/**
 * attempt_id → the id of that attempt's **effective** AttemptEnd.
 *
 * "Effective" means not itself superseded by another AttemptEnd. `ate_` is
 * supersession-capable (TB-SUP-004) precisely so a mis-reported end can be corrected, so
 * the lifecycle guard has to distinguish "this attempt already ended" from "this record
 * corrects the end it names". Collapsing the two would make
 * `contract/fixtures/snapshots/valid/superseded-attemptend.json` — a state the contract
 * declares valid — unreachable through any append.
 */
function effectiveAttemptEnds(current: Snapshot): Map<string, string> {
  const endsByAttempt = new Map<string, string[]>();
  const superseded = new Set<string>();
  for (const rec of allRecords(current)) {
    if (recordTypeOf(rec)?.type !== 'attempt_end') continue;
    const attemptId = strField(rec, 'attempt_id');
    const endId = strField(rec, 'attempt_end_id');
    if (attemptId === null || endId === null) continue;
    endsByAttempt.set(attemptId, [...(endsByAttempt.get(attemptId) ?? []), endId]);
    const target = strField(rec, 'supersedes');
    if (target !== null) superseded.add(target);
  }
  const effective = new Map<string, string>();
  for (const [attemptId, ends] of endsByAttempt) {
    const live = ends.filter((id) => !superseded.has(id));
    // Concurrent unsuperseded heads are a supersession conflict (TB-SUP-005), reported
    // there; here any live head is enough to say the attempt has ended.
    const head = live[0];
    if (head !== undefined) effective.set(attemptId, head);
  }
  return effective;
}

/** The attempts that currently have an effective (unsuperseded) end. */
function existingAttemptEnds(current: Snapshot): Set<string> {
  return new Set(effectiveAttemptEnds(current).keys());
}

function existingCheckResults(current: Snapshot): Set<string> {
  const byInvocation = new Set<string>();
  for (const rec of allRecords(current)) {
    if (recordTypeOf(rec)?.type !== 'check_result') continue;
    const invocationId = strField(rec, 'check_invocation_id');
    if (invocationId !== null) byInvocation.add(invocationId);
  }
  return byInvocation;
}

/**
 * TB-LC-001 — an Attempt with an effective AttemptEnd cannot be ended again.
 *
 * A *correcting* AttemptEnd is not a restart: it supersedes the effective end of the same
 * attempt, and both bodies stay in the graph (SPEC §5.5). What is refused is a second,
 * independent end — and a correction aimed at an end that was itself already superseded,
 * which would create concurrent heads instead of a single lineage.
 */
function checkAttemptNotRestarted(current: Snapshot, newRecords: AnyRecord[]): ValidationResult | null {
  const effective = effectiveAttemptEnds(current);
  for (const rec of newRecords) {
    if (recordTypeOf(rec)?.type !== 'attempt_end') continue;
    const attemptId = strField(rec, 'attempt_id');
    const endId = strField(rec, 'attempt_end_id');
    if (attemptId === null) continue;
    const head = effective.get(attemptId);
    if (head === undefined) {
      // First end for this attempt.
      if (endId !== null) effective.set(attemptId, endId);
      continue;
    }
    const supersedes = strField(rec, 'supersedes');
    if (supersedes === null) {
      return failResult('invariant.attempt_already_ended', `attempt ${attemptId} already ended`);
    }
    if (supersedes !== head) {
      return failResult(
        'invariant.attempt_already_ended',
        `attempt ${attemptId} already ended by ${head}; a correcting attempt_end must supersede ` +
          `that effective end, not ${supersedes}`,
      );
    }
    if (endId !== null) effective.set(attemptId, endId);
  }
  return null;
}

/** TB-LC-006 — a CheckInvocation has at most one CheckResult. */
function checkOneCheckResultPerInvocation(current: Snapshot, newRecords: AnyRecord[]): ValidationResult | null {
  const seen = existingCheckResults(current);
  for (const rec of newRecords) {
    if (recordTypeOf(rec)?.type !== 'check_result') continue;
    const invocationId = strField(rec, 'check_invocation_id');
    if (invocationId === null) continue;
    if (seen.has(invocationId)) {
      return failResult('invariant.check_result_already_recorded', `invocation ${invocationId} already has a check_result`);
    }
    seen.add(invocationId);
  }
  return null;
}

/** TB-LC-004 — at most one open (un-ended) Attempt owns the same Workspace. */
function checkWorkspaceExclusivity(current: Snapshot, newRecords: AnyRecord[]): ValidationResult | null {
  const ended = existingAttemptEnds(current);
  // An attempt_end appended in THIS same operation ends its attempt too — otherwise a
  // legitimate single-operation "end attempt A, dispatch attempt B to the same workspace"
  // append is rejected: A would still read as open below purely because its end hasn't
  // reached `current` yet.
  for (const rec of newRecords) {
    if (recordTypeOf(rec)?.type !== 'attempt_end') continue;
    const attemptId = strField(rec, 'attempt_id');
    if (attemptId !== null) ended.add(attemptId);
  }
  const openByWorkspace = new Map<string, string>();
  for (const rec of allRecords(current)) {
    if (recordTypeOf(rec)?.type !== 'attempt') continue;
    const attemptId = strField(rec, 'attempt_id');
    const workspaceId = strField(rec, 'workspace_id');
    if (attemptId === null || workspaceId === null || ended.has(attemptId)) continue;
    openByWorkspace.set(workspaceId, attemptId);
  }
  for (const rec of newRecords) {
    if (recordTypeOf(rec)?.type !== 'attempt') continue;
    const attemptId = strField(rec, 'attempt_id');
    const workspaceId = strField(rec, 'workspace_id');
    if (attemptId === null || workspaceId === null) continue;
    const owner = openByWorkspace.get(workspaceId);
    if (owner !== undefined && owner !== attemptId) {
      return failResult('invariant.workspace_exclusivity', `workspace ${workspaceId} already owned by open attempt ${owner}`);
    }
    openByWorkspace.set(workspaceId, attemptId);
  }
  return null;
}

/**
 * TB-REF-010 (mutation phase) — a result bundle is atomic *and closed*.
 *
 * When an append carries a CheckResult, every Reconciliation and Verdict appended in the
 * same operation must be part of that result: a Verdict must be the one the CheckResult
 * names, and a Reconciliation must appear in its `reconciliation_ids`. This is what makes
 * "the bundle" a bundle rather than an unrelated pile of records riding along with it.
 */
function checkResultBundleClosed(newRecords: AnyRecord[]): ValidationResult | null {
  const results = newRecords.filter((rec) => recordTypeOf(rec)?.type === 'check_result');
  if (results.length === 0) return null;

  const citedReconciliations = new Set<string>();
  const citedVerdicts = new Set<string>();
  for (const result of results) {
    for (const rid of strArrayField(result, 'reconciliation_ids')) citedReconciliations.add(rid);
    const verdictId = strField(result, 'verdict_id');
    if (verdictId !== null) citedVerdicts.add(verdictId);
  }

  for (const rec of newRecords) {
    const type = recordTypeOf(rec)?.type;
    const id = recordId(rec);
    if (id === null) continue;
    if (type === 'reconciliation' && !citedReconciliations.has(id)) {
      return failResult(
        'invariant.check_result_invocation_mismatch',
        `reconciliation ${id} is appended with a check_result bundle but no check_result cites it`,
      );
    }
    if (type === 'verdict' && !citedVerdicts.has(id)) {
      return failResult(
        'invariant.check_result_invocation_mismatch',
        `verdict ${id} is appended with a check_result bundle but no check_result cites it`,
      );
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Pipeline assembly
// ---------------------------------------------------------------------------

const SNAPSHOT_GRAPH_CHECKS: ReadonlyArray<(ctx: GraphContext) => ValidationResult | null> = [
  checkVerdictScopeResolves,
  checkVerdictDeclarationConsistent,
  checkVerdictCriteriaBelong,
  checkAttemptClaimResolve,
  checkSupersedesTargetPresent,
  checkSettlementBasisResolves,
  checkEvidenceReferencesResolve,
  checkDecisionSubjectResolves,
  checkCheckResultInvocation,
  checkCheckResultOutcome,
  checkCheckResultReferences,
  checkCanonicalReferencesResolve,
  checkCanonicalReferencesConsistent,
  checkNoAbsolutePaths,
  checkNoDuplicateCriterion,
  checkSettlementBasisMatrix,
  checkSupersessionSameType,
  checkSupersessionSameSubject,
  checkSupersessionAcyclic,
  checkNoConcurrentSupersessionHeads,
];

/** Referential (graph) validity of a flat record list. */
function graphInvariants(records: AnyRecord[]): ValidationResult {
  const ctx = buildGraph(records);
  for (const check of SNAPSHOT_GRAPH_CHECKS) {
    const failure = check(ctx);
    if (failure) return failure;
  }
  return okResult();
}

/**
 * Envelope-level checks that need the snapshot header rather than the record list: a
 * CheckInvocation cannot claim to have evaluated a revision that does not exist yet.
 */
function checkEvaluatedSnapshotRevision(snapshot: Snapshot): ValidationResult | null {
  const revision = (snapshot as unknown as AnyObject)['revision'];
  if (typeof revision !== 'number') return null;
  for (const rec of allRecords(snapshot)) {
    if (recordTypeOf(rec)?.type !== 'check_invocation') continue;
    const evaluated = field(rec, 'evaluated_snapshot');
    const evaluatedRevision = field(evaluated, 'revision');
    if (typeof evaluatedRevision === 'number' && evaluatedRevision > revision) {
      return failResult(
        'invariant.reference_inconsistent',
        `check_invocation ${String(recordId(rec))} evaluated revision ${evaluatedRevision}, ahead of snapshot revision ${revision}`,
      );
    }
  }
  return null;
}

/**
 * Structural + canonical-serialization + referential validity of a final snapshot.
 */
export function validate_snapshot(snapshot: Snapshot): ValidationResult {
  const records = allRecords(snapshot);
  const pre = preChecks(records);
  if (pre) return pre;

  const { snapshot: validate } = getCompiled();
  if (!validate(snapshot)) {
    return failResult('schema.unknown_property', firstSchemaError(validate) ?? 'snapshot is malformed');
  }

  const duplicateCriterion = checkNoDuplicateCriterionIn(records);
  if (duplicateCriterion) return duplicateCriterion;

  const canonical = checkSnapshotCanonicalArrays(snapshot);
  if (canonical) return canonical;

  const graph = graphInvariants(records);
  if (!graph.ok) return graph;

  return checkEvaluatedSnapshotRevision(snapshot) ?? okResult();
}

/**
 * Transition validity of an append against `current`. Does not mutate either argument.
 */
export function validate_append(current: Snapshot, operation: AppendOperation): ValidationResult {
  // TB-ATOM-003 — optimistic revision check.
  if (operation.expected_revision !== current.revision) {
    return failResult(
      'mutation.revision_conflict',
      `expected revision ${operation.expected_revision} does not match current ${current.revision}`,
    );
  }

  // The Project singleton has no collection to append into (`snapshotWithRecords` in the
  // ledger layer has nowhere to put it). It is created once at `init` and never appended;
  // reject it here, at validation, rather than letting a schema-valid Project record reach
  // the mutation step and throw out of a call whose contract is "never throws".
  const singleton = checkNoSingletonRecordsInAppend(operation.records);
  if (singleton) return singleton;

  // Pre-schema guards report their own codes before the closed schema rejects the record
  // as a generic `unknown_property` (mirrors validate_snapshot).
  const pre = preChecks(operation.records);
  if (pre) return pre;

  const { append: validate } = getCompiled();
  if (!validate(operation)) {
    return failResult('schema.unknown_property', firstSchemaError(validate) ?? 'append operation is malformed');
  }

  const duplicateCriterion = checkNoDuplicateCriterionIn(operation.records);
  if (duplicateCriterion) return duplicateCriterion;

  // SPEC §10 — a `set` array must arrive sorted and duplicate-free; it is rejected, never
  // silently normalized, on the way in.
  const canonical = checkRecordCanonicalArrays(operation.records);
  if (canonical) return canonical;

  // TB-ID-002 / TB-ID-003 — id collision vs idempotent replay.
  const existingById = new Map<string, string>();
  for (const rec of allRecords(current)) {
    const id = recordId(rec);
    if (id !== null) existingById.set(id, canonicalizeJson(rec));
  }
  const newRecords: AnyRecord[] = [];
  const seenInOp = new Map<string, string>();
  for (const rec of operation.records) {
    const id = recordId(rec);
    if (id === null) continue; // malformed record; schema already reported it
    const canon = canonicalizeJson(rec);
    const inOp = seenInOp.get(id);
    if (inOp !== undefined) {
      if (inOp === canon) continue;
      return failResult('invariant.id_collision', `duplicate id ${id} with different content`);
    }
    const existing = existingById.get(id);
    if (existing !== undefined) {
      if (existing === canon) continue;
      return failResult('invariant.id_collision', `id ${id} collides with an existing record`);
    }
    seenInOp.set(id, canon);
    newRecords.push(rec);
  }

  // Transition lifecycle guards (cannot be determined from a final snapshot alone).
  const lifecycle =
    checkAttemptNotRestarted(current, newRecords) ??
    checkOneCheckResultPerInvocation(current, newRecords) ??
    checkWorkspaceExclusivity(current, newRecords) ??
    checkResultBundleClosed(newRecords);
  if (lifecycle) return lifecycle;

  // Candidate graph validated as a whole (current ∪ new).
  return graphInvariants([...allRecords(current), ...newRecords]);
}

// ---------------------------------------------------------------------------
// Invariant registry (rule id → implemented validator), for the conformance
// suite's catalog↔validator correspondence check.
// ---------------------------------------------------------------------------

export interface InvariantValidatorEntry {
  /** Catalog rule id, e.g. `TB-REF-001`. */
  rule: string;
  /** Symbolic validator name from `contract/invariants.json`. */
  validator: string;
  phase: 'snapshot' | 'mutation' | 'assertion';
  /** Null for assertion rules (NOP/ATOM) that are observable behavior, not graph checks. */
  check: ((ctx: GraphContext) => ValidationResult | null) | null;
}

export const INVARIANT_VALIDATORS: ReadonlyMap<string, InvariantValidatorEntry> = new Map([
  ['TB-REF-001', { rule: 'TB-REF-001', validator: 'referential.verdict_scope_resolves', phase: 'snapshot', check: checkVerdictScopeResolves }],
  ['TB-REF-002', { rule: 'TB-REF-002', validator: 'referential.verdict_declaration_consistent', phase: 'snapshot', check: checkVerdictDeclarationConsistent }],
  ['TB-REF-003', { rule: 'TB-REF-003', validator: 'referential.verdict_criteria_belong_to_declaration', phase: 'snapshot', check: checkVerdictCriteriaBelong }],
  ['TB-REF-004', { rule: 'TB-REF-004', validator: 'referential.attempt_claim_resolve', phase: 'snapshot', check: checkAttemptClaimResolve }],
  ['TB-REF-005', { rule: 'TB-REF-005', validator: 'referential.supersedes_target_present', phase: 'snapshot', check: checkSupersedesTargetPresent }],
  ['TB-REF-006', { rule: 'TB-REF-006', validator: 'referential.settlement_basis_resolves', phase: 'snapshot', check: checkSettlementBasisResolves }],
  ['TB-REF-007', { rule: 'TB-REF-007', validator: 'referential.evidence_references_resolve', phase: 'snapshot', check: checkEvidenceReferencesResolve }],
  ['TB-REF-008', { rule: 'TB-REF-008', validator: 'referential.decision_subject_resolves', phase: 'snapshot', check: checkDecisionSubjectResolves }],
  ['TB-REF-009', { rule: 'TB-REF-009', validator: 'referential.project_identity_matches', phase: 'snapshot', check: null }],
  ['TB-REF-010', { rule: 'TB-REF-010', validator: 'referential.check_result_invocation_consistent', phase: 'snapshot', check: checkCheckResultInvocation }],
  ['TB-REF-011', { rule: 'TB-REF-011', validator: 'referential.check_result_references_resolve', phase: 'snapshot', check: checkCheckResultReferences }],
  ['TB-REF-012', { rule: 'TB-REF-012', validator: 'referential.check_result_outcome_consistent', phase: 'snapshot', check: checkCheckResultOutcome }],
  ['TB-REF-013', { rule: 'TB-REF-013', validator: 'referential.canonical_references_resolve', phase: 'snapshot', check: checkCanonicalReferencesResolve }],
  ['TB-REF-014', { rule: 'TB-REF-014', validator: 'referential.canonical_references_consistent', phase: 'snapshot', check: checkCanonicalReferencesConsistent }],
  // TB-REF-015/016 are enforced on the Store's load and write paths (`ledger/store.ts`,
  // `ledger/snapshot.ts`), not over a record list, so they carry no graph check here.
  ['TB-REF-015', { rule: 'TB-REF-015', validator: 'referential.project_repositories_match', phase: 'snapshot', check: null }],
  ['TB-REF-016', { rule: 'TB-REF-016', validator: 'referential.no_absolute_path_in_portable_file', phase: 'snapshot', check: checkNoAbsolutePaths }],
  ['TB-ID-001', { rule: 'TB-ID-001', validator: 'identity.id_immutable', phase: 'mutation', check: null }],
  ['TB-ID-002', { rule: 'TB-ID-002', validator: 'identity.id_collision_rejected', phase: 'mutation', check: null }],
  ['TB-ID-003', { rule: 'TB-ID-003', validator: 'identity.id_replay_idempotent', phase: 'mutation', check: null }],
  ['TB-LC-001', { rule: 'TB-LC-001', validator: 'lifecycle.attempt_not_restarted_after_end', phase: 'mutation', check: null }],
  ['TB-LC-002', { rule: 'TB-LC-002', validator: 'lifecycle.no_duplicate_criterion', phase: 'snapshot', check: checkNoDuplicateCriterion }],
  // No append-shape violation to check: this holds because `Store.dispatch` (src/ledger/
  // commands.ts) never consults settlement/decision history at all, so no prior Settlement
  // can block a new Attempt — proven by test/review-regressions-2.test.ts ("finding 4"),
  // the same "true by absence of a blocking code path" pattern as the TB-NOP-* rules below.
  ['TB-LC-003', { rule: 'TB-LC-003', validator: 'lifecycle.retry_not_terminal', phase: 'mutation', check: null }],
  ['TB-LC-004', { rule: 'TB-LC-004', validator: 'lifecycle.workspace_exclusivity', phase: 'mutation', check: null }],
  ['TB-LC-005', { rule: 'TB-LC-005', validator: 'lifecycle.settlement_basis_matrix', phase: 'mutation', check: checkSettlementBasisMatrix }],
  ['TB-LC-006', { rule: 'TB-LC-006', validator: 'lifecycle.one_check_result_per_invocation', phase: 'mutation', check: null }],
  ['TB-LC-007', { rule: 'TB-LC-007', validator: 'lifecycle.no_singleton_records_in_append', phase: 'mutation', check: null }],
  ['TB-SUP-001', { rule: 'TB-SUP-001', validator: 'supersession.same_type', phase: 'snapshot', check: checkSupersessionSameType }],
  ['TB-SUP-002', { rule: 'TB-SUP-002', validator: 'supersession.same_subject', phase: 'snapshot', check: checkSupersessionSameSubject }],
  ['TB-SUP-003', { rule: 'TB-SUP-003', validator: 'supersession.acyclic', phase: 'snapshot', check: checkSupersessionAcyclic }],
  ['TB-SUP-004', { rule: 'TB-SUP-004', validator: 'supersession.only_capable_records', phase: 'snapshot', check: null }],
  ['TB-SUP-005', { rule: 'TB-SUP-005', validator: 'supersession.no_concurrent_heads_selection', phase: 'snapshot', check: checkNoConcurrentSupersessionHeads }],
  ['TB-CAN-001', { rule: 'TB-CAN-001', validator: 'canonicalization.set_array_sorted', phase: 'snapshot', check: null }],
  ['TB-CAN-002', { rule: 'TB-CAN-002', validator: 'canonicalization.set_array_duplicate_free', phase: 'snapshot', check: null }],
  ['TB-ATOM-001', { rule: 'TB-ATOM-001', validator: 'atomicity.no_partial_mutation', phase: 'assertion', check: null }],
  ['TB-ATOM-002', { rule: 'TB-ATOM-002', validator: 'atomicity.all_or_nothing', phase: 'assertion', check: null }],
  ['TB-ATOM-003', { rule: 'TB-ATOM-003', validator: 'atomicity.optimistic_revision', phase: 'mutation', check: null }],
  ['TB-ATOM-004', { rule: 'TB-ATOM-004', validator: 'atomicity.single_writer_lock', phase: 'assertion', check: null }],
  ['TB-ATOM-005', { rule: 'TB-ATOM-005', validator: 'atomicity.persist_before_commit', phase: 'assertion', check: null }],
  ['TB-NOP-001', { rule: 'TB-NOP-001', validator: 'nop.evidence_creates_no_verdict', phase: 'assertion', check: null }],
  ['TB-NOP-002', { rule: 'TB-NOP-002', validator: 'nop.attempt_end_declares_no_completion', phase: 'assertion', check: null }],
  ['TB-NOP-003', { rule: 'TB-NOP-003', validator: 'nop.passing_test_accepts_no_task', phase: 'assertion', check: null }],
  ['TB-NOP-004', { rule: 'TB-NOP-004', validator: 'nop.elapsed_time_mutates_nothing', phase: 'assertion', check: null }],
  ['TB-NOP-005', { rule: 'TB-NOP-005', validator: 'nop.positive_verdict_authorizes_no_landing', phase: 'assertion', check: null }],
  ['TB-NOP-006', { rule: 'TB-NOP-006', validator: 'nop.no_derived_status_change', phase: 'assertion', check: null }],
]);
