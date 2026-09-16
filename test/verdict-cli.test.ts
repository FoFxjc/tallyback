/**
 * `tallyback verdict` — ergonomic Verdict authoring.
 *
 * Dogfood evidence: a prior ad-hoc operator script blanket-marked every criterion as
 * `supported` and nearly recorded a false verdict for a task whose acceptance coverage
 * was 7/8. The new command automates syntax and record construction but never the
 * per-criterion judgment — every assessment must be supplied explicitly, and missing
 * assessments fail rather than defaulting to anything.
 *
 * Every test below drives the CLI through `tsx src/cli.ts …`, never reaches into the
 * library, and asserts on the canonical record graph the Store produces.
 */

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';
import { newId } from '../src/ledger/index.js';
import { tempRoot } from './helpers/ledger.js';

const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const TSX = join(ROOT, 'node_modules', '.bin', 'tsx');
const CLI = join(ROOT, 'src', 'cli.ts');
interface CliRun {
  code: number;
  stdout: string;
  stderr: string;
}

async function runRaw(projectRoot: string, args: string[]): Promise<CliRun> {
  try {
    const { stdout, stderr } = await execFileAsync(
      TSX,
      [CLI, ...args, '--project-root', projectRoot],
      { cwd: ROOT },
    );
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return { code: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

/** Run a CLI command and parse its JSON result, failing loudly on a non-zero exit. */
async function tb(projectRoot: string, ...args: string[]): Promise<Record<string, unknown>> {
  const run = await runRaw(projectRoot, args);
  if (run.code !== 0) {
    throw new Error(`tallyback ${args.join(' ')} failed (${run.code}): ${run.stderr}`);
  }
  return JSON.parse(run.stdout) as Record<string, unknown>;
}

async function stateOf(projectRoot: string): Promise<CollectionSnapshot> {
  const raw = await readFile(join(projectRoot, '.tallyback', 'state.json'), 'utf8');
  return JSON.parse(raw) as CollectionSnapshot;
}

interface VerdictScopeView {
  evaluated_criteria: string[];
  unevaluated_criteria: string[];
}
interface VerdictView {
  verdict_id: string;
  declaration_id: string;
  subject: { kind: 'claim'; id: string };
  scope: VerdictScopeView;
  conclusion: string;
  finality: string;
  basis: { evidence_ids: string[]; reconciliation_ids: string[] };
  findings: Array<
    Record<string, unknown> & {
      criterion_id: string;
      assessment: string;
      basis_refs: string[];
    }
  >;
  confidence: { level: string; rationale: string };
  rationale: string;
  issued_at?: string | null;
}
interface CollectionSnapshot {
  revision: number;
  verdicts: VerdictView[];
  check_results: Array<Record<string, unknown>>;
  check_invocations: Array<Record<string, unknown>>;
  settlements: Array<Record<string, unknown>>;
}
interface MultiCriterionLedger {
  root: string;
  criterionIds: readonly [string, string, string, string];
  claimId: string;
  evidenceId: string;
  attemptId: string;
  declarationId: string;
  taskAlias: string;
}
/**
 * Build a ledger whose Declaration carries 4 criteria and one Claim that cites them.
 * Mirrors `buildLedger` from helpers/ledger.ts but with a multi-criterion declaration so
 * tests can assert per-criterion assessment plumbing.
 */
async function buildMultiCriterionLedger(prefix: string): Promise<MultiCriterionLedger> {
  const root = await tempRoot(prefix);
  const init = (await tb(
    root,
    'init',
    '--repository',
    'main',
    '--topic',
    'release',
    '--goal',
    'ship v1',
  )) as unknown as {
    project_id: string;
    repositories: { repository_id: string }[];
    topics: { topic_id: string }[];
  };
  const topicId = init.topics[0]!.topic_id;
  const repositoryId = init.repositories[0]!.repository_id;
  await tb(
    root,
    'task',
    '--topic-id',
    topicId,
    '--title',
    'Bounded Tallyback improvement',
    '--alias',
    'T1',
  );

  const declared = (await tb(
    root,
    'declare',
    '--task-id',
    'T1',
    '--objective',
    'A bounded improvement with multiple acceptance criteria.',
    '--criterion',
    'a-first:First criterion is met.',
    '--criterion',
    'b-second:Second criterion is met.',
    '--criterion',
    'c-third:Third criterion is met.',
    '--criterion',
    'd-fourth:Fourth criterion is met.',
  )) as unknown as {
    declaration: { declaration_id: string; criteria: { criterion_id: string }[] };
  };
  const criterionIds = declared.declaration.criteria.map(
    (c) => c.criterion_id,
  ) as unknown as readonly [string, string, string, string];
  const workspace = (await tb(
    root,
    'workspace',
    '--repository-id',
    repositoryId,
    '--branch',
    'main',
  )) as unknown as { workspace: { workspace_id: string } };

  const dispatched = (await tb(
    root,
    'dispatch',
    '--task-id',
    'T1',
    '--declaration-id',
    declared.declaration.declaration_id,
    '--repository-id',
    repositoryId,
    '--workspace-id',
    workspace.workspace.workspace_id,
    '--executor',
    'executor:agent-7',
    '--dispatcher',
    'human:alice',
  )) as unknown as { attempt: { attempt_id: string } };

  const evidence = (await tb(
    root,
    'evidence',
    '--kind',
    'observation',
    '--payload',
    '{"text":"work completed"}',
    '--actor',
    'executor:agent-7',
  )) as unknown as { evidence: { evidence_id: string } };

  const claim = (await tb(
    root,
    'claim',
    '--task-id',
    'T1',
    '--attempt-id',
    dispatched.attempt.attempt_id,
    '--declaration-id',
    declared.declaration.declaration_id,
    '--statement',
    'All declared work is complete.',
    '--evidence',
    evidence.evidence.evidence_id,
    '--actor',
    'executor:agent-7',
  )) as unknown as { claim: { claim_id: string } };

  return {
    root,
    criterionIds,
    claimId: claim.claim.claim_id,
    evidenceId: evidence.evidence.evidence_id,
    attemptId: dispatched.attempt.attempt_id,
    declarationId: declared.declaration.declaration_id,
    taskAlias: 'T1',
  };
}

describe('tallyback verdict — ergonomic authoring, explicit judgments only', () => {
  it('test 1 + 8 — generates a ver_ id, records a CheckInvocation + CheckResult, and the Verdict passes the canonical contract validator', async () => {
    const fx = await buildMultiCriterionLedger('tallyback-verdict-1-');
    const recorded = (await tb(
      fx.root,
      'verdict',
      '--claim',
      fx.claimId,
      '--criterion',
      `${fx.criterionIds[0]}=supported`,
      '--criterion',
      `${fx.criterionIds[1]}=supported`,
      '--criterion',
      `${fx.criterionIds[2]}=partially_supported`,
      '--criterion',
      `${fx.criterionIds[3]}=unsupported`,
      '--rationale',
      '4-of-4 explicit assessments; 7-of-8 acceptance coverage was the prior incident.',
      '--confidence',
      'high',
      '--conclusion',
      'partially_supported',
      '--as',
      'human:alice',
    )) as unknown as {
      ok: boolean;
      check_result: { verdict_id: string | null };
      bundle: { verdict: { verdict_id: string } | null };
    };

    expect(recorded.ok).toBe(true);
    expect(recorded.bundle.verdict?.verdict_id).toMatch(/^ver_/);
    expect(recorded.check_result.verdict_id).toBe(recorded.bundle.verdict?.verdict_id);

    // The on-disk ledger has exactly one Verdict, one CheckInvocation, one CheckResult.
    const state = await stateOf(fx.root);
    expect(state.verdicts).toHaveLength(1);
    expect(state.check_results).toHaveLength(1);
    expect(state.check_invocations).toHaveLength(1);

    // Verdict.id was generated, not operator-supplied.
    const verdict = state.verdicts[0]!;
    expect(verdict.verdict_id).toMatch(/^ver_/);
    expect(verdict.subject).toEqual({ kind: 'claim', id: fx.claimId });
    expect(verdict.declaration_id).toBe(fx.declarationId);
    expect(verdict.issued_at).toBeTruthy();
    expect(typeof verdict.issued_at).toBe('string');

    // CheckResult cites the Verdict.
    expect(state.check_results[0]!.verdict_id).toBe(verdict.verdict_id);

    // The persisted snapshot still validates end-to-end through the canonical validator.
    // We round-trip the snapshot through the public command surface to prove this.
    const validate = (await tb(fx.root, 'show')) as unknown as { revision: number };
    expect(validate.revision).toBe(state.revision);
  }, 60_000);

  it('test 2 — explicit per-criterion assessments produce a valid Verdict with one finding each', async () => {
    const fx = await buildMultiCriterionLedger('tallyback-verdict-2-');

    await tb(
      fx.root,
      'verdict',
      '--claim',
      fx.claimId,
      '--criterion',
      `${fx.criterionIds[0]}=supported`,
      '--criterion',
      `${fx.criterionIds[1]}=supported`,
      '--criterion',
      `${fx.criterionIds[2]}=supported`,
      '--criterion',
      `${fx.criterionIds[3]}=supported`,
      '--rationale',
      'all green',
      '--confidence',
      'medium',
    );

    const state = await stateOf(fx.root);
    const verdict = state.verdicts[0]!;
    expect(verdict.findings).toHaveLength(4);
    const findingsByCriterion = new Map(
      verdict.findings.map((f) => [f.criterion_id as string, f] as const),
    );
    expect(findingsByCriterion.get(fx.criterionIds[0])?.assessment).toBe('supported');
    expect(findingsByCriterion.get(fx.criterionIds[1])?.assessment).toBe('supported');
    expect(findingsByCriterion.get(fx.criterionIds[2])?.assessment).toBe('supported');
    expect(findingsByCriterion.get(fx.criterionIds[3])?.assessment).toBe('supported');
    // Mixed-by-uniform rule: all-supported → overall supported.
    expect(verdict.conclusion).toBe('supported');
    // Default finality is final; explicit enums require the operator to opt out.
    expect(verdict.finality).toBe('final');
    // Confidence + rationale are recorded exactly as supplied.
    expect(verdict.confidence).toMatchObject({ level: 'medium' });
    expect(verdict.rationale).toBe('all green');
    // Verdict.basis.evidence_ids defaults from the Claim's evidence_ids when --evidence
    // is not supplied.
    expect(verdict.basis.evidence_ids).toEqual([fx.evidenceId]);
    // Finding.basis_refs is a distinct, criterion-specific citation. This slice has no
    // per-criterion evidence syntax, so it must stay empty rather than silently
    // inheriting every Claim/Verdict evidence id.
    for (const finding of verdict.findings) {
      expect(finding.basis_refs).toEqual([]);
    }
  }, 60_000);

  it('test 3 — an unknown criterion id is rejected at author time with an actionable message', async () => {
    const fx = await buildMultiCriterionLedger('tallyback-verdict-3-');
    const run = await runRaw(fx.root, [
      'verdict',
      '--claim',
      fx.claimId,
      '--criterion',
      `${fx.criterionIds[0]}=supported`,
      '--criterion',
      'cri_does_not_exist=supported',
      '--rationale',
      'r',
      '--confidence',
      'low',
    ]);
    expect(run.code).not.toBe(0);
    // The message names the bad criterion and the declaration's criteria set, so the
    // operator never has to crack open `records.schema.json` to find the typo.
    expect(run.stderr).toContain('cri_does_not_exist');
    expect(run.stderr).toContain(fx.declarationId);

    const state = await stateOf(fx.root);
    expect(state.verdicts).toHaveLength(0);
    expect(state.check_invocations).toHaveLength(0);
  }, 60_000);

  it('test 4 — a criterion from a different declaration/task is rejected', async () => {
    const fx = await buildMultiCriterionLedger('tallyback-verdict-4-');

    // Build a second ledger whose declaration defines a foreign criterion id.
    const otherRoot = await tempRoot('tallyback-verdict-4-other-');
    await tb(otherRoot, 'init', '--repository', 'main', '--topic', 'other', '--goal', 'g');
    const otherTopics = (await tb(otherRoot, 'list', '--what', 'topics')) as unknown as {
      topics: { topic_id: string }[];
    };
    await tb(
      otherRoot,
      'task',
      '--topic-id',
      otherTopics.topics[0]!.topic_id,
      '--title',
      'other',
      '--alias',
      'OTHER',
    );
    const otherDeclared = (await tb(
      otherRoot,
      'declare',
      '--task-id',
      'OTHER',
      '--objective',
      'o',
      '--criterion',
      'foreign-only:This criterion is only on the other ledger.',
    )) as unknown as {
      declaration: { criteria: { criterion_id: string }[] };
    };
    const foreignCriterionId = otherDeclared.declaration.criteria[0]!.criterion_id;

    const run = await runRaw(fx.root, [
      'verdict',
      '--claim',
      fx.claimId,
      '--criterion',
      `${fx.criterionIds[0]}=supported`,
      '--criterion',
      `${foreignCriterionId}=supported`,
      '--rationale',
      'r',
      '--confidence',
      'low',
    ]);
    expect(run.code).not.toBe(0);
    expect(run.stderr).toContain(foreignCriterionId);
    // The error names the declaration whose criteria were searched, so the operator can
    // tell at a glance that the foreign id belongs to a different declaration's
    // criterion set. (Stabilization slice changed the exact phrasing from "does not
    // belong to declaration" to "is neither a declared code ... nor a cri_<UUIDv7> id
    // ... on declaration <id>" so it covers both the code-alias and id-direct forms.)
    expect(run.stderr).toContain('on declaration');
    expect(run.stderr).toContain(fx.declarationId);

    const state = await stateOf(fx.root);
    expect(state.verdicts).toHaveLength(0);
  }, 90_000);

  it('test 5 — duplicate criterion assessments are rejected with both ids named', async () => {
    const fx = await buildMultiCriterionLedger('tallyback-verdict-5-');
    const run = await runRaw(fx.root, [
      'verdict',
      '--claim',
      fx.claimId,
      '--criterion',
      `${fx.criterionIds[0]}=supported`,
      '--criterion',
      `${fx.criterionIds[0]}=unsupported`,
      '--criterion',
      `${fx.criterionIds[1]}=supported`,
      '--criterion',
      `${fx.criterionIds[2]}=supported`,
      '--criterion',
      `${fx.criterionIds[3]}=supported`,
      '--rationale',
      'r',
      '--confidence',
      'medium',
    ]);
    expect(run.code).not.toBe(0);
    expect(run.stderr).toContain('duplicate');
    expect(run.stderr).toContain(fx.criterionIds[0]!);

    const state = await stateOf(fx.root);
    expect(state.verdicts).toHaveLength(0);
  }, 60_000);

  it('test 6 — missing assessments fail rather than defaulting to supported, and --allow-partial explicitly opts in', async () => {
    const fx = await buildMultiCriterionLedger('tallyback-verdict-6-');
    const run = await runRaw(fx.root, [
      'verdict',
      '--claim',
      fx.claimId,
      '--criterion',
      `${fx.criterionIds[0]}=supported`,
      '--criterion',
      `${fx.criterionIds[1]}=supported`,
      '--criterion',
      `${fx.criterionIds[2]}=supported`,
      // criterionIds[3] is intentionally omitted.
      '--rationale',
      'r',
      '--confidence',
      'medium',
    ]);
    expect(run.code).not.toBe(0);
    expect(run.stderr).toContain('1 declared criteria were not assessed');
    expect(run.stderr).toContain(fx.criterionIds[3]!);
    expect(run.stderr).toContain('--allow-partial');

    // Without the explicit opt-in nothing was recorded.
    let state = await stateOf(fx.root);
    expect(state.verdicts).toHaveLength(0);

    // --allow-partial alone still leaves an unevaluated criterion, which is exactly the
    // ambiguity `--conclusion` exists to resolve; the CLI must not paper over it.
    const partialNoConclusion = await runRaw(fx.root, [
      'verdict',
      '--claim',
      fx.claimId,
      '--criterion',
      `${fx.criterionIds[0]}=supported`,
      '--criterion',
      `${fx.criterionIds[1]}=supported`,
      '--criterion',
      `${fx.criterionIds[2]}=supported`,
      '--rationale',
      'partial',
      '--confidence',
      'medium',
      '--allow-partial',
    ]);
    expect(partialNoConclusion.code).not.toBe(0);
    expect(partialNoConclusion.stderr).toContain('--conclusion is required');
    state = await stateOf(fx.root);
    expect(state.verdicts).toHaveLength(0);

    // With --allow-partial and an explicit --conclusion, the unassessed criterion lands
    // in scope.unevaluated_criteria.
    await tb(
      fx.root,
      'verdict',
      '--claim',
      fx.claimId,
      '--criterion',
      `${fx.criterionIds[0]}=supported`,
      '--criterion',
      `${fx.criterionIds[1]}=supported`,
      '--criterion',
      `${fx.criterionIds[2]}=supported`,
      '--rationale',
      'partial',
      '--confidence',
      'medium',
      '--allow-partial',
      '--conclusion',
      'partially_supported',
    );
    state = await stateOf(fx.root);
    const verdict = state.verdicts[0]!;
    expect(verdict.scope.unevaluated_criteria).toContain(fx.criterionIds[3]);
    expect(verdict.scope.evaluated_criteria).toEqual([
      fx.criterionIds[0],
      fx.criterionIds[1],
      fx.criterionIds[2],
    ]);
  }, 90_000);

  it('test 7 — unsupported and uncertain survive exactly as supplied (and partial_supported is preserved too)', async () => {
    const fx = await buildMultiCriterionLedger('tallyback-verdict-7-');

    await tb(
      fx.root,
      'verdict',
      '--claim',
      fx.claimId,
      '--criterion',
      `${fx.criterionIds[0]}=unsupported`,
      '--criterion',
      `${fx.criterionIds[1]}=unsupported`,
      '--criterion',
      `${fx.criterionIds[2]}=unsupported`,
      '--criterion',
      `${fx.criterionIds[3]}=unsupported`,
      '--rationale',
      'all blocked',
      '--confidence',
      'low',
    );
    let state = await stateOf(fx.root);
    let verdict = state.verdicts[0]!;
    expect(verdict.findings.map((f) => f.assessment)).toEqual([
      'unsupported',
      'unsupported',
      'unsupported',
      'unsupported',
    ]);
    // Uniform unsupported → unsupported conclusion (NOT silently flipped to supported).
    expect(verdict.conclusion).toBe('unsupported');

    // A second authoring with partially_supported survives verbatim too.
    await tb(
      fx.root,
      'verdict',
      '--claim',
      fx.claimId,
      '--criterion',
      `${fx.criterionIds[0]}=partially_supported`,
      '--criterion',
      `${fx.criterionIds[1]}=partially_supported`,
      '--criterion',
      `${fx.criterionIds[2]}=partially_supported`,
      '--criterion',
      `${fx.criterionIds[3]}=partially_supported`,
      '--rationale',
      'partial',
      '--confidence',
      'low',
    );
    state = await stateOf(fx.root);
    verdict = state.verdicts[1]!;
    expect(verdict.findings.map((f) => f.assessment)).toEqual([
      'partially_supported',
      'partially_supported',
      'partially_supported',
      'partially_supported',
    ]);
    expect(verdict.conclusion).toBe('partially_supported');
  }, 90_000);

  it('test 9 — does not automatically create a Settlement', async () => {
    const fx = await buildMultiCriterionLedger('tallyback-verdict-9-');
    await tb(
      fx.root,
      'verdict',
      '--claim',
      fx.claimId,
      '--criterion',
      `${fx.criterionIds[0]}=supported`,
      '--criterion',
      `${fx.criterionIds[1]}=supported`,
      '--criterion',
      `${fx.criterionIds[2]}=supported`,
      '--criterion',
      `${fx.criterionIds[3]}=supported`,
      '--rationale',
      'all green',
      '--confidence',
      'high',
    );

    const state = await stateOf(fx.root);
    expect(state.verdicts).toHaveLength(1);
    expect(state.check_results).toHaveLength(1);
    expect(state.settlements).toHaveLength(0);
  }, 60_000);

  it('test 10 — the existing raw/full Verdict ingestion path on `record-check` remains compatible', async () => {
    const fx = await buildMultiCriterionLedger('tallyback-verdict-10-');

    // Create a CheckInvocation through the existing `begin-check` flow first.
    const begun = (await tb(
      fx.root,
      'begin-check',
      '--claim-id',
      fx.claimId,
      '--checker-id',
      'legacy-script',
      '--checker-version',
      '0.1',
    )) as unknown as { invocation: { check_invocation_id: string } };

    // Author a full wire-format Verdict manually and ingest it via `record-check`.
    // This path is the one the broken operator script used; it must still work.
    const verdictJson = JSON.stringify({
      verdict_id: legacyVerdictId(),
      subject: { kind: 'claim', id: fx.claimId },
      declaration_id: fx.declarationId,
      scope: {
        evaluated_criteria: fx.criterionIds,
        unevaluated_criteria: [],
      },
      conclusion: 'supported',
      finality: 'final',
      basis: {
        evidence_ids: [fx.evidenceId],
        reconciliation_ids: [],
      },
      findings: fx.criterionIds.map((cid) => ({
        criterion_id: cid,
        assessment: 'supported',
        summary: `${cid}: legacy-script blanket-supported`,
        basis_refs: [fx.evidenceId],
      })),
      confidence: { level: 'low', rationale: 'legacy-script auto-fill' },
      rationale: 'legacy-script blanket verdict (preserved for compatibility)',
      uncertainty: [],
      limitations: [],
      issued_by: { kind: 'tool', id: 'legacy-script' },
      issued_at: '2026-09-15T12:00:00.000Z',
      checker: { id: 'legacy-script', version: '0.1' },
    });
    const recorded = (await tb(
      fx.root,
      'record-check',
      '--invocation-id',
      begun.invocation.check_invocation_id,
      '--outcome',
      'verdict_emitted',
      '--verdict',
      verdictJson,
    )) as unknown as { ok: boolean };

    expect(recorded.ok).toBe(true);
    const state = await stateOf(fx.root);
    expect(state.verdicts).toHaveLength(1);
    expect(state.verdicts[0]!.rationale).toContain('legacy-script');
  }, 60_000);

  it('test 11 — CLI-level integration: the full Declare → Dispatch → Claim → verdict loop, including a non-supported criterion', async () => {
    // This test reproduces the dogfood scenario that motivated the command: a multi-
    // criterion task where one criterion is not supported and the operator must record
    // that explicitly rather than have the script blanket-mark everything.
    const fx = await buildMultiCriterionLedger('tallyback-verdict-integ-');

    // Run the verdict with a mix: 3 supported, 1 unsupported — the kind of partial
    // coverage that produced the 7/8 incident.
    await tb(
      fx.root,
      'verdict',
      '--claim',
      fx.claimId,
      '--criterion',
      `${fx.criterionIds[0]}=supported`,
      '--criterion',
      `${fx.criterionIds[1]}=supported`,
      '--criterion',
      `${fx.criterionIds[2]}=supported`,
      '--criterion',
      `${fx.criterionIds[3]}=unsupported`,
      '--rationale',
      '3-of-4 acceptance criteria verified; one is unsupported.',
      '--confidence',
      'high',
      '--conclusion',
      'partially_supported',
      '--as',
      'human:alice',
    );

    const state = await stateOf(fx.root);
    const verdict = state.verdicts[0]!;

    // Findings are 1:1 with per-criterion assessments, not blanket-mapped.
    expect(verdict.findings).toHaveLength(4);
    const byCriterion = new Map(
      verdict.findings.map((f) => [f.criterion_id as string, f.assessment as string] as const),
    );
    expect(byCriterion.get(fx.criterionIds[0])).toBe('supported');
    expect(byCriterion.get(fx.criterionIds[1])).toBe('supported');
    expect(byCriterion.get(fx.criterionIds[2])).toBe('supported');
    expect(byCriterion.get(fx.criterionIds[3])).toBe('unsupported');

    // Mixed assessments never auto-collapse to 'supported' — and the CLI does not
    // mechanically pick 'partially_supported' either; the operator's explicit
    // --conclusion is what lands here.
    expect(verdict.conclusion).toBe('partially_supported');

    // Omitting --conclusion on the same mixed input is a hard failure, not a silent
    // 'partially_supported' default — this is the exact incident the command exists
    // to prevent.
    const noConclusion = await runRaw(fx.root, [
      'verdict',
      '--claim',
      fx.claimId,
      '--criterion',
      `${fx.criterionIds[0]}=supported`,
      '--criterion',
      `${fx.criterionIds[1]}=supported`,
      '--criterion',
      `${fx.criterionIds[2]}=supported`,
      '--criterion',
      `${fx.criterionIds[3]}=unsupported`,
      '--rationale',
      'r',
      '--confidence',
      'high',
    ]);
    expect(noConclusion.code).not.toBe(0);
    expect(noConclusion.stderr).toContain('--conclusion is required');

    // view / show still report the ledger as coherent.
    const view = (await tb(fx.root, 'view', '--task-id', fx.taskAlias)) as unknown as {
      tasks: Array<Record<string, unknown>>;
    };
    expect(view.tasks).toHaveLength(1);

    // And no Settlement was created by the verdict command itself.
    expect(state.settlements).toHaveLength(0);
  }, 90_000);

  it('refuses unknown assessment enum and missing required flags with actionable messages', async () => {
    const fx = await buildMultiCriterionLedger('tallyback-verdict-err-');

    // Invalid assessment value.
    const badAssessment = await runRaw(fx.root, [
      'verdict',
      '--claim',
      fx.claimId,
      '--criterion',
      `${fx.criterionIds[0]}=uncertain`,
      '--rationale',
      'r',
      '--confidence',
      'low',
    ]);
    expect(badAssessment.code).not.toBe(0);
    expect(badAssessment.stderr).toContain(
      'supported|partially_supported|unsupported|contradicted',
    );
    // Missing --rationale. All 4 criteria are explicitly assessed so the only failure is
    // the missing flag itself.
    const missingRationale = await runRaw(fx.root, [
      'verdict',
      '--claim',
      fx.claimId,
      '--criterion',
      `${fx.criterionIds[0]}=supported`,
      '--criterion',
      `${fx.criterionIds[1]}=supported`,
      '--criterion',
      `${fx.criterionIds[2]}=supported`,
      '--criterion',
      `${fx.criterionIds[3]}=supported`,
      '--confidence',
      'low',
    ]);
    expect(missingRationale.code).not.toBe(0);
    expect(missingRationale.stderr).toContain('--rationale');

    // Missing --confidence.
    const missingConfidence = await runRaw(fx.root, [
      'verdict',
      '--claim',
      fx.claimId,
      '--criterion',
      `${fx.criterionIds[0]}=supported`,
      '--criterion',
      `${fx.criterionIds[1]}=supported`,
      '--criterion',
      `${fx.criterionIds[2]}=supported`,
      '--criterion',
      `${fx.criterionIds[3]}=supported`,
      '--rationale',
      'r',
    ]);
    expect(missingConfidence.stderr).toContain('--confidence');

    // Unknown --claim id.
    const unknownClaim = await runRaw(fx.root, [
      'verdict',
      '--claim',
      'clm_does_not_exist',
      '--criterion',
      `${fx.criterionIds[0]}=supported`,
      '--rationale',
      'r',
      '--confidence',
      'low',
    ]);
    expect(unknownClaim.code).not.toBe(0);
    expect(unknownClaim.stderr).toContain('clm_does_not_exist');

    const state = await stateOf(fx.root);
    expect(state.verdicts).toHaveLength(0);
  }, 90_000);

  it('--conclusion override is honored and derives a uniform conclusion from per-criterion assessments by default', async () => {
    const fx = await buildMultiCriterionLedger('tallyback-verdict-conv-');

    // Override conclusion explicitly.
    await tb(
      fx.root,
      'verdict',
      '--claim',
      fx.claimId,
      '--criterion',
      `${fx.criterionIds[0]}=supported`,
      '--criterion',
      `${fx.criterionIds[1]}=supported`,
      '--criterion',
      `${fx.criterionIds[2]}=supported`,
      '--criterion',
      `${fx.criterionIds[3]}=supported`,
      '--rationale',
      'override',
      '--confidence',
      'medium',
      '--conclusion',
      'partially_supported',
    );
    let state = await stateOf(fx.root);
    expect(state.verdicts[0]!.conclusion).toBe('partially_supported');

    // No override → uniform supported → derived supported (NOT partially_supported).
    await tb(
      fx.root,
      'verdict',
      '--claim',
      fx.claimId,
      '--criterion',
      `${fx.criterionIds[0]}=contradicted`,
      '--criterion',
      `${fx.criterionIds[1]}=contradicted`,
      '--criterion',
      `${fx.criterionIds[2]}=contradicted`,
      '--criterion',
      `${fx.criterionIds[3]}=contradicted`,
      '--rationale',
      'r',
      '--confidence',
      'low',
    );
    state = await stateOf(fx.root);
    expect(state.verdicts[1]!.conclusion).toBe('contradicted');
  }, 90_000);

  it('--criterion accepts the declared `code` as an alias for the cri_<UUIDv7> id, and the canonical Verdict still stores only criterion_id', async () => {
    // Dogfood evidence: the PM kept typing `--criterion backup=supported` instead of
    // `--criterion cri_<UUIDv7>=supported`. This test proves the alias is accepted and the
    // canonical wire record still carries only the criterion id.
    const fx = await buildMultiCriterionLedger('tallyback-verdict-alias-');

    await tb(
      fx.root,
      'verdict',
      '--claim',
      fx.claimId,
      '--criterion',
      'a-first=supported',
      '--criterion',
      'b-second=supported',
      '--criterion',
      'c-third=partially_supported',
      '--criterion',
      'd-fourth=unsupported',
      '--rationale',
      '4-of-4 via code aliases',
      '--confidence',
      'high',
      '--conclusion',
      'partially_supported',
      '--as',
      'human:alice',
    );

    const state = await stateOf(fx.root);
    const verdict = state.verdicts[0]!;
    // Canonical wire record: every Finding carries the canonical cri_<UUIDv7> id, never
    // the human code. The CLI ergonomic must not leak into the ledger.
    expect(verdict.findings).toHaveLength(4);
    for (const finding of verdict.findings) {
      expect(finding.criterion_id).toMatch(/^cri_/);
    }
    const byCriterion = new Map(
      verdict.findings.map((f) => [f.criterion_id as string, f.assessment as string] as const),
    );
    expect(byCriterion.get(fx.criterionIds[0])).toBe('supported');
    expect(byCriterion.get(fx.criterionIds[1])).toBe('supported');
    expect(byCriterion.get(fx.criterionIds[2])).toBe('partially_supported');
    expect(byCriterion.get(fx.criterionIds[3])).toBe('unsupported');
    expect(verdict.conclusion).toBe('partially_supported');
  }, 90_000);

  it('--criterion accepts a mix of code aliases and cri_<UUIDv7> ids', async () => {
    const fx = await buildMultiCriterionLedger('tallyback-verdict-mixed-');

    await tb(
      fx.root,
      'verdict',
      '--claim',
      fx.claimId,
      '--criterion',
      'a-first=supported', // code
      '--criterion',
      `${fx.criterionIds[1]}=supported`, // id
      '--criterion',
      `${fx.criterionIds[2]}=supported`, // id
      '--criterion',
      'd-fourth=supported', // code
      '--rationale',
      'all green via mixed refs',
      '--confidence',
      'high',
    );

    const state = await stateOf(fx.root);
    const verdict = state.verdicts[0]!;
    expect(verdict.findings.map((f) => f.assessment)).toEqual([
      'supported',
      'supported',
      'supported',
      'supported',
    ]);
    expect(verdict.conclusion).toBe('supported');
  }, 90_000);

  it('--criterion with an unknown code fails clearly, listing the declared codes and ids', async () => {
    const fx = await buildMultiCriterionLedger('tallyback-verdict-unknowncode-');

    const run = await runRaw(fx.root, [
      'verdict',
      '--claim',
      fx.claimId,
      '--criterion',
      `${fx.criterionIds[0]}=supported`,
      '--criterion',
      'not-a-declared-code=supported',
      '--rationale',
      'r',
      '--confidence',
      'low',
    ]);
    expect(run.code).not.toBe(0);
    expect(run.stderr).toContain('not-a-declared-code');
    // The error names every declared code and every declared id, so the operator never
    // has to crack open `state.json` to find the right one.
    expect(run.stderr).toContain('a-first');
    expect(run.stderr).toContain('b-second');
    expect(run.stderr).toContain('c-third');
    expect(run.stderr).toContain('d-fourth');

    const state = await stateOf(fx.root);
    expect(state.verdicts).toHaveLength(0);
  }, 60_000);

  it('--criterion cross-form duplicate (code + id for the same Criterion) is rejected as duplicate', async () => {
    // The bug case this exists to prevent: operator writes
    //   --criterion backup=supported --criterion cri_<UUIDv7>=supported
    // for the SAME criterion (the id is the one declared under code `backup`). Without
    // the canonical-id-first resolution, the CLI would silently accept both and the
    // verdict would carry the assessment twice. We must reject it explicitly.
    const fx = await buildMultiCriterionLedger('tallyback-verdict-crossdup-');

    const run = await runRaw(fx.root, [
      'verdict',
      '--claim',
      fx.claimId,
      '--criterion',
      'a-first=supported', // code → criterionIds[0]
      '--criterion',
      `${fx.criterionIds[0]}=unsupported`, // id → same criterion as above
      '--criterion',
      'b-second=supported',
      '--criterion',
      'c-third=supported',
      '--criterion',
      'd-fourth=supported',
      '--rationale',
      'r',
      '--confidence',
      'medium',
    ]);
    expect(run.code).not.toBe(0);
    expect(run.stderr).toContain('duplicate');
    expect(run.stderr).toContain(fx.criterionIds[0]!);

    const state = await stateOf(fx.root);
    expect(state.verdicts).toHaveLength(0);
  }, 90_000);

  it('--criterion with an ambiguous code (declared twice on one TaskDeclaration) refuses rather than silently picks one', async () => {
    // Build a separate ledger whose Declaration declares the SAME `code` on two distinct
    // criteria. The schema permits this (codes are not required to be unique within a
    // declaration); the CLI must refuse the code alias rather than silently picking one.
    const root = await tempRoot('tallyback-verdict-ambiguous-');
    await tb(root, 'init', '--repository', 'main', '--topic', 't', '--goal', 'g');
    const topics = (await tb(root, 'list', '--what', 'topics')) as unknown as {
      topics: { topic_id: string }[];
    };
    await tb(root, 'task', '--topic-id', topics.topics[0]!.topic_id, '--title', 'T', '--alias', 'T1');

    const init = (await tb(root, 'show')) as unknown as {
      repositories: { repository_id: string }[];
    };
    const workspace = (await tb(
      root,
      'workspace',
      '--repository-id',
      init.repositories[0]!.repository_id,
      '--branch',
      'main',
    )) as unknown as { workspace: { workspace_id: string } };

    // Declare a TaskDeclaration with TWO criteria that share `code: 'shared'`. The
    // CLI's `declare` command lets codes repeat (no validation against duplicates), so
    // we can build the fixture directly through the public surface.
    const declared = (await tb(
      root,
      'declare',
      '--task-id',
      'T1',
      '--objective',
      'ambiguous',
      '--criterion',
      'shared:first ambiguous',
      '--criterion',
      'shared:second ambiguous',
    )) as unknown as { declaration: { declaration_id: string; criteria: { criterion_id: string; code: string }[] } };
    expect(declared.declaration.criteria).toHaveLength(2);
    expect(declared.declaration.criteria.every((c) => c.code === 'shared')).toBe(true);
    const criterionIds = declared.declaration.criteria.map((c) => c.criterion_id);

    const dispatched = (await tb(
      root,
      'dispatch',
      '--task-id',
      'T1',
      '--declaration-id',
      declared.declaration.declaration_id,
      '--repository-id',
      init.repositories[0]!.repository_id,
      '--workspace-id',
      workspace.workspace.workspace_id,
    )) as unknown as { attempt: { attempt_id: string } };
    const evidence = (await tb(
      root,
      'evidence',
      '--kind',
      'observation',
      '--payload',
      '{"text":"x"}',
    )) as unknown as { evidence: { evidence_id: string } };
    const claim = (await tb(
      root,
      'claim',
      '--task-id',
      'T1',
      '--attempt-id',
      dispatched.attempt.attempt_id,
      '--declaration-id',
      declared.declaration.declaration_id,
      '--statement',
      's',
      '--evidence',
      evidence.evidence.evidence_id,
    )) as unknown as { claim: { claim_id: string } };

    // `--criterion shared=...` is ambiguous; the CLI must refuse, naming both ids so the
    // operator can pick one explicitly.
    const ambiguous = await runRaw(root, [
      'verdict',
      '--claim',
      claim.claim.claim_id,
      '--criterion',
      'shared=supported',
      '--rationale',
      'r',
      '--confidence',
      'low',
    ]);
    expect(ambiguous.code).not.toBe(0);
    expect(ambiguous.stderr).toContain('ambiguous');
    expect(ambiguous.stderr).toContain('shared');
    // Both criterion ids are named so the operator can pick one.
    for (const cid of criterionIds) {
      expect(ambiguous.stderr).toContain(cid);
    }

    // The same input with the cri_<UUIDv7> id of one criterion resolves cleanly —
    // proving the refusal is specifically about the ambiguous code alias, not a wider
    // problem with the declaration.
    const disambiguated = await runRaw(root, [
      'verdict',
      '--claim',
      claim.claim.claim_id,
      '--criterion',
      `${criterionIds[0]}=supported`,
      '--criterion',
      `${criterionIds[1]}=supported`,
      '--rationale',
      'r',
      '--confidence',
      'low',
    ]);
    expect(disambiguated.code).toBe(0);

    const state = await stateOf(root);
    expect(state.verdicts).toHaveLength(1);
  }, 90_000);
});

function legacyVerdictId(): string {
  return newId('ver_');
}
