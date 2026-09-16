/**
 * The real, Git-backed `GitResolver` for Land (design §7).
 *
 * Built entirely on `runGit`/`resolveWorkspace`/`gitMergeBaseIsAncestor` from
 * `src/check/resolution.ts` — no second `execFile` wrapper, no second bindings mechanism.
 * Every command here is read-only (`rev-parse`, `merge-base --is-ancestor`,
 * `diff --name-only`): Land never runs `merge`, `rebase`, `push`, or anything else that
 * mutates a ref (design §2/§6).
 *
 * Stabilization slice: this resolver also implements the "is the candidate's branch
 * already integrated into target?" check (`status: 'integrated'`), with a sibling-
 * workspace fallback when the original binding's worktree has been deleted (a common
 * post-merge state that produced misleading `path_unavailable` actionable items
 * previously).
 *
 * **The sibling fallback is a positive-proof mechanism only.** SPEC §5.2 explicitly
 * allows one `repository_id` to be associated with multiple Workspaces that are
 * independent clones / handoffs at different filesystem locations — they are NOT
 * guaranteed to share a single object database or ref namespace. A negative
 * `merge-base --is-ancestor` answer from one sibling therefore means only that THIS
 * sibling has not seen the integration, not that the Repository is definitively not
 * integrated. The fallback iterates every resolvable sibling and returns
 * `integrated` if ANY one of them proves the candidate is integrated; only after all
 * eligible siblings have been checked does it fall back to the original primary-
 * workspace failure (preserving `path_unresolved` / `path_unavailable`).
 *
 * The fallback only proves integration — it never makes the original binding landable.
 * Operators who want to land still need to `tallyback bind` the work to a path that
 * actually exists.
 */

import type { BindingsFile, ResolveOptions } from '../check/resolution.js';
import {
  gitMergeBaseIsAncestor,
  loadBindings,
  resolveWorkspace,
  runGit,
} from '../check/resolution.js';
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

/**
 * `git diff --name-only <target>...<branch>` — the same file set `GitReadyResult.files`
 * carries, but consumed for the optional archaeology payload on `GitIntegratedResult`. The
 * diff is best-effort: a sibling-only integration proof with no diff is still valid (a
 * missing diff just means the resolver couldn't compute it; the integration finding is
 * already proven by `merge-base --is-ancestor` alone).
 */
async function diffNameOnly(
  root: string,
  target: string,
  branch: string,
): Promise<string[] | undefined> {
  const result = await runGit(root, ['diff', '--name-only', `${target}...${branch}`]);
  if (!result.ok) return undefined;
  return result.stdout.length === 0 ? [] : result.stdout.split('\n');
}

/**
 * Run the integration check from `root` (some already-resolved worktree path).
 *
 * Returns:
 * - `{ integrated: true, files?, reason }` when `merge-base --is-ancestor branch target`
 *   succeeds; `reason` names the worktree that proved it (the literal string
 *   `wsp:<workspace_id>` for a sibling, or `primary` for the bound worktree);
 * - `{ integrated: false }` when the branch is genuinely not in target's history;
 * - `null` when `git` is not on PATH (`environment_unavailable`); the caller should
 *   propagate that as "cannot determine integration" rather than silently rewriting the
 *   existing resolution path's behaviour.
 */
async function checkIntegration(
  root: string,
  branch: string,
  target: string,
  witnessLabel: string,
): Promise<
  | { integrated: true; files?: string[]; reason: string }
  | { integrated: false }
  | null
> {
  const result = await gitMergeBaseIsAncestor(root, branch, target);
  if (result === null) return null;
  if (!result) return { integrated: false };
  const files = await diffNameOnly(root, target, branch);
  const reason =
    witnessLabel === 'primary'
      ? `branch ${branch} is integrated into ${target} (every commit reachable from ${target})`
      : `branch ${branch} is integrated into ${target} (verified via sibling workspace ${witnessLabel})`;
  return files ? { integrated: true, files, reason } : { integrated: true, reason };
}

/**
 * Walk the bindings JSON for every other Workspace on the same `repository_id` whose
 * bound path still resolves, and run the integration check from there.
 *
 * **Positive-proof only.** Per SPEC §5.2, Workspaces sharing a `repository_id` may be
 * independent clones / handoffs at different filesystem locations — they are NOT
 * guaranteed to share one object database or one ref namespace. A negative
 * `merge-base --is-ancestor <branch> <target>` from one sibling therefore means only
 * that THIS sibling has not seen the integration; it does NOT mean the Repository is
 * definitively not integrated. We iterate every resolvable sibling in lexical order
 * and return `integrated` if ANY of them proves the candidate branch is in target's
 * history.
 *
 * Returns:
 * - the integration proof (with a witness label naming the sibling) when at least one
 *   sibling proves integration;
 * - `null` when no sibling resolves at all, OR every resolvable sibling returns
 *   `integrated: false` or `null` (git unavailable). In both cases the caller falls
 *   back to the original primary-workspace failure (preserving `path_unavailable` /
 *   `resolution.*` codes).
 *
 * The function NEVER returns `{ integrated: false }` (no negative repository-level
 * conclusion exists — that is a positive-proof gap, not a definite negative).
 *
 * Deterministic order: lexical by `workspace_id`.
 */
async function trySiblingIntegrationProof(
  repositoryId: string,
  primaryWorkspaceId: string,
  branch: string,
  target: string,
  options: ResolveOptions,
): Promise<{ integrated: true; files?: string[]; reason: string; witness: string } | null> {
  // Load bindings once, preferring preloaded ones in options.bindings (mirrors
  // resolveWorkspace's pattern) so this path costs zero file I/O when the caller already
  // loaded them.
  let bindings: BindingsFile;
  try {
    bindings = options.bindings ?? (await loadBindings(options.bindingsPath));
  } catch {
    return null;
  }
  const repoEntry = bindings.repositories?.[repositoryId];
  if (!repoEntry || !repoEntry.workspaces) return null;

  const siblingIds = Object.keys(repoEntry.workspaces)
    .filter((id) => id !== primaryWorkspaceId)
    .sort();
  if (siblingIds.length === 0) return null;

  for (const siblingId of siblingIds) {
    const resolved = await resolveWorkspace(repositoryId, siblingId, options);
    if (!resolved.ok) continue;
    const proof = await checkIntegration(
      resolved.resolved.root,
      branch,
      target,
      `wsp:${siblingId}`,
    );
    if (proof === null) continue; // git missing on this sibling — try the next.
    if (proof.integrated) {
      return {
        integrated: true,
        files: proof.files,
        reason: proof.reason,
        witness: siblingId,
      };
    }
    // This sibling resolved and answered "not integrated". That is a fact about THIS
    // sibling's object database / ref namespace, not a repository-level negative. Per
    // SPEC §5.2, another sibling on the same `repository_id` may be a different clone
    // whose target ref has been updated — continue checking the remaining siblings
    // before concluding the fallback could not produce a positive proof.
  }
  // No sibling resolved positively. The caller preserves the original primary failure
  // (path_unavailable or similar); we never invent a repository-level "definitely not
  // integrated" verdict from silence.
  return null;
}

/** Build the real Git-backed resolver, resolving worktrees via `runtime/bindings.json`. */
export function createGitResolver(options: ResolveOptions = {}): GitResolver {
  return async (input: GitResolveInput): Promise<GitResolveResult> => {
    const resolved = await resolveWorkspace(input.repository_id, input.workspace_id, options);
    if (!resolved.ok) {
      // Sibling fallback for the integration check: the bound worktree is gone, but a
      // sibling workspace on the same `repository_id` may still resolve and prove the
      // branch is integrated. Per SPEC §5.2 the sibling set may be independent clones
      // with different ref freshness, so this is a POSITIVE-PROOF-ONLY check: any
      // sibling proving integration wins; if no sibling does, we preserve the original
      // primary failure (the gap is silence, not a repository-level negative).
      const sibling = await trySiblingIntegrationProof(
        input.repository_id,
        input.workspace_id,
        input.branch,
        input.target_branch,
        options,
      );
      if (sibling && sibling.integrated) {
        return {
          status: 'integrated',
          ...(sibling.files ? { files: sibling.files } : {}),
          reason: sibling.reason,
        };
      }
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

    // Integration check FIRST: if the candidate's branch is already contained in the
    // target branch's history, there is nothing new to land regardless of whether the
    // branch sits ahead, behind, or matches target exactly. `git_integrated` overrides
    // every `git_ready` / `git_behind` reading — the work is done. `null` (git
    // unavailable) falls through to today's behaviour rather than silently rewriting
    // the result.
    const integration = await checkIntegration(
      root,
      input.branch,
      input.target_branch,
      'primary',
    );
    if (integration === null) {
      return {
        status: 'unresolved',
        code: 'environment_unavailable',
        reason: 'git executable not found on PATH',
      };
    }
    if (integration.integrated) {
      return {
        status: 'integrated',
        ...(integration.files ? { files: integration.files } : {}),
        reason: integration.reason,
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

    const diff = await runGit(root, [
      'diff',
      '--name-only',
      `${input.target_branch}...${input.branch}`,
    ]);
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