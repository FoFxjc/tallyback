/**
 * The real, Git-backed `GitResolver` for Land (design §7).
 *
 * Built entirely on `runGit`/`resolveWorkspace` from `src/check/resolution.ts` — no second
 * `execFile` wrapper, no second bindings mechanism. Every command here is read-only
 * (`rev-parse`, `merge-base --is-ancestor`, `diff --name-only`): Land never runs `merge`,
 * `rebase`, `push`, or anything else that mutates a ref (design §2/§6).
 */

import type { ResolveOptions } from '../check/resolution.js';
import { resolveWorkspace, runGit } from '../check/resolution.js';
import type { GitResolveInput, GitResolveResult, GitResolver } from './report.js';

/**
 * `git merge-base --is-ancestor <target> <branch>` exits 0 when `target` is an ancestor of
 * `branch` (i.e. `branch` carries everything `target` does — a fast-forward or clean merge
 * is at least plausible) and exits **1**, not an error, when it is not. `runGit` cannot
 * distinguish that ordinary "not an ancestor" exit from a real Git failure by exit code
 * alone (it collapses every non-zero exit into `{ ok: false, code: 'check_error', ... }`),
 * so this treats any non-`environment_unavailable` failure here as "behind" — the branch
 * and target have already been proven to resolve via `rev-parse --verify` by the time this
 * runs, so a `check_error` at this step is overwhelmingly the ordinary non-ancestor case,
 * not a hidden environment problem.
 */
async function isAncestor(root: string, target: string, branch: string): Promise<boolean | null> {
  const result = await runGit(root, ['merge-base', '--is-ancestor', target, branch]);
  if (result.ok) return true;
  if (result.code === 'environment_unavailable') return null;
  return false;
}

/**
 * `is-ancestor` alone is not enough: a commit is its own ancestor, so a `branch` sitting
 * on the exact same commit as `target` (nothing to land) would otherwise pass the
 * ancestor check and read as `ready`. Count commits `target` doesn't have; zero means
 * "nothing new," regardless of ancestry.
 */
async function commitsAhead(root: string, target: string, branch: string): Promise<number | null> {
  const result = await runGit(root, ['rev-list', '--count', `${target}..${branch}`]);
  if (!result.ok) return result.code === 'environment_unavailable' ? null : 0;
  const count = Number.parseInt(result.stdout, 10);
  return Number.isFinite(count) ? count : 0;
}

/** Build the real Git-backed resolver, resolving worktrees via `runtime/bindings.json`. */
export function createGitResolver(options: ResolveOptions = {}): GitResolver {
  return async (input: GitResolveInput): Promise<GitResolveResult> => {
    const resolved = await resolveWorkspace(input.repository_id, input.workspace_id, options);
    if (!resolved.ok) {
      return { status: 'unresolved', code: resolved.code, reason: resolved.reason };
    }
    const root = resolved.resolved.root;

    const branchCheck = await runGit(root, ['rev-parse', '--verify', input.branch]);
    if (!branchCheck.ok) {
      return {
        status: 'unresolved',
        code: branchCheck.code,
        reason: `branch "${input.branch}" does not resolve: ${branchCheck.reason}`,
      };
    }

    const targetCheck = await runGit(root, ['rev-parse', '--verify', input.target_branch]);
    if (!targetCheck.ok) {
      return {
        status: 'unresolved',
        code: targetCheck.code,
        reason: `target branch "${input.target_branch}" does not resolve: ${targetCheck.reason}`,
      };
    }

    const ancestor = await isAncestor(root, input.target_branch, input.branch);
    if (ancestor === null) {
      return {
        status: 'unresolved',
        code: 'environment_unavailable',
        reason: 'git executable not found on PATH',
      };
    }
    if (!ancestor) {
      return { status: 'behind' };
    }

    const ahead = await commitsAhead(root, input.target_branch, input.branch);
    if (ahead === null) {
      return {
        status: 'unresolved',
        code: 'environment_unavailable',
        reason: 'git executable not found on PATH',
      };
    }
    if (ahead === 0) {
      return { status: 'behind' };
    }

    const diff = await runGit(root, ['diff', '--name-only', `${input.target_branch}...${input.branch}`]);
    if (!diff.ok) {
      return {
        status: 'unresolved',
        code: diff.code,
        reason: `git diff --name-only failed: ${diff.reason}`,
      };
    }
    const files = diff.stdout.length === 0 ? [] : diff.stdout.split('\n');
    return { status: 'ready', files };
  };
}
