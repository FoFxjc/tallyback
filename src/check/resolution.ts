/**
 * Repository / workspace resolution.
 *
 * Resolves a `repo_id` / `wsp_id` pair to a bound local path using the
 * machine-local bindings file (`runtime/bindings.json`), then validates that the
 * path is a Git worktree of the expected Repository and resolves the object
 * database **through Git commands** — never by constructing `.git/objects`
 * paths, and never by guessing identity from a remote URL or a directory name.
 *
 * The only authoritative identity assertion is the explicit binding
 * (`repo_id -> workspace root`). A portable project manifest (`.tallyback/
 * project.json`) inside the worktree is used as a cross-check when present: if
 * it names repositories and does **not** include the expected `repository_id`,
 * resolution fails closed with `observed_context_mismatch`.
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { validate_project_manifest } from '../contract/index.js';
import type { ObservedContext } from '../contract/index.js';

export type { ObservedContext, WorkingTreeState } from '../contract/index.js';

const execFileAsync = promisify(execFile);

/** Stable resolution-result codes (`resolution.*` namespace). */
export const RESOLUTION_CODES = [
  'repository_unbound',
  'workspace_unbound',
  'path_unavailable',
  'not_a_git_repository',
  'object_unavailable',
  'observed_context_mismatch',
  'unsupported_kind',
  'environment_unavailable',
  'check_error',
] as const;

export type ResolutionCode = (typeof RESOLUTION_CODES)[number];

/** Shape of `runtime/bindings.json` (machine-local, ignored). */
export interface BindingsFile {
  repositories?: Record<string, { workspaces?: Record<string, { root?: string }> }>;
}

/** A successfully resolved workspace capability. */
export interface ResolvedWorkspace {
  repository_id: string;
  workspace_id: string;
  /** Absolute path to the worktree root. */
  root: string;
  observed_context: ObservedContext;
}

export type ResolutionResult =
  { ok: true; resolved: ResolvedWorkspace } | { ok: false; code: ResolutionCode; reason: string };

export interface ResolveOptions {
  /** Preloaded bindings (skips file discovery/read). */
  bindings?: BindingsFile;
  /** Explicit path to `runtime/bindings.json`. */
  bindingsPath?: string;
}

/**
 * Walk up from `startDir` until a directory containing `name` is found.
 * Returns the joined path, or `null` if the filesystem root is reached.
 */
export function findUp(name: string, startDir: string): string | null {
  let current = resolve(startDir);
  for (;;) {
    const candidate = join(current, name);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/** Resolve the tallyback package root by walking up from `import.meta.url`. */
export function resolvePackageRoot(startUrl: string = import.meta.url): string {
  const startDir = dirname(fileURLToPath(startUrl));
  const pkg = findUp('package.json', startDir);
  if (!pkg) {
    throw new Error('resolution.check_error: could not locate package.json from import.meta.url');
  }
  return dirname(pkg);
}

/** Locate `runtime/bindings.json` relative to the working directory. */
export function discoverBindingsPath(
  packageRoot: string = resolvePackageRoot(),
  cwd: string = process.cwd(),
): string | null {
  // A tallyback-tracked project keeps its bindings under `.tallyback/runtime/`.
  return (
    findUp(join('.tallyback', 'runtime', 'bindings.json'), cwd) ??
    findUp(join('runtime', 'bindings.json'), cwd) ??
    join(packageRoot, '.tallyback', 'runtime', 'bindings.json')
  );
}

export async function loadBindings(path?: string): Promise<BindingsFile> {
  const resolved = path ?? discoverBindingsPath();
  if (!resolved) {
    throw new Error('resolution.repository_unbound: no runtime/bindings.json found');
  }
  const raw = await readFile(resolved, 'utf8');
  return JSON.parse(raw) as BindingsFile;
}

interface GitSuccess {
  ok: true;
  stdout: string;
  stderr: string;
}

interface GitFailure {
  ok: false;
  code: ResolutionCode;
  reason: string;
}

export type GitResult = GitSuccess | GitFailure;

/** Run a Git command in `root` without a shell. Never constructs object paths. */
export async function runGit(
  root: string,
  args: readonly string[],
  opts: { env?: NodeJS.ProcessEnv } = {},
): Promise<GitResult> {
  try {
    const { stdout, stderr } = await execFileAsync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      ...opts,
    });
    return { ok: true, stdout: stdout.trimEnd(), stderr: stderr.trimEnd() };
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { code?: number | string; stderr?: string };
    if (e.code === 'ENOENT') {
      return {
        ok: false,
        code: 'environment_unavailable',
        reason: 'git executable not found on PATH',
      };
    }
    return {
      ok: false,
      code: 'check_error',
      reason: (e.stderr ?? e.message ?? 'git command failed').trimEnd(),
    };
  }
}

function errorResult(code: ResolutionCode, reason: string): ResolutionResult {
  return { ok: false, code, reason };
}

/** Resolve the worktree root (`git rev-parse --show-toplevel`). */
export async function gitWorktreeRoot(root: string): Promise<GitResult> {
  return runGit(root, ['rev-parse', '--show-toplevel']);
}

export async function gitHeadOid(root: string): Promise<GitResult> {
  return runGit(root, ['rev-parse', 'HEAD']);
}

export async function gitTreeOid(root: string): Promise<GitResult> {
  return runGit(root, ['rev-parse', 'HEAD^{tree}']);
}

export async function gitStatus(root: string): Promise<GitResult> {
  return runGit(root, ['status', '--porcelain']);
}

export async function gitObjectType(root: string, oid: string): Promise<GitResult> {
  return runGit(root, ['cat-file', '-t', oid]);
}

/** `git cat-file -e` — exit 0 means the object exists in the object database. */
export async function gitObjectExists(root: string, oid: string): Promise<boolean> {
  const res = await runGit(root, ['cat-file', '-e', oid]);
  return res.ok;
}

export async function gitLog(root: string, args: readonly string[]): Promise<GitResult> {
  return runGit(root, ['log', ...args]);
}

export async function gitDiff(root: string, args: readonly string[]): Promise<GitResult> {
  return runGit(root, ['diff', ...args]);
}

/**
 * Validate that `path` is a Git worktree and capture its observed context.
 * Emits `path_unavailable`, `not_a_git_repository`, `object_unavailable`,
 * `environment_unavailable`, or `check_error` as appropriate.
 */
export async function inspectWorktree(
  repositoryId: string,
  workspaceId: string,
  root: string,
): Promise<ResolutionResult> {
  const toplevel = await gitWorktreeRoot(root);
  if (!toplevel.ok) {
    if (toplevel.code === 'environment_unavailable') {
      return errorResult('environment_unavailable', toplevel.reason);
    }
    return errorResult('not_a_git_repository', `${root} is not a Git worktree`);
  }
  const worktreeRoot = toplevel.stdout;

  const head = await gitHeadOid(worktreeRoot);
  if (!head.ok) {
    if (head.code === 'environment_unavailable') {
      return errorResult('environment_unavailable', head.reason);
    }
    return errorResult(
      'object_unavailable',
      `cannot resolve HEAD in ${worktreeRoot}: ${head.reason}`,
    );
  }

  const tree = await gitTreeOid(worktreeRoot);
  if (!tree.ok) {
    if (tree.code === 'environment_unavailable') {
      return errorResult('environment_unavailable', tree.reason);
    }
    return errorResult(
      'object_unavailable',
      `cannot resolve HEAD^{tree} in ${worktreeRoot}: ${tree.reason}`,
    );
  }

  const status = await gitStatus(worktreeRoot);
  if (!status.ok) {
    if (status.code === 'environment_unavailable') {
      return errorResult('environment_unavailable', status.reason);
    }
    return errorResult('check_error', `git status failed: ${status.reason}`);
  }

  const observed_context: ObservedContext = {
    repository_id: repositoryId,
    workspace_id: workspaceId,
    head_oid: head.stdout,
    tree_oid: tree.stdout,
    working_tree: status.stdout.length === 0 ? 'clean' : 'dirty',
  };

  return {
    ok: true,
    resolved: {
      repository_id: repositoryId,
      workspace_id: workspaceId,
      root: worktreeRoot,
      observed_context,
    },
  };
}

interface ProjectManifest {
  project_id: string;
  repositories: Array<{ repository_id: string; alias: string }>;
}

/**
 * Cross-check the portable project manifest (`.tallyback/project.json`) inside
 * the worktree. This never *guesses* identity from a URL or directory name: it
 * only fails when an explicit portable declaration contradicts the binding.
 * Returns `null` when there is nothing to contradict the binding.
 *
 * The manifest is validated against `project.schema.json` before any of its fields are
 * read. `JSON.parse` only proves the bytes are valid JSON, not that they have the shape
 * `ProjectManifest` claims — a manifest that parses to `{"repositories": {}}` or
 * `{"repositories": [null]}` is exactly the untrusted data SPEC §8.3 has in mind, and
 * reading `.some()` off it without validating first would throw out of a resolution path
 * whose whole contract is to report a typed result, never an exception.
 */
async function verifyRepositoryIdentity(
  root: string,
  repositoryId: string,
): Promise<ResolutionResult | null> {
  const manifestPath = join(root, '.tallyback', 'project.json');
  if (!existsSync(manifestPath)) {
    // No portable manifest to contradict the binding; the binding stands.
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch {
    return errorResult('observed_context_mismatch', `${manifestPath} exists but is not valid JSON`);
  }
  const validation = validate_project_manifest(parsed);
  if (!validation.ok) {
    return errorResult(
      'observed_context_mismatch',
      `${manifestPath} does not satisfy project.schema.json: ${validation.message ?? validation.code}`,
    );
  }
  const manifest = parsed as ProjectManifest;
  if (manifest.repositories.length === 0) {
    return null;
  }
  const declaresExpected = manifest.repositories.some((r) => r.repository_id === repositoryId);
  if (!declaresExpected) {
    return errorResult(
      'observed_context_mismatch',
      `${manifestPath} does not declare repository ${repositoryId}`,
    );
  }
  return null;
}

/**
 * Resolve a `repo_id` / `wsp_id` pair to a bound, validated Git worktree.
 *
 * 1. read the machine-local bindings file;
 * 2. look up the repository and workspace entries (`repository_unbound` /
 *    `workspace_unbound` when absent);
 * 3. validate the bound path exists (`path_unavailable`);
 * 4. validate it is a Git worktree and capture observed context
 *    (`not_a_git_repository`, `object_unavailable`);
 * 5. cross-check the portable project manifest when present
 *    (`observed_context_mismatch`);
 * 6. return the resolved workspace capability.
 */
export async function resolveWorkspace(
  repositoryId: string,
  workspaceId: string,
  options: ResolveOptions = {},
): Promise<ResolutionResult> {
  let bindings: BindingsFile;
  if (options.bindings) {
    bindings = options.bindings;
  } else {
    const path = options.bindingsPath ?? discoverBindingsPath();
    if (!path) {
      return errorResult('repository_unbound', 'no runtime/bindings.json found');
    }
    try {
      bindings = await loadBindings(path);
    } catch (err) {
      // A missing bindings file is the ordinary "nothing bound yet" state this resolution
      // flow documents as `repository_unbound` — `discoverBindingsPath()` always resolves
      // to SOME candidate path (falling back to one under the package root), so this ENOENT
      // is the realistic way a caller actually observes "no bindings configured", not an
      // edge case. Reserve `environment_unavailable` for a bindings file that exists but
      // could not be read or parsed (permission denied, malformed JSON, I/O error) — a
      // genuine environmental problem, not a configuration omission.
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return errorResult('repository_unbound', `no bindings file at ${path}`);
      }
      const msg = err instanceof Error ? err.message : String(err);
      return errorResult('environment_unavailable', `cannot read bindings (${path}): ${msg}`);
    }
  }

  const repoEntry = bindings.repositories?.[repositoryId];
  if (!repoEntry) {
    return errorResult('repository_unbound', `no binding for repository ${repositoryId}`);
  }

  const wsEntry = repoEntry.workspaces?.[workspaceId];
  if (!wsEntry) {
    return errorResult(
      'workspace_unbound',
      `no binding for workspace ${workspaceId} in repository ${repositoryId}`,
    );
  }

  const rootRaw = wsEntry.root;
  if (typeof rootRaw !== 'string' || rootRaw.trim().length === 0) {
    return errorResult('path_unavailable', `workspace ${workspaceId} has no bound path`);
  }
  const root = isAbsolute(rootRaw) ? resolve(rootRaw) : resolve(process.cwd(), rootRaw);
  if (!existsSync(root)) {
    return errorResult('path_unavailable', `bound path does not exist: ${root}`);
  }

  const inspected = await inspectWorktree(repositoryId, workspaceId, root);
  if (!inspected.ok) {
    return inspected;
  }

  const identity = await verifyRepositoryIdentity(inspected.resolved.root, repositoryId);
  if (identity) {
    return identity;
  }

  return inspected;
}
