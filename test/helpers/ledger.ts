/**
 * Shared test scaffolding for building a real, persisted ledger in a temp directory.
 *
 * These helpers deliberately drive the **public** Store command surface rather than
 * poking records in by hand: a fixture built through `createTopic` → `createTask` →
 * `declare` → `registerWorkspace` → `dispatch` is a fixture that proves the public
 * surface is reachable, which is half of what the tests here are for.
 */

import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Store } from '../../src/ledger/index.js';
import type { Actor } from '../../src/contract/index.js';

export const ALICE: Actor = { kind: 'human', id: 'alice' };
export const AGENT: Actor = { kind: 'executor', id: 'agent-7' };

export async function tempRoot(prefix = 'tallyback-'): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

export interface LedgerFixture {
  root: string;
  store: Store;
  project_id: string;
  repository_id: string;
  workspace_id: string;
  topic_id: string;
  task_id: string;
  declaration_id: string;
  criterion_id: string;
  attempt_id: string;
  evidence_id: string;
  claim_id: string;
}

function unwrap<T extends object>(outcome: { ok: boolean; code?: string } & Partial<T>): T {
  if (!outcome.ok) {
    throw new Error(`store command failed: ${String(outcome.code)}`);
  }
  return outcome as unknown as T;
}

/**
 * Build a ledger carrying a complete Declare → Dispatch → Observe chain, up to (but not
 * including) a Check. Everything goes through the public command surface.
 */
export async function buildLedger(prefix = 'tallyback-'): Promise<LedgerFixture> {
  const root = await tempRoot(prefix);
  const store = await Store.init(root, { repositories: [{ alias: 'main' }] });

  const repository_id = store.listRepositories()[0]!.repository_id;

  const { topic } = unwrap<{ topic: { topic_id: string } }>(
    await store.createTopic({ name: 'release', goal: 'ship v1', created_by: ALICE }),
  );
  const { task } = unwrap<{ task: { task_id: string } }>(
    await store.createTask({
      topic_id: topic.topic_id,
      title: 'Implement validation',
      alias: 'T1',
    }),
  );
  const { declaration } = unwrap<{
    declaration: { declaration_id: string; criteria: { criterion_id: string }[] };
  }>(
    await store.declare({
      task_id: task.task_id,
      objective: 'Implement validation for imported records.',
      criteria: [{ code: 'invalid-record-rejected', statement: 'An invalid record is rejected.' }],
      declared_by: ALICE,
    }),
  );
  const { workspace } = unwrap<{ workspace: { workspace_id: string } }>(
    await store.registerWorkspace({ repository_id, branch: 'main' }),
  );
  const { attempt } = unwrap<{ attempt: { attempt_id: string } }>(
    await store.dispatch({
      task_id: task.task_id,
      declaration_id: declaration.declaration_id,
      repository_id,
      workspace_id: workspace.workspace_id,
      executor: AGENT,
      dispatched_by: ALICE,
    }),
  );
  const { evidence } = unwrap<{ evidence: { evidence_id: string } }>(
    await store.observeEvidence({
      kind: 'observation',
      submitted_by: AGENT,
      payload: { text: 'the validation logic was added' },
    }),
  );
  const { claim } = unwrap<{ claim: { claim_id: string } }>(
    await store.observeClaim({
      task_id: task.task_id,
      attempt_id: attempt.attempt_id,
      declaration_id: declaration.declaration_id,
      statement: 'The declared validation work is complete.',
      evidence_ids: [evidence.evidence_id],
      claimed_by: AGENT,
    }),
  );

  return {
    root,
    store,
    project_id: store.currentSnapshot().project.project_id,
    repository_id,
    workspace_id: workspace.workspace_id,
    topic_id: topic.topic_id,
    task_id: task.task_id,
    declaration_id: declaration.declaration_id,
    criterion_id: declaration.criteria[0]!.criterion_id,
    attempt_id: attempt.attempt_id,
    evidence_id: evidence.evidence_id,
    claim_id: claim.claim_id,
  };
}
