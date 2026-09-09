/**
 * The cross-process single-writer lock.
 *
 * SPEC §8: "All actors are record producers; only Store performs ledger mutations
 * (`validate → lock → append → persist`)." The lock has to be real across processes —
 * two `tallyback` invocations, or two Store instances in one process, are exactly the
 * case an in-process mutex cannot see. It lives under `.tallyback/runtime/`, which SPEC §6
 * reserves for machine-local state ("locks, caches, watcher/debounce state") and which is
 * never committed.
 *
 * Mechanism: exclusive file creation (`open(path, 'wx')`) — atomic on every POSIX and
 * Windows filesystem this runs on, and correct without any advisory-locking support.
 * The lock file holds the holder's identity so an abandoned lock can be diagnosed and,
 * under an explicit policy, broken.
 *
 * **Stale-lock policy** (explicit, never "just delete it"):
 *
 * 1. A lock whose holder is a **live process on this host is never broken**, however long
 *    it has been held. Age is not evidence of abandonment — a large append, a slow disk,
 *    or a debugger all look identical to a hang from outside. Expiring a live holder by
 *    age would let a second writer enter the critical section alongside it and reintroduce
 *    exactly the lost update this lock exists to prevent. A genuinely hung writer therefore
 *    blocks others until it exits, and they fail with `mutation.lock_unavailable`: refusing
 *    to write is recoverable, a silent concurrent write is not.
 * 2. A lock held by *this* host whose PID no longer exists is abandoned immediately: the
 *    writer died, and no live process can be holding it.
 * 3. A lock from **another host** can only be judged by age, because this process cannot
 *    probe a remote PID; it is broken after `staleMs`. This is the one case that trades
 *    safety for liveness, and it applies only to a shared filesystem.
 * 4. A lock whose file cannot be read or parsed is treated as abandoned once it is older
 *    than `staleMs` — an unreadable holder record cannot be verified alive.
 * 5. Breaking is a serialized compare-and-delete: a second, short-lived `*.break` lock
 *    ensures only one contender is inside the compare-and-unlink, and the exact bytes read
 *    during the staleness decision must still be on disk at deletion time — so a lock
 *    re-taken in the meantime is never removed from under its new owner. Acquisition is
 *    then re-verified after the fact, so a contender that lost a break race backs off
 *    instead of believing it holds the lock.
 *
 * A lock that cannot be acquired before `timeoutMs` fails with `mutation.lock_unavailable`
 * rather than proceeding unlocked.
 */

import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { mkdir, open, readFile, stat, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';

/** Failure to acquire the single-writer lock (a transaction/concurrency failure, SPEC §11). */
export class LockError extends Error {
  readonly code = 'mutation.lock_unavailable';
  constructor(message: string) {
    super(message);
    this.name = 'LockError';
  }
}

export interface LockOptions {
  /** How long to wait for the lock before failing closed. Default 10s. */
  timeoutMs?: number;
  /** How long a held lock may go untouched before it is considered abandoned. Default 30s. */
  staleMs?: number;
  /** Poll interval while waiting. Default 15ms. */
  pollMs?: number;
}

export interface LockHolder {
  nonce: string;
  pid: number;
  host: string;
  acquired_at: string;
}

export interface LockHandle {
  readonly path: string;
  readonly holder: LockHolder;
  /** Release the lock. Idempotent, and never removes a lock another writer now holds. */
  release(): Promise<void>;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_STALE_MS = 30_000;
const DEFAULT_POLL_MS = 15;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isErrno(err: unknown, code: string): boolean {
  return typeof err === 'object' && err !== null && (err as NodeJS.ErrnoException).code === code;
}

/** Whether a PID exists on this host. `kill(pid, 0)` probes without signalling. */
function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means the process exists but belongs to another user — still alive.
    return isErrno(err, 'EPERM');
  }
}

function parseHolder(text: string): LockHolder | null {
  try {
    const value = JSON.parse(text) as Partial<LockHolder>;
    if (
      typeof value.nonce === 'string' &&
      typeof value.pid === 'number' &&
      typeof value.host === 'string' &&
      typeof value.acquired_at === 'string'
    ) {
      return value as LockHolder;
    }
  } catch {
    /* fall through */
  }
  return null;
}

/** Age of the lock in ms, preferring the recorded acquisition time over file mtime. */
async function lockAgeMs(path: string, holder: LockHolder | null): Promise<number> {
  if (holder) {
    const at = Date.parse(holder.acquired_at);
    if (Number.isFinite(at)) return Date.now() - at;
  }
  try {
    const info = await stat(path);
    return Date.now() - info.mtimeMs;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/** Apply the documented stale-lock policy. Returns the reason, or null when it is live. */
async function stalenessReason(
  path: string,
  text: string,
  staleMs: number,
): Promise<string | null> {
  const holder = parseHolder(text);
  const ageMs = await lockAgeMs(path, holder);
  if (holder === null) {
    return ageMs > staleMs ? `lock file is unreadable and ${Math.round(ageMs)}ms old` : null;
  }
  if (holder.host === hostname()) {
    // Local holder: liveness is knowable, so use it and never fall through to age.
    return pidAlive(holder.pid) ? null : `holder pid ${holder.pid} on this host is gone`;
  }
  if (ageMs > staleMs) {
    // Remote holder: liveness is not observable from here, so age is the only signal.
    return `lock held by remote ${holder.host}/${holder.pid} for ${Math.round(ageMs)}ms`;
  }
  return null;
}

/**
 * Break a lock we have decided is abandoned.
 *
 * The naive form — read, compare, unlink — has a window: two contenders can both read the
 * stale bytes, the first can break and re-acquire, and the second's `unlink` then deletes
 * the *new owner's* lock, putting two writers in the critical section at once. Comparing
 * before unlinking narrows that window but cannot close it, because the compare and the
 * unlink are separate syscalls.
 *
 * So breaking is itself serialized by a second, short-lived lock. Only one contender is
 * ever inside the compare-and-delete, which makes it effectively atomic. The break lock is
 * held for microseconds and by nothing long-running, so — unlike the store lock — expiring
 * it purely by age is safe.
 */
async function breakIfUnchanged(path: string, expected: string): Promise<boolean> {
  const breakPath = `${path}.break`;
  const breaker = await acquireBreakLock(breakPath);
  if (!breaker) return false; // someone else is breaking it; re-evaluate on the next pass
  try {
    let current: string;
    try {
      current = await readFile(path, 'utf8');
    } catch {
      return true; // already gone
    }
    // Under the break lock, "unchanged since we judged it" really does still hold at unlink.
    if (current !== expected) return false;
    try {
      await unlink(path);
      return true;
    } catch {
      return false;
    }
  } finally {
    await unlink(breakPath).catch(() => undefined);
  }
}

/** How long a break lock may exist before it is assumed abandoned (it is held briefly). */
const BREAK_LOCK_STALE_MS = 5_000;

/**
 * Take the short-lived lock that serializes stale-lock breaking.
 * Returns false when another contender holds it — the caller simply retries its outer loop.
 */
async function acquireBreakLock(breakPath: string): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(breakPath, 'wx');
      try {
        await handle.writeFile(
          JSON.stringify({ pid: process.pid, host: hostname(), at: new Date().toISOString() }),
          'utf8',
        );
      } finally {
        await handle.close();
      }
      return true;
    } catch (err) {
      if (!isErrno(err, 'EEXIST')) return false;
    }
    // Held. Nothing legitimately holds this for long, so an old one is abandoned.
    try {
      const info = await stat(breakPath);
      if (Date.now() - info.mtimeMs <= BREAK_LOCK_STALE_MS) return false;
      await unlink(breakPath);
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Acquire the exclusive lock at `path`, waiting up to `timeoutMs`.
 * Always release through the returned handle inside a `finally`.
 */
export async function acquireLock(path: string, options: LockOptions = {}): Promise<LockHandle> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const staleMs = options.staleMs ?? DEFAULT_STALE_MS;
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  const deadline = Date.now() + timeoutMs;

  await mkdir(dirname(path), { recursive: true });

  /**
   * Fail closed once the deadline has passed. Called at the top of every iteration
   * after the first, so EVERY retry path — a lost break-lock race, a stale lock that
   * could not be unlinked, a vanished file re-read, the file genuinely still being held
   * — is bounded by `timeoutMs`, not only the "still held, not (yet) stale" branch. A
   * loop that can retry without ever re-checking the deadline is a loop `timeoutMs`
   * does not actually bound.
   */
  const failIfPastDeadline = (heldText: string | null): void => {
    if (Date.now() < deadline) return;
    const held = heldText !== null ? parseHolder(heldText) : null;
    throw new LockError(
      `could not acquire the store write lock at ${path} within ${timeoutMs}ms` +
        (held ? ` (held by ${held.host}/${held.pid} since ${held.acquired_at})` : ''),
    );
  };

  for (let attempt = 0; ; attempt++) {
    if (attempt > 0) failIfPastDeadline(null);
    const holder: LockHolder = {
      nonce: randomUUID(),
      pid: process.pid,
      host: hostname(),
      acquired_at: new Date().toISOString(),
    };
    try {
      const handle = await open(path, 'wx');
      try {
        await handle.writeFile(JSON.stringify(holder), 'utf8');
      } finally {
        await handle.close();
      }
      // Confirm the file we just created is still ours. If a contender broke it between
      // our create and this read, we did not actually win, and proceeding would put two
      // writers in the critical section.
      try {
        if (parseHolder(await readFile(path, 'utf8'))?.nonce !== holder.nonce) {
          continue;
        }
      } catch {
        continue; // vanished under us: we do not hold it
      }
      return {
        path,
        holder,
        release: async () => {
          // Only remove the lock if we still hold it (a broken-and-retaken lock is not ours).
          try {
            const current = await readFile(path, 'utf8');
            if (parseHolder(current)?.nonce !== holder.nonce) return;
            await unlink(path);
          } catch {
            /* already released or removed */
          }
        },
      };
    } catch (err) {
      if (!isErrno(err, 'EEXIST')) throw err;
    }

    // The lock is held. Decide whether it is abandoned under the documented policy.
    let text: string;
    try {
      text = await readFile(path, 'utf8');
    } catch {
      continue; // vanished between the failed create and the read: retry immediately (bounded above)
    }
    const reason = await stalenessReason(path, text, staleMs);
    if (reason !== null) {
      await breakIfUnchanged(path, text);
      // Whether or not the break succeeded — it may not have (a read-only filesystem, or
      // lost the short-lived break-lock race repeatedly) — the retry above enforces
      // `timeoutMs` before the next attempt, so this can never spin unboundedly.
      continue;
    }

    failIfPastDeadline(text);
    await sleep(pollMs);
  }
}
