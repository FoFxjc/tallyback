/**
 * Contract bundle manifest construction.
 *
 * The digest model is pinned in `docs/contract-bundle.md` §4:
 *
 * - `self_digest` = SHA-256 over JCS of the manifest with **only** `self_digest` omitted;
 * - `tree` = SHA-256 over JCS of `{ domain: "tallyback.artifact-tree.v1", entries }` with
 *   `entries` sorted by `path`;
 * - each entry is `{ path, type, size, digest }`, `size` being the file's byte length or a
 *   directory's recursive byte total;
 * - a directory digest is the same domain-separated digest over a **flat** recursive list
 *   of that directory's regular files, each path relative to that directory;
 * - directory paths carry a trailing slash; file paths do not;
 * - the tree enumerates exactly the twelve artifacts — not `manifest.json` itself.
 *
 * **This module imports `jcs`/`digest` from `src/contract` rather than re-implementing
 * them.** A hand-copied canonicalizer in a build script is exactly how a manifest silently
 * starts describing bytes under one member ordering while the validator hashes them under
 * another; there is one implementation, and `test/canonicalization.test.ts` additionally
 * asserts that the committed `contract/manifest.json` is byte-identical to what this
 * module produces, so drift fails the suite instead of shipping.
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compareByCodeUnit, jcs } from '../src/contract/jcs.js';
import type { Digest } from '../src/contract/types.js';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CONTRACT = join(ROOT, 'contract');

const ARTIFACT_TREE_DOMAIN = 'tallyback.artifact-tree.v1';

function sha256Hex(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** The canonical digest of a JSON value: JCS bytes, then SHA-256. */
function digestOf(value: unknown): Digest {
  return { algorithm: 'sha-256', value: sha256Hex(new TextEncoder().encode(jcs(value))) };
}

function sha256File(absPath: string): { digest: Digest; size: number } {
  const bytes = readFileSync(absPath);
  return { digest: { algorithm: 'sha-256', value: sha256Hex(bytes) }, size: bytes.length };
}

/**
 * Every regular file under `dir`, as `{ path (relative, '/'-separated), abs }`.
 *
 * `path` is always relative to `dir` — the ORIGINAL directory the caller asked for, not
 * whichever subdirectory a recursive call happens to be scanning. A recursive call that
 * relativized against its OWN (nested) directory would report `foo.json` for
 * `dir/a/b/foo.json` instead of `a/b/foo.json`, discarding the subdirectory prefix: two
 * same-named files in different subdirectories would collide, and moving a file between
 * subdirectories would not change its recorded path at all.
 */
function listFiles(dir: string, root: string = dir): { path: string; abs: string }[] {
  const out: { path: string; abs: string }[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFiles(abs, root));
    } else if (entry.isFile()) {
      out.push({ path: relative(root, abs).split(sep).join('/'), abs });
    }
  }
  return out;
}

interface TreeEntry {
  path: string;
  type: 'file' | 'directory';
  size: number;
  digest: Digest;
}

/** Directory digest: a flat, path-sorted list of that directory's files. */
function directoryDigest(dir: string): { digest: Digest; size: number } {
  const files: TreeEntry[] = listFiles(dir)
    .map((f) => {
      const { digest, size } = sha256File(f.abs);
      return { path: f.path, type: 'file' as const, size, digest };
    })
    .sort((a, b) => compareByCodeUnit(a.path, b.path));
  const size = files.reduce((acc, f) => acc + f.size, 0);
  return { digest: digestOf({ domain: ARTIFACT_TREE_DOMAIN, entries: files }), size };
}

interface ArtifactSpec {
  name: string;
  path: string;
  role: 'normative' | 'reference' | 'derived';
}

/** The twelve bundle artifacts, in the manifest's own key order. */
export const ARTIFACTS: readonly ArtifactSpec[] = [
  { name: 'spec', path: 'SPEC.md', role: 'normative' },
  { name: 'records_schema', path: 'schemas/records.schema.json', role: 'normative' },
  { name: 'snapshot_schema', path: 'schemas/snapshot.schema.json', role: 'normative' },
  { name: 'append_schema', path: 'schemas/append-operation.schema.json', role: 'normative' },
  { name: 'project_schema', path: 'schemas/project.schema.json', role: 'normative' },
  { name: 'bindings_schema', path: 'schemas/bindings.schema.json', role: 'normative' },
  { name: 'migration_report', path: 'schemas/migration-report.schema.json', role: 'normative' },
  { name: 'manifest_schema', path: 'schemas/manifest.schema.json', role: 'normative' },
  { name: 'canonicalization', path: 'canonicalization.json', role: 'normative' },
  { name: 'invariants', path: 'invariants.json', role: 'normative' },
  { name: 'fixtures', path: 'fixtures/', role: 'normative' },
  { name: 'validator', path: 'validator/', role: 'reference' },
];

export interface BundleManifest {
  contract: 'tallyback';
  bundle_format_version: '1';
  version: string;
  tree: Digest;
  artifacts: Record<string, { path: string; role: string; digest: Digest }>;
  self_digest: Digest;
}

/** Build the manifest from the contract directory's current bytes. */
export function buildManifest(version = '1.0.0'): BundleManifest {
  const resolved = ARTIFACTS.map((a) => {
    if (a.path.endsWith('/')) {
      const { digest, size } = directoryDigest(join(CONTRACT, a.path));
      return { ...a, type: 'directory' as const, size, digest };
    }
    const { digest, size } = sha256File(join(CONTRACT, a.path));
    return { ...a, type: 'file' as const, size, digest };
  });

  const treeEntries: TreeEntry[] = resolved
    .map(({ path, type, size, digest }) => ({ path, type, size, digest }))
    .sort((a, b) => compareByCodeUnit(a.path, b.path));
  const tree = digestOf({ domain: ARTIFACT_TREE_DOMAIN, entries: treeEntries });

  const artifacts: BundleManifest['artifacts'] = {};
  for (const a of resolved) {
    artifacts[a.name] = { path: a.path, role: a.role, digest: a.digest };
  }

  const withoutSelf = {
    contract: 'tallyback' as const,
    bundle_format_version: '1' as const,
    version,
    tree,
    artifacts,
  };
  return { ...withoutSelf, self_digest: digestOf(withoutSelf) };
}

/** The exact bytes `contract/manifest.json` must contain. */
export function manifestFileText(version = '1.0.0'): string {
  return `${JSON.stringify(buildManifest(version), null, 2)}\n`;
}
