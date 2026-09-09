/**
 * Portable header and machine-local binding validation.
 *
 * `project.json` is a bootstrap + validated header; `state.json` is the authority
 * (SPEC §6). Loading a ledger must therefore validate the header against its frozen
 * schema, confirm the two files agree on Project and Repository identity, validate the
 * bindings when they are used, and reject contradictory identity data with stable
 * namespaced codes rather than letting one file silently win.
 *
 * And the boundary that makes the ledger portable at all: absolute paths live only in
 * `runtime/bindings.json` and never reach a committable file.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { Store } from '../src/ledger/index.js';
import {
  assertNoAbsolutePaths,
  readBindings,
  writeBindings,
  writeProject,
  writeSnapshot,
} from '../src/ledger/snapshot.js';
import { validate_bindings, validate_project_manifest } from '../src/contract/index.js';
import { buildLedger } from './helpers/ledger.js';

async function patchProject(
  root: string,
  patch: (manifest: Record<string, unknown>) => void,
): Promise<void> {
  const path = join(root, '.tallyback', 'project.json');
  const manifest = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
  patch(manifest);
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

describe('project.json validation on load', () => {
  it('rejects a manifest that does not satisfy project.schema.json', async () => {
    const { root } = await buildLedger('tallyback-hdr-');
    await patchProject(root, (m) => {
      m['repositories'] = 'not an array';
    });
    await expect(Store.open(root)).rejects.toMatchObject({
      code: 'schema.invalid_project_manifest',
    });
  });

  it('rejects a manifest carrying an unknown property', async () => {
    const { root } = await buildLedger('tallyback-hdr-');
    await patchProject(root, (m) => {
      m['local_path'] = '/Users/alice/workspace';
    });
    await expect(Store.open(root)).rejects.toMatchObject({
      code: 'schema.invalid_project_manifest',
    });
  });

  it('rejects a manifest that is not readable JSON', async () => {
    const { root } = await buildLedger('tallyback-hdr-');
    await writeFile(join(root, '.tallyback', 'project.json'), '{ not json', 'utf8');
    await expect(Store.open(root)).rejects.toMatchObject({
      code: 'schema.invalid_project_manifest',
    });
  });
});

describe('project.json ↔ state.json agreement', () => {
  it('rejects a project identity mismatch', async () => {
    const { root } = await buildLedger('tallyback-hdr-');
    await patchProject(root, (m) => {
      m['project_id'] = 'prj_0190b1c0-0000-7000-8000-0000000000ff';
    });
    await expect(Store.open(root)).rejects.toMatchObject({
      code: 'invariant.project_identity_mismatch',
    });
  });

  it('rejects contradictory Repository declarations between the two files', async () => {
    const { root } = await buildLedger('tallyback-hdr-');
    await patchProject(root, (m) => {
      const repos = m['repositories'] as { alias: string }[];
      repos[0]!.alias = 'renamed-in-the-header-only';
    });
    await expect(Store.open(root)).rejects.toMatchObject({
      code: 'invariant.project_repositories_mismatch',
    });
  });

  it('rejects a header that declares a Repository the snapshot does not', async () => {
    const { root } = await buildLedger('tallyback-hdr-');
    await patchProject(root, (m) => {
      (m['repositories'] as unknown[]).push({
        repository_id: 'repo_0190b1c0-0000-7000-8000-0000000000ff',
        alias: 'phantom',
      });
    });
    await expect(Store.open(root)).rejects.toMatchObject({
      code: 'invariant.project_repositories_mismatch',
    });
  });

  it('accepts a header whose repositories agree regardless of their order', async () => {
    const { root, store } = await buildLedger('tallyback-hdr-');
    const second = await store.registerWorkspace({
      repository_id: store.listRepositories()[0]!.repository_id,
    });
    expect(second.ok).toBe(true);
    await patchProject(root, (m) => {
      (m['repositories'] as unknown[]).reverse();
    });
    await expect(Store.open(root)).resolves.toBeInstanceOf(Store);
  });
});

describe('runtime/bindings.json validation', () => {
  it('treats a missing bindings file as "nothing bound yet"', async () => {
    const { root } = await buildLedger('tallyback-hdr-');
    const { rm } = await import('node:fs/promises');
    await rm(join(root, '.tallyback', 'runtime', 'bindings.json'), { force: true });
    await expect(readBindings(join(root, '.tallyback'))).resolves.toEqual({ repositories: {} });
  });

  it('fails closed on a malformed bindings file rather than silently losing bindings', async () => {
    const { root } = await buildLedger('tallyback-hdr-');
    const path = join(root, '.tallyback', 'runtime', 'bindings.json');
    await writeFile(path, JSON.stringify({ repositories: { 'not-a-repo-id': {} } }), 'utf8');
    await expect(readBindings(join(root, '.tallyback'))).rejects.toMatchObject({
      code: 'schema.invalid_bindings',
    });

    await writeFile(path, '{ not json', 'utf8');
    await expect(readBindings(join(root, '.tallyback'))).rejects.toMatchObject({
      code: 'schema.invalid_bindings',
    });
  });

  it('refuses to write bindings that do not satisfy the schema', async () => {
    const { root } = await buildLedger('tallyback-hdr-');
    await expect(
      writeBindings(join(root, '.tallyback'), {
        repositories: { nope: { workspaces: {} } },
      } as never),
    ).rejects.toMatchObject({ code: 'schema.invalid_bindings' });
  });

  it('rejects a binding whose workspace belongs to another repository', async () => {
    const { root, store, workspace_id } = await buildLedger('tallyback-hdr-');
    const outcome = await store.bindWorkspace({
      repository_id: 'repo_0190b1c0-0000-7000-8000-0000000000ff',
      workspace_id,
      root,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('invariant.reference_unresolved');
  });

  it('validates the schemas directly, as the contract entry points', () => {
    expect(validate_project_manifest({ project_id: 'nope', repositories: [] }).ok).toBe(false);
    expect(
      validate_project_manifest({
        project_id: 'prj_0190b1c0-0000-7000-8000-000000000001',
        repositories: [],
      }).ok,
    ).toBe(true);
    expect(validate_bindings({ repositories: {} }).ok).toBe(true);
    expect(validate_bindings({}).ok).toBe(false);
  });
});

describe('absolute paths never leak into a portable file', () => {
  it('refuses to write a snapshot carrying an absolute path under a path-bearing key', async () => {
    const { root, store } = await buildLedger('tallyback-hdr-');
    const leaky = structuredClone(store.currentSnapshot()) as unknown as Record<string, unknown>;
    (leaky['workspaces'] as Record<string, unknown>[])[0]!['root'] = '/Users/alice/workspace';
    await expect(writeSnapshot(join(root, '.tallyback'), leaky as never)).rejects.toMatchObject({
      code: 'invariant.absolute_path_in_portable_file',
    });
  });

  it('refuses to write a project header carrying an absolute path', async () => {
    const { root } = await buildLedger('tallyback-hdr-');
    await expect(
      writeProject(join(root, '.tallyback'), {
        project_id: 'prj_0190b1c0-0000-7000-8000-000000000001',
        repositories: [],
        root: '/Users/alice/workspace',
      } as never),
    ).rejects.toMatchObject({ code: 'invariant.absolute_path_in_portable_file' });
  });

  it('flags absolute paths at any depth, and leaves relative locators alone', () => {
    expect(() => assertNoAbsolutePaths({ a: { b: [{ path: '/abs' }] } }, 'x')).toThrow();
    expect(() =>
      assertNoAbsolutePaths({ a: { b: [{ path: 'src/index.ts' }] } }, 'x'),
    ).not.toThrow();
    expect(() => assertNoAbsolutePaths({ locator: 'C:\\Users\\alice' }, 'x')).toThrow();
    expect(() => assertNoAbsolutePaths({ note: '/this is prose, not a path' }, 'x')).not.toThrow();
  });

  it('keeps the bound absolute path out of state.json entirely', async () => {
    const { root, store, repository_id, workspace_id } = await buildLedger('tallyback-hdr-');
    const bound = await store.bindWorkspace({
      repository_id,
      workspace_id,
      root: '/tmp/some/worktree',
    });
    expect(bound.ok).toBe(true);

    const state = await readFile(join(root, '.tallyback', 'state.json'), 'utf8');
    const project = await readFile(join(root, '.tallyback', 'project.json'), 'utf8');
    expect(state).not.toContain('/tmp/some/worktree');
    expect(project).not.toContain('/tmp/some/worktree');

    const bindings = await readBindings(join(root, '.tallyback'));
    expect(bindings.repositories[repository_id]?.workspaces[workspace_id]?.root).toBe(
      '/tmp/some/worktree',
    );
  });
});
