/**
 * The real, Git-backed `WatchResolver` for Watch (design §6).
 *
 * Built entirely on `runGit`/`resolveWorkspace` from `src/check/resolution.ts` — no second
 * `execFile` wrapper, no second bindings mechanism (the same reuse principle
 * `src/land/git.ts` already follows). Every command here is read-only (`log`): Watch never
 * writes to the ledger, raises a Blocker, or touches Git state (design §2).
 */

import type { ResolveOptions } from '../check/resolution.js';
import { resolveWorkspace, runGit } from '../check/resolution.js';
import type { WatchResolveInput, WatchResolveResult, WatchResolver } from './report.js';

/** Build the real workspace/Git-backed resolver, resolving worktrees via `runtime/bindings.json`. */
export function createWatchResolver(options: ResolveOptions = {}): WatchResolver {
  return async (input: WatchResolveInput): Promise<WatchResolveResult> => {
    const resolved = await resolveWorkspace(input.repository_id, input.workspace_id, options);
    if (!resolved.ok) {
      return { status: 'unresolved', code: resolved.code, reason: resolved.reason };
    }

    if (!input.branch) {
      return { status: 'no_branch' };
    }

    // `dispatched_at` is `Timestamp` (nullable per the contract) — a null `since` means there
    // is no dispatch time to filter on, so this counts all commits on the branch rather than
    // silently passing `--since=null` to Git.
    const args = input.since
      ? ['log', `--since=${input.since}`, '--oneline', input.branch]
      : ['log', '--oneline', input.branch];
    const log = await runGit(resolved.resolved.root, args);
    if (!log.ok) {
      return { status: 'unresolved', code: log.code, reason: log.reason };
    }

    const count = log.stdout.length === 0 ? 0 : log.stdout.split('\n').length;
    return { status: 'commits', count };
  };
}
