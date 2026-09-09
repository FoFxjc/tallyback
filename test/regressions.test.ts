/**
 * The seven regression demonstrations the review requires, each proved directly.
 *
 * The broader suites (`concurrency`, `reference-integrity`, `canonicalization`,
 * `check-flow`, `cli`, `migration-workflow`, `persistence`) cover these areas in depth.
 * This file exists so each required demonstration is a single, named, self-contained
 * proof that a reader can point at.
 */

import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import canonicalizeModule from 'canonicalize';

/** The reference RFC 8785 implementation, as an independent cross-check. */
const canonicalize = canonicalizeModule as unknown as (value: unknown) => string;
import { describe, expect, it } from 'vitest';

import { runCheck, type Checker } from '../src/check/flow.js';
import { jcs, validate_snapshot } from '../src/contract/index.js';
import type { Snapshot } from '../src/contract/index.js';
import { applyAppend } from '../src/ledger/append.js';
import { Store } from '../src/ledger/index.js';
import { newId, snapshotDigest } from '../src/ledger/snapshot.js';
import { buildLedger, tempRoot } from './helpers/ledger.js';

const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const FIXTURES = join(ROOT, 'contract', 'fixtures');

const loadSnapshot = (kind: 'valid' | 'invalid', name: string): Snapshot =>
  JSON.parse(readFileSync(join(FIXTURES, 'snapshots', kind, `${name}.json`), 'utf8')) as Snapshot;

describe('regression 1 — two Store instances writing from the same starting revision', () => {
  it('first succeeds, second gets mutation.revision_conflict, reopening keeps the first write', async () => {
    const { root, store: first, topic_id } = await buildLedger('tallyback-reg1-');
    const second = await Store.open(root);
    const start = first.currentRevision();
    expect(second.currentRevision()).toBe(start);

    const a = await first.createTask({ topic_id, title: 'first writer' });
    const b = await second.createTask({ topic_id, title: 'second writer' }, start);

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.code).toBe('mutation.revision_conflict');

    const reopened = await Store.open(root);
    expect(reopened.currentRevision()).toBe(start + 1);
    expect(reopened.listTasks().map((t) => t.title)).toContain('first writer');
    expect(reopened.listTasks().map((t) => t.title)).not.toContain('second writer');
  });
});

describe('regression 2 — the malformed CheckResult is rejected', () => {
  it('rejects outcome verdict_emitted with a null verdict_id and nonexistent reconciliation_ids', () => {
    const snapshot = loadSnapshot('invalid', 'checkresult-emitted-null-verdict');
    const result = snapshot.check_results[0]!;

    // The fixture is exactly the shape the review names.
    expect(result.outcome).toBe('verdict_emitted');
    expect(result.verdict_id).toBeNull();
    const referenced = result.reconciliation_ids ?? [];
    expect(referenced.length).toBeGreaterThan(0);
    for (const id of referenced) {
      expect(snapshot.reconciliations.map((r) => r.reconciliation_id)).not.toContain(id);
    }

    const validation = validate_snapshot(snapshot);
    expect(validation.ok).toBe(false);
    if (!validation.ok) expect(validation.code).toBe('invariant.check_result_outcome_mismatch');
  });
});

describe('regression 3 — a duplicate claim.evidence_ids array is rejected', () => {
  it('rejects it in a snapshot', () => {
    const validation = validate_snapshot(loadSnapshot('invalid', 'set-array-duplicate'));
    expect(validation.ok).toBe(false);
    if (!validation.ok) expect(validation.code).toBe('schema.set_array_duplicate');
  });

  it('rejects it on the way in, rather than silently de-duplicating it', () => {
    const fixture = JSON.parse(
      readFileSync(
        join(FIXTURES, 'mutations', 'rejected', 'reject-duplicate-claim-evidence.json'),
        'utf8',
      ),
    ) as { before: Snapshot; operation: never };
    const before = structuredClone(fixture.before);
    const result = applyAppend(fixture.before, fixture.operation);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('schema.set_array_duplicate');
    // And nothing was mutated on the way to that refusal.
    expect(fixture.before).toEqual(before);
  });

  it('rejects it end-to-end through the Store command surface', async () => {
    const fixture = await buildLedger('tallyback-reg3-');
    const outcome = await fixture.store.append({
      kind: 'append_records',
      expected_revision: fixture.store.currentRevision(),
      records: [
        {
          claim_id: newId('clm_'),
          task_id: fixture.task_id,
          attempt_id: fixture.attempt_id,
          declaration_id: fixture.declaration_id,
          statement: 'a claim citing the same evidence twice',
          evidence_ids: [fixture.evidence_id, fixture.evidence_id],
          claimed_by: { kind: 'executor', id: 'agent-7' },
          claimed_at: new Date().toISOString(),
        } as never,
      ],
      provenance: { submitted_by: { kind: 'tool', id: 'tallyback' } },
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('schema.set_array_duplicate');
  });
});

describe('regression 4 — JCS ordering for the emoji / private-use pair', () => {
  it('matches RFC 8785 ordering and the reference library', () => {
    const value = { '\u{1F600}': 1, '': 2 };
    // The emoji's lead surrogate D83D sorts below E000, so it comes FIRST.
    expect(jcs(value)).toBe('{"\u{1F600}":1,"":2}');
    expect(jcs(value)).toBe(canonicalize(value));
    // Insertion order is irrelevant to the canonical form.
    expect(jcs({ '': 2, '\u{1F600}': 1 })).toBe(jcs(value));
  });
});

describe('regression 5 — an old Verdict survives a superseding declaration', () => {
  it('stays valid when the new declaration retains the same criterion_id', () => {
    const snapshot = loadSnapshot('valid', 'superseding-declaration-retains-criterion');
    const superseding = snapshot.declarations.find((d) => d.supersedes !== undefined)!;
    const superseded = snapshot.declarations.find((d) => d.supersedes === undefined)!;
    const verdict = snapshot.verdicts[0]!;

    expect(superseding.supersedes).toBe(superseded.declaration_id);
    expect(superseding.criteria[0]!.criterion_id).toBe(superseded.criteria[0]!.criterion_id);
    expect(verdict.declaration_id).toBe(superseded.declaration_id);
    expect(verdict.scope.evaluated_criteria).toContain(superseded.criteria[0]!.criterion_id);

    expect(validate_snapshot(snapshot).ok).toBe(true);
  });

  it('still rejects a genuinely foreign criterion, so the distinction is not lost', () => {
    const validation = validate_snapshot(loadSnapshot('invalid', 'verdict-foreign-criterion'));
    expect(validation.ok).toBe(false);
    if (!validation.ok) expect(validation.code).toBe('invariant.verdict_foreign_criterion');
  });
});

describe('regression 6 — runCheck persists both the invocation and the result', () => {
  it('leaves a chk_ and a ckr_ in the persisted ledger', async () => {
    const fixture = await buildLedger('tallyback-reg6-');
    const checkerFn: Checker = () => ({
      kind: 'withheld',
      code: 'check.checker_semantics_missing',
      reason: 'no checker installed',
      reconciliations: [],
      evidence: [],
    });

    const outcome = await runCheck({
      subject: { kind: 'claim', id: fixture.claim_id },
      checker: { id: 'done-or-not', version: '1' },
      checkerFn,
      store: fixture.store,
      resolution: {} as never,
      digestFn: snapshotDigest,
    });
    expect(outcome.recorded).toBe(true);

    // Read state.json straight off disk: no in-memory store to take our word for it.
    const persisted = JSON.parse(
      await readFile(join(fixture.root, '.tallyback', 'state.json'), 'utf8'),
    ) as Snapshot;
    expect(persisted.check_invocations.map((c) => c.check_invocation_id)).toContain(
      outcome.invocation.check_invocation_id,
    );
    expect(persisted.check_results.map((c) => c.check_result_id)).toContain(
      outcome.bundle.check_result.check_result_id,
    );
    expect(validate_snapshot(persisted).ok).toBe(true);
  });
});

describe('regression 7 — the complete workflow through public CLI commands only', () => {
  it('reaches a Settlement using nothing but documented commands', async () => {
    const root = await tempRoot('tallyback-reg7-');
    const worktree = await tempRoot('tallyback-reg7-wt-');
    const tsx = join(ROOT, 'node_modules', '.bin', 'tsx');
    const cli = join(ROOT, 'src', 'cli.ts');

    const tb = async (...args: string[]): Promise<Record<string, never>> => {
      const { stdout } = await execFileAsync(tsx, [cli, ...args, '--project-root', root], {
        cwd: ROOT,
      });
      return JSON.parse(stdout) as Record<string, never>;
    };

    const init = (await tb('init', '--repository', 'main', '--topic', 'release')) as unknown as {
      repositories: { repository_id: string }[];
      topics: { topic_id: string }[];
    };
    const repo = init.repositories[0]!.repository_id;
    const topic = init.topics[0]!.topic_id;

    await tb('task', '--topic-id', topic, '--title', 'Implement validation', '--alias', 'T1');
    const declared = (await tb(
      'declare',
      '--task-id',
      'T1',
      '--objective',
      'Implement validation.',
      '--criterion',
      'invalid-rejected:An invalid record is rejected.',
    )) as unknown as {
      declaration: { declaration_id: string };
    };
    const workspace = (await tb('workspace', '--repository-id', repo)) as unknown as {
      workspace: { workspace_id: string };
    };
    await tb(
      'bind',
      '--repository-id',
      repo,
      '--workspace-id',
      workspace.workspace.workspace_id,
      '--root',
      worktree,
    );
    const attempt = (await tb(
      'dispatch',
      '--task-id',
      'T1',
      '--declaration-id',
      declared.declaration.declaration_id,
      '--repository-id',
      repo,
      '--workspace-id',
      workspace.workspace.workspace_id,
      '--executor',
      'subagent:agent-7',
    )) as unknown as { attempt: { attempt_id: string } };
    const evidence = (await tb(
      'evidence',
      '--kind',
      'observation',
      '--payload',
      '{"text":"work done"}',
    )) as unknown as { evidence: { evidence_id: string } };
    const claim = (await tb(
      'claim',
      '--task-id',
      'T1',
      '--attempt-id',
      attempt.attempt.attempt_id,
      '--declaration-id',
      declared.declaration.declaration_id,
      '--statement',
      'The declared work is complete.',
      '--evidence',
      evidence.evidence.evidence_id,
    )) as unknown as { claim: { claim_id: string } };
    const begun = (await tb(
      'begin-check',
      '--claim-id',
      claim.claim.claim_id,
      '--checker-id',
      'done-or-not',
      '--checker-version',
      '1',
    )) as unknown as {
      invocation: { check_invocation_id: string };
    };
    await tb(
      'record-check',
      '--invocation-id',
      begun.invocation.check_invocation_id,
      '--outcome',
      'verdict_withheld',
      '--diagnostic',
      'check.checker_semantics_missing:no checker installed',
    );
    const settled = (await tb(
      'settle',
      '--task-id',
      'T1',
      '--attempt-id',
      attempt.attempt.attempt_id,
      '--decision',
      'accept',
      '--verification-exception',
      'accepted by hand',
      '--rationale',
      'reviewed manually',
    )) as unknown as { ok: boolean };

    expect(settled.ok).toBe(true);
    const store = await Store.open(root);
    expect(store.validate_snapshot().ok).toBe(true);
    expect(store.currentSnapshot().settlements).toHaveLength(1);
    expect(store.currentSnapshot().check_results).toHaveLength(1);
  }, 120_000);
});
