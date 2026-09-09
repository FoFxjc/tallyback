/**
 * Reading a ledger that `Store.open` refuses.
 *
 * `Store.open` fails closed on purpose: it is the *writer* path, and appending onto a
 * snapshot whose effective state is ambiguous would bake that ambiguity into the graph.
 * But a ledger that fails validation is exactly the ledger someone needs to look at, and
 * a repair tool that cannot read its input is no repair tool at all.
 *
 * So diagnosis is a separate, read-only, non-validating path: it parses the portable files
 * as they are, runs every check it can, and **returns** the problems instead of throwing.
 * Nothing here writes, and nothing here decides — a supersession conflict in particular is
 * reported as a decision for a human, never resolved by picking a winner.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  findSupersessionConflicts,
  validate_bindings,
  validate_project_manifest,
  validate_snapshot,
  type SupersessionLineage,
} from '../contract/index.js';
import type { Snapshot } from '../contract/index.js';
import { allRecords, ledgerRoot, SCHEMA_VERSION, type ProjectManifest } from './snapshot.js';

/** Which artifact a problem was found in. */
export type DiagnosisLayer = 'project' | 'state' | 'bindings';

export interface LedgerProblem {
  layer: DiagnosisLayer;
  code: string;
  message: string;
  /** True when `tallyback reconcile` can fix it; false when a human must edit by hand. */
  reconcilable: boolean;
}

export interface LedgerDiagnosis {
  root: string;
  /** No problems at all. */
  ok: boolean;
  problems: LedgerProblem[];
  /** The raw, unvalidated snapshot, when it could be parsed at all. */
  snapshot: Snapshot | null;
  manifest: ProjectManifest | null;
  /** Every forked lineage, in full — the complete set of decisions a human owes. */
  conflicts: SupersessionLineage[];
}

async function readJson(
  path: string,
): Promise<{ ok: true; value: unknown } | { ok: false; code: string; message: string }> {
  try {
    return { ok: true, value: JSON.parse(await readFile(path, 'utf8')) as unknown };
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') {
      return { ok: false, code: 'schema.missing_file', message: `${path} does not exist` };
    }
    return {
      ok: false,
      code: 'schema.unknown_property',
      message: `${path} is not readable JSON: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function repositoriesKey(repos: { repository_id: string; alias: string }[] | undefined): string {
  return (repos ?? [])
    .map((r) => `${r.repository_id} ${r.alias}`)
    .slice()
    .sort()
    .join('');
}

/**
 * Inspect a ledger without validating it into existence.
 *
 * Returns everything that is wrong, not just the first thing — a CI gate and a repair tool
 * both need the whole picture, and `validate_snapshot` deliberately reports one violation
 * at a time. Supersession conflicts are enumerated in full because each one is a separate
 * decision someone has to make.
 */
export async function diagnoseLedger(projectRoot: string): Promise<LedgerDiagnosis> {
  const root = ledgerRoot(projectRoot);
  const problems: LedgerProblem[] = [];
  let snapshot: Snapshot | null = null;
  let manifest: ProjectManifest | null = null;
  let conflicts: SupersessionLineage[] = [];

  // -- project.json ---------------------------------------------------------
  const projectRead = await readJson(join(root, 'project.json'));
  if (!projectRead.ok) {
    problems.push({
      layer: 'project',
      code:
        projectRead.code === 'schema.missing_file'
          ? projectRead.code
          : 'schema.invalid_project_manifest',
      message: projectRead.message,
      reconcilable: false,
    });
  } else {
    const validation = validate_project_manifest(projectRead.value);
    if (!validation.ok) {
      problems.push({
        layer: 'project',
        code: validation.code,
        message: validation.message ?? 'project.json does not satisfy project.schema.json',
        reconcilable: false,
      });
    } else {
      manifest = projectRead.value as ProjectManifest;
    }
  }

  // -- state.json -----------------------------------------------------------
  const stateRead = await readJson(join(root, 'state.json'));
  if (!stateRead.ok) {
    problems.push({
      layer: 'state',
      code: stateRead.code,
      message: stateRead.message,
      reconcilable: false,
    });
  } else {
    snapshot = stateRead.value as Snapshot;
    if (snapshot.schema_version !== SCHEMA_VERSION) {
      problems.push({
        layer: 'state',
        code: 'schema.unsupported_schema_version',
        message: `state.json schema_version ${String(snapshot.schema_version)} is not supported (expected ${SCHEMA_VERSION})`,
        reconcilable: false,
      });
    }

    // Enumerate forks first: they are the reconcilable class, and reporting only the
    // single violation `validate_snapshot` returns would hide the rest of the work.
    try {
      conflicts = findSupersessionConflicts(allRecords(snapshot));
    } catch {
      conflicts = [];
    }
    for (const lineage of conflicts) {
      problems.push({
        layer: 'state',
        code: 'invariant.supersession_conflict',
        message: `lineage ${lineage.key} has ${lineage.heads.length} concurrent unsuperseded heads (${lineage.heads.join(', ')})`,
        reconcilable: true,
      });
    }

    const validation = validate_snapshot(snapshot);
    if (!validation.ok && validation.code !== 'invariant.supersession_conflict') {
      problems.push({
        layer: 'state',
        code: validation.code,
        message: validation.message ?? 'state.json failed contract validation',
        reconcilable: false,
      });
    }

    if (manifest) {
      const projectId = snapshot.project?.project_id;
      if (!projectId || projectId !== manifest.project_id) {
        problems.push({
          layer: 'state',
          code: 'invariant.project_identity_mismatch',
          message: 'project.json identity does not match the state.json Project record',
          reconcilable: false,
        });
      } else if (
        repositoriesKey(manifest.repositories) !== repositoriesKey(snapshot.project.repositories)
      ) {
        problems.push({
          layer: 'state',
          code: 'invariant.project_repositories_mismatch',
          message:
            'project.json repository declarations do not match the state.json Project record',
          reconcilable: false,
        });
      }
    }
  }

  // -- runtime/bindings.json (machine-local; absent is normal) --------------
  const bindingsRead = await readJson(join(root, 'runtime', 'bindings.json'));
  if (bindingsRead.ok) {
    const validation = validate_bindings(bindingsRead.value);
    if (!validation.ok) {
      problems.push({
        layer: 'bindings',
        code: validation.code,
        message:
          validation.message ?? 'runtime/bindings.json does not satisfy bindings.schema.json',
        reconcilable: false,
      });
    }
  } else if (bindingsRead.code !== 'schema.missing_file') {
    problems.push({
      layer: 'bindings',
      code: 'schema.invalid_bindings',
      message: bindingsRead.message,
      reconcilable: false,
    });
  }

  return { root, ok: problems.length === 0, problems, snapshot, manifest, conflicts };
}
