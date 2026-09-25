/**
 * Repository registration and the project.json ↔ state.json header pair.
 *
 * The repository set lives in three places that must agree: `project.json`'s
 * `repositories`, the `state.json` Project record's `repositories`, and the `state.json`
 * Repository collection. SPEC §5.2 fixes that set at init. These regressions pin:
 *
 * - an append cannot mint a Repository the Project does not declare (it would exist in
 *   the Repository collection only, splitting the three copies);
 * - a long-lived Store compares the header and snapshot as they are on disk NOW, not
 *   against the header it cached at open, so a consistent out-of-band rewrite of both
 *   files does not break its next command — while a genuine contradiction still does;
 * - a header left disagreeing with the authoritative `state.json` is reported as
 *   reconcilable and repaired only on an explicit `--repair-header`, from state.json.
 */

import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import type { Snapshot } from '../src/contract/index.js';
import { diagnoseLedger, reconcileLedger, Store } from '../src/ledger/index.js';
import { readProject, readSnapshot, type ProjectManifest } from '../src/ledger/snapshot.js';
import { buildLedger } from './helpers/ledger.js';

const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

const EXTRA_REPO = { repository_id: 'repo_0190b1c0-0000-7000-8000-0000000000ee', alias: 'docs' };

const byId = (a: { repository_id: string }, b: { repository_id: string }): number =>
  a.repository_id < b.repository_id ? -1 : a.repository_id > b.repository_id ? 1 : 0;

async function readJsonFile<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/** Add a repository to the header only — the state a half-finished write leaves behind. */
async function addRepoToHeaderOnly(root: string): Promise<void> {
  const path = join(root, '.tallyback', 'project.json');
  const manifest = await readJsonFile<ProjectManifest>(path);
  manifest.repositories = [...manifest.repositories, EXTRA_REPO].sort(byId);
  await writeJsonFile(path, manifest);
}

describe('an append cannot register a Repository the Project does not declare', () => {
  it('rejects the append and leaves the ledger untouched', async () => {
    const { root, store } = await buildLedger('tallyback-repo-');
    const before = await readFile(join(root, '.tallyback', 'state.json'), 'utf8');

    const result = await store.append({
      kind: 'append_records',
      expected_revision: store.currentRevision(),
      records: [EXTRA_REPO],
      provenance: { submitted_by: { kind: 'tool', id: 'test' } },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invariant.reference_inconsistent');
    expect(await readFile(join(root, '.tallyback', 'state.json'), 'utf8')).toBe(before);
    expect(store.listRepositories().map((r) => r.repository_id)).not.toContain(
      EXTRA_REPO.repository_id,
    );
  });

  it('refuses to open a snapshot carrying an undeclared Repository record', async () => {
    const { root } = await buildLedger('tallyback-repo-');
    const path = join(root, '.tallyback', 'state.json');
    const snapshot = await readJsonFile<Snapshot>(path);
    snapshot.repositories = [...snapshot.repositories, EXTRA_REPO].sort(byId);
    await writeJsonFile(path, snapshot);

    await expect(Store.open(root)).rejects.toMatchObject({
      code: 'invariant.reference_inconsistent',
    });
  });
});

describe('a long-lived Store reloads the header along with the snapshot', () => {
  it('accepts a consistent out-of-band rewrite of both files on its next command', async () => {
    const { root, store, topic_id } = await buildLedger('tallyback-repo-');
    const dir = join(root, '.tallyback');

    // Another process rewrites both portable files consistently (as a migration or a
    // header repair would), after `store` cached its header at open.
    const manifest = await readJsonFile<ProjectManifest>(join(dir, 'project.json'));
    const snapshot = await readJsonFile<Snapshot>(join(dir, 'state.json'));
    const repositories = [...manifest.repositories, EXTRA_REPO].sort(byId);
    manifest.repositories = repositories;
    snapshot.project.repositories = repositories;
    snapshot.repositories = [...snapshot.repositories, EXTRA_REPO].sort(byId);
    await writeJsonFile(join(dir, 'project.json'), manifest);
    await writeJsonFile(join(dir, 'state.json'), snapshot);

    const outcome = await store.createTask({ topic_id, title: 'after the rewrite' });
    expect(outcome.ok).toBe(true);
    expect(store.currentManifest().repositories).toEqual(repositories);
  });

  it('still fails closed when the two files genuinely disagree on disk', async () => {
    const { root, store, topic_id } = await buildLedger('tallyback-repo-');
    await addRepoToHeaderOnly(root);

    await expect(store.createTask({ topic_id, title: 'must not land' })).rejects.toMatchObject({
      code: 'invariant.project_repositories_mismatch',
    });
  });
});

describe('a header left disagreeing with state.json is repairable, explicitly', () => {
  it('is diagnosed as reconcilable', async () => {
    const { root } = await buildLedger('tallyback-repo-');
    await addRepoToHeaderOnly(root);

    const diagnosis = await diagnoseLedger(root);
    expect(diagnosis.problems).toEqual([
      expect.objectContaining({
        code: 'invariant.project_repositories_mismatch',
        reconcilable: true,
      }),
    ]);
  });

  it('writes nothing without --repair-header, and names the flag', async () => {
    const { root } = await buildLedger('tallyback-repo-');
    await addRepoToHeaderOnly(root);
    const header = await readFile(join(root, '.tallyback', 'project.json'), 'utf8');

    const outcome = await reconcileLedger({ projectRoot: root, keep: [] });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe('invariant.project_repositories_mismatch');
      expect(outcome.message).toContain('--repair-header');
    }
    expect(await readFile(join(root, '.tallyback', 'project.json'), 'utf8')).toBe(header);
  });

  it('a dry run reports the header repair without writing it', async () => {
    const { root } = await buildLedger('tallyback-repo-');
    await addRepoToHeaderOnly(root);
    const header = await readFile(join(root, '.tallyback', 'project.json'), 'utf8');
    const state = await readSnapshot(join(root, '.tallyback'));

    const outcome = await reconcileLedger({
      projectRoot: root,
      keep: [],
      dryRun: true,
      repairHeader: true,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.wrote).toBe(false);
      expect(outcome.plan.header?.to).toEqual(state.project.repositories);
      expect(outcome.plan.header?.from).toContainEqual(EXTRA_REPO);
    }
    expect(await readFile(join(root, '.tallyback', 'project.json'), 'utf8')).toBe(header);
  });

  it('rebuilds project.json from state.json and leaves state.json byte-identical', async () => {
    const { root } = await buildLedger('tallyback-repo-');
    await addRepoToHeaderOnly(root);
    const statePath = join(root, '.tallyback', 'state.json');
    const stateBefore = await readFile(statePath, 'utf8');

    const outcome = await reconcileLedger({ projectRoot: root, keep: [], repairHeader: true });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.wrote).toBe(true);
      expect(outcome.plan.rewrites).toEqual([]);
    }

    expect(await readFile(statePath, 'utf8')).toBe(stateBefore);
    const repaired = await readProject(join(root, '.tallyback'));
    const snapshot = JSON.parse(stateBefore) as Snapshot;
    expect(repaired).toEqual({
      project_id: snapshot.project.project_id,
      repositories: snapshot.project.repositories,
    });
    await expect(Store.open(root)).resolves.toBeInstanceOf(Store);
    expect((await diagnoseLedger(root)).ok).toBe(true);
  });

  it('never repairs a project identity mismatch', async () => {
    const { root } = await buildLedger('tallyback-repo-');
    const path = join(root, '.tallyback', 'project.json');
    const manifest = await readJsonFile<ProjectManifest>(path);
    manifest.project_id = 'prj_0190b1c0-0000-7000-8000-0000000000ff';
    await writeJsonFile(path, manifest);
    const header = await readFile(path, 'utf8');

    const outcome = await reconcileLedger({ projectRoot: root, keep: [], repairHeader: true });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('invariant.project_identity_mismatch');
    expect(await readFile(path, 'utf8')).toBe(header);
  });

  it('works end-to-end through the CLI: validate names the flag, reconcile applies it', async () => {
    const { root } = await buildLedger('tallyback-repo-cli-');
    await addRepoToHeaderOnly(root);
    const tsx = join(ROOT, 'node_modules', '.bin', 'tsx');
    const cli = join(ROOT, 'src', 'cli.ts');
    const run = async (
      args: string[],
    ): Promise<{ code: number; json: Record<string, unknown> }> => {
      try {
        const { stdout } = await execFileAsync(tsx, [cli, ...args, '--project-root', root], {
          cwd: ROOT,
        });
        return { code: 0, json: JSON.parse(stdout) as Record<string, unknown> };
      } catch (err) {
        const e = err as { code?: number; stdout?: string };
        return { code: e.code ?? 1, json: JSON.parse(e.stdout ?? '{}') as Record<string, unknown> };
      }
    };

    const failed = await run(['validate']);
    expect(failed.code).toBe(1);
    expect(failed.json['next']).toBe('tallyback reconcile --repair-header');

    const repaired = await run(['reconcile', '--repair-header']);
    expect(repaired.code).toBe(0);
    expect(repaired.json).toMatchObject({ ok: true, wrote: true });

    const passed = await run(['validate']);
    expect(passed.code).toBe(0);
  }, 60_000);
});
