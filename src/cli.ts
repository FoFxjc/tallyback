#!/usr/bin/env node
/**
 * Reference CLI — thin host adapter over the deterministic core library.
 *
 * The mandatory machine-readable surface is the `handshake` command (SPEC §16):
 * it reports `implementation_version`, `command_api_version`,
 * `supported_contract_versions`, and feature/provider-interface identifiers so a
 * consumer can preflight compatibility and fail closed on an unknown contract major.
 *
 * The loop commands (`declare` / `dispatch` / `observe` / `verify` / `settle`)
 * are thin mappings onto the `Store` command surface; Check (`verify`) is
 * library-driven because a checker is a named, installed provider interface —
 * never a raw shell string — so this CLI records invocations/results but does not
 * invent a checker. Every mutating command preflights the capability handshake and
 * fails closed on an unsupported contract version.
 */

import { diagnoseLedger, reconcileLedger, Store } from './ledger/index.js';
import {
  applyMigration,
  previewMigration,
  readLegacySource,
  type MigrationOutcome,
} from './check/migration-workflow.js';
import { buildLandReport, createGitResolver, type LandReport } from './land/index.js';
import { buildTaskViews, DEFAULT_STALE_AFTER_MS, summarizeTaskViews } from './view/index.js';
import { canMutateContractVersion, handshake } from './version.js';
import type {
  Actor,
  ActorKind,
  CheckResultOutcome,
  Diagnostic,
  Evidence,
  Reconciliation,
  Verdict,
} from './contract/index.js';

// ---------------------------------------------------------------------------
// Argument parsing (minimal, dependency-free `--key value` parser)
// ---------------------------------------------------------------------------

type Args = Record<string, string | string[]>;

/**
 * The flags that take no value. Everything else consumes the following token.
 *
 * This set has to be explicit. Guessing — "the next token starts with `--`, so it must be
 * another flag" — silently swallows any legitimate value that happens to begin with two
 * dashes, and `--rationale "--wip, needs rebase"` would then record the rationale as the
 * literal string `"true"` in an immutable Settlement. A value is a value; only a declared
 * boolean flag stands alone.
 */
const BOOLEAN_FLAGS = new Set(['apply', 'preview', 'dry-run', 'help']);

function parseArgs(argv: string[]): { command: string; args: Args } {
  const [command, ...rest] = argv;
  const args: Args = {};

  const set = (key: string, value: string): void => {
    // Repeatable flag: collect into an array; single flag: scalar string.
    const existing = args[key];
    if (existing === undefined) {
      args[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      args[key] = [existing, value];
    }
  };

  for (let i = 0; i < rest.length; i++) {
    const token = rest[i]!;
    if (!token.startsWith('--')) continue;

    // `--key=value` is always unambiguous, whatever the value looks like.
    const eq = token.indexOf('=');
    if (eq > 2) {
      set(token.slice(2, eq), token.slice(eq + 1));
      continue;
    }

    const key = token.slice(2);
    if (BOOLEAN_FLAGS.has(key)) {
      args[key] = 'true';
      continue;
    }
    const next = rest[i + 1];
    if (next === undefined) {
      throw new CliError(`--${key} requires a value (use --${key}=<value> if it starts with "--")`);
    }
    set(key, next);
    i++;
  }
  return { command: command ?? 'handshake', args };
}

function str(args: Args, key: string, fallback?: string): string {
  const value = args[key];
  if (typeof value === 'string') return value;
  if (fallback !== undefined) return fallback;
  throw new CliError(`missing required --${key}`);
}

function strArray(args: Args, key: string): string[] {
  const value = args[key];
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function optionalStr(args: Args, key: string): string | undefined {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
}

const ACTOR_KINDS: readonly ActorKind[] = [
  'human',
  'subagent',
  'executor',
  'tool',
  'unknown',
  'migrated',
];

/** Parse an `--actor` / `--as` value of the form `kind:id`. */
function actor(args: Args, key: string, fallback: Actor): Actor {
  const raw = optionalStr(args, key);
  if (!raw) return fallback;
  const idx = raw.indexOf(':');
  if (idx <= 0) {
    throw new CliError(`--${key} must be of the form "kind:id" (got "${raw}")`);
  }
  const kind = raw.slice(0, idx) as ActorKind;
  if (!ACTOR_KINDS.includes(kind)) {
    throw new CliError(`--${key} kind "${kind}" is not a valid ActorKind`);
  }
  return { kind, id: raw.slice(idx + 1) };
}

function jsonValue(args: Args, key: string): unknown {
  const raw = str(args, key);
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new CliError(`--${key} must be valid JSON`);
  }
}

/** Parse a repeatable `--flag '<json>'` into a list of typed records. */
function jsonArray<T>(args: Args, key: string): T[] {
  return strArray(args, key).map((raw) => {
    try {
      return JSON.parse(raw) as T;
    } catch {
      throw new CliError(`--${key} must be valid JSON`);
    }
  });
}

/** Parse a repeatable `--diagnostic code:message`. */
function diagnostics(args: Args, key: string): Diagnostic[] {
  return strArray(args, key).map((raw) => {
    const idx = raw.indexOf(':');
    if (idx <= 0) throw new CliError(`--${key} must be "code:message"`);
    return { code: raw.slice(0, idx), message: raw.slice(idx + 1) };
  });
}

/**
 * Resolve a `--task-id` that may be given as a canonical `tsk_` id or as a local human
 * alias (`T1`).
 *
 * SPEC §4.2 — the alias is a local display affordance. It is resolved here, at the host
 * edge, and only the canonical id is ever placed in a wire reference.
 */
function resolveTaskRefValue(store: Store, raw: string, key: string): string {
  const resolved = store.resolveTaskRef(raw);
  if (resolved === null) {
    throw new CliError(
      `--${key} "${raw}" is neither a task in this ledger nor an unambiguous local alias`,
    );
  }
  return resolved;
}

function taskRef(store: Store, args: Args, key = 'task-id'): string {
  return resolveTaskRefValue(store, str(args, key), key);
}

/** Resolve a repeatable `--task-id` into canonical ids (design: backs View's narrowing). */
function taskRefs(store: Store, args: Args, key = 'task-id'): string[] {
  return strArray(args, key).map((raw) => resolveTaskRefValue(store, raw, key));
}

class CliError extends Error {}

const DEFAULT_ACTOR: Actor = { kind: 'tool', id: 'tallyback' };

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

function print(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}

function fail(code: string, message: string): never {
  process.stderr.write(`${code}: ${message}\n`);
  process.exitCode = 1;
  throw new CliError(message);
}

// ---------------------------------------------------------------------------
// Capability handshake preflight (SPEC §16)
// ---------------------------------------------------------------------------

/** The capability handshake reported by `tallyback handshake`. */
const HANDSHAKE = handshake();

/**
 * Preflight a mutating workflow: report the handshake, then fail closed if the
 * ledger's schema version is not an exact supported contract version for mutation.
 */
function preflight(schemaVersion: string): void {
  if (!canMutateContractVersion(schemaVersion)) {
    fail(
      'contract.unsupported_contract_version',
      `schema_version ${schemaVersion} is not a supported mutation target ` +
        `(supported: ${HANDSHAKE.supported_contract_versions.join(', ')})`,
    );
  }
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

async function run(): Promise<void> {
  const { command, args } = parseArgs(process.argv.slice(2));

  // Read-only / capability commands first (no ledger, no preflight).
  if (command === 'handshake') {
    print(HANDSHAKE);
    return;
  }
  if (command === 'version') {
    print({ implementation_version: HANDSHAKE.implementation_version });
    return;
  }

  const projectRoot = optionalStr(args, 'project-root') ?? process.cwd();
  const submitter = actor(args, 'as', { kind: 'tool', id: 'tallyback' });

  if (command === 'init') {
    const repositories = strArray(args, 'repository').map((alias) => ({ alias }));
    const topicName = optionalStr(args, 'topic');
    const goal = optionalStr(args, 'goal');
    const store = await Store.init(projectRoot, {
      project_id: optionalStr(args, 'project-id'),
      repositories: repositories.length > 0 ? repositories : undefined,
      topic: topicName ? { name: topicName, goal: goal ?? '' } : undefined,
      created_by: actor(args, 'actor', submitter),
    });
    const snapshot = store.currentSnapshot();
    print({
      ok: true,
      project_id: snapshot.project.project_id,
      revision: store.currentRevision(),
      // The ids a caller needs to reach `task` → `declare` → `workspace` → `dispatch`.
      repositories: snapshot.repositories,
      topics: snapshot.topics.map((t) => ({ topic_id: t.topic_id, name: t.name })),
    });
    return;
  }

  // Migration is a one-time, atomic replacement of the portable files, not a mutation of
  // an existing ledger, so it runs before the ledger is opened.
  if (command === 'migrate') {
    await runMigrate(projectRoot, args, submitter);
    return;
  }

  // `validate` and `reconcile` deliberately run BEFORE `Store.open`. Both exist precisely
  // for a ledger that `Store.open` refuses — a CI gate has to report what is wrong, and a
  // repair tool has to be able to read its input.
  if (command === 'validate') {
    await runValidate(projectRoot);
    return;
  }
  if (command === 'reconcile') {
    await runReconcile(projectRoot, args);
    return;
  }

  // Everything below mutates (or reads) an existing ledger.
  const store = await Store.open(projectRoot);
  store.setSubmitter(submitter);

  if (command === 'show') {
    print(store.currentSnapshot());
    return;
  }

  if (command === 'list') {
    const what = optionalStr(args, 'what') ?? 'all';
    const snapshot = store.currentSnapshot();
    const all = {
      project_id: snapshot.project.project_id,
      revision: store.currentRevision(),
      repositories: store.listRepositories(),
      workspaces: store.listWorkspaces(),
      topics: store.listTopics(),
      tasks: store.listTasks(),
    };
    if (what === 'all') {
      print(all);
    } else if (what in all) {
      print({ [what]: (all as Record<string, unknown>)[what] });
    } else {
      throw new CliError('--what must be one of repositories|workspaces|topics|tasks|all');
    }
    return;
  }

  if (command === 'bindings') {
    // Machine-local only: printed for local diagnosis, never written to a portable file.
    print(await store.bindings());
    return;
  }

  if (command === 'land') {
    await runLand(store, args);
    return;
  }

  if (command === 'view') {
    await runView(store, args);
    return;
  }

  // Mutating commands: preflight the capability handshake against the ledger.
  preflight(store.currentSnapshot().schema_version);

  const outcome = await dispatch(store, command, args);
  print(outcome);
  // A rejected mutation is an ordinary outcome for the library, but for a shell it is a
  // failure: `tallyback claim … && tallyback settle …` and any CI step must not carry on
  // as though the append landed. The machine-readable body still goes to stdout.
  if (isRejected(outcome)) {
    const { code, message } = outcome as { code?: string; message?: string };
    process.stderr.write(`${code ?? 'error'}: ${message ?? 'the mutation was rejected'}\n`);
    process.exitCode = 1;
  }
}

/** Whether a command result is a `{ ok: false }` mutation outcome. */
function isRejected(outcome: unknown): boolean {
  return (
    typeof outcome === 'object' &&
    outcome !== null &&
    'ok' in outcome &&
    (outcome as { ok: unknown }).ok === false
  );
}

async function dispatch(store: Store, command: string, args: Args): Promise<unknown> {
  switch (command) {
    // -- Bootstrap: the operations that make `init` → `declare` → `dispatch` reachable --

    case 'topic': {
      return store.createTopic({
        name: str(args, 'name'),
        goal: optionalStr(args, 'goal') ?? '',
        created_by: actor(args, 'actor', DEFAULT_ACTOR),
      });
    }

    case 'task': {
      return store.createTask({
        topic_id: str(args, 'topic-id'),
        title: str(args, 'title'),
        alias: optionalStr(args, 'alias'),
      });
    }

    case 'workspace': {
      return store.registerWorkspace({
        repository_id: str(args, 'repository-id'),
        branch: optionalStr(args, 'branch'),
        ref: optionalStr(args, 'ref'),
      });
    }

    case 'bind': {
      // Writes only `runtime/bindings.json`: machine-local, always ignored, and the only
      // place an absolute path is allowed to exist (SPEC §5.2).
      return store.bindWorkspace({
        repository_id: str(args, 'repository-id'),
        workspace_id: str(args, 'workspace-id'),
        root: str(args, 'root'),
      });
    }

    // -- Verify: named provider interfaces only, never a shell command string ----------

    case 'begin-check': {
      return store.beginCheckFor({
        claim_id: str(args, 'claim-id'),
        checker: { id: str(args, 'checker-id'), version: str(args, 'checker-version') },
        invoked_by: actor(args, 'actor', { kind: 'tool', id: 'tallyback-check' }),
      });
    }

    case 'record-check': {
      const outcome = str(args, 'outcome');
      if (!['verdict_emitted', 'verdict_withheld', 'check_failed'].includes(outcome)) {
        throw new CliError(
          '--outcome must be one of verdict_emitted|verdict_withheld|check_failed',
        );
      }
      const verdicts = jsonArray<Verdict>(args, 'verdict');
      if (verdicts.length > 1) {
        throw new CliError('--verdict may be given at most once (a result carries one Verdict)');
      }
      return store.recordCheckResult({
        check_invocation_id: str(args, 'invocation-id'),
        outcome: outcome as CheckResultOutcome,
        diagnostics: diagnostics(args, 'diagnostic'),
        reconciliations: jsonArray<Reconciliation>(args, 'reconciliation'),
        produced_evidence: jsonArray<Evidence>(args, 'evidence-record'),
        verdict: verdicts[0] ?? null,
        produced_by: actor(args, 'actor', { kind: 'tool', id: 'tallyback-check' }),
      });
    }

    case 'declare': {
      const criteria = strArray(args, 'criterion').map((c) => {
        const idx = c.indexOf(':');
        if (idx <= 0) throw new CliError('--criterion must be "code:statement"');
        return { code: c.slice(0, idx), statement: c.slice(idx + 1) };
      });
      return store.declare({
        task_id: taskRef(store, args),
        objective: str(args, 'objective'),
        criteria,
        declared_by: actor(args, 'actor', DEFAULT_ACTOR),
        supersedes: optionalStr(args, 'supersedes'),
      });
    }

    case 'dispatch': {
      return store.dispatch({
        task_id: taskRef(store, args),
        declaration_id: str(args, 'declaration-id'),
        repository_id: str(args, 'repository-id'),
        workspace_id: str(args, 'workspace-id'),
        executor: actor(args, 'executor', DEFAULT_ACTOR),
        dispatched_by: actor(args, 'dispatcher', DEFAULT_ACTOR),
        session_id: optionalStr(args, 'session-id'),
      });
    }

    case 'end': {
      const outcome = str(args, 'outcome');
      if (outcome !== 'returned' && outcome !== 'failed' && outcome !== 'cancelled') {
        throw new CliError('--outcome must be one of returned|failed|cancelled');
      }
      return store.endAttempt({
        attempt_id: str(args, 'attempt-id'),
        outcome,
        reported_by: actor(args, 'actor', DEFAULT_ACTOR),
        reason: optionalStr(args, 'reason'),
        supersedes: optionalStr(args, 'supersedes'),
      });
    }

    case 'claim': {
      return store.observeClaim({
        task_id: taskRef(store, args),
        attempt_id: str(args, 'attempt-id'),
        declaration_id: str(args, 'declaration-id'),
        statement: str(args, 'statement'),
        evidence_ids: strArray(args, 'evidence'),
        claimed_by: actor(args, 'actor', DEFAULT_ACTOR),
      });
    }

    case 'evidence': {
      const kind = str(args, 'kind');
      return store.observeEvidence({
        kind: kind as never,
        payload: jsonValue(args, 'payload') as never,
        submitted_by: actor(args, 'actor', DEFAULT_ACTOR),
        note: optionalStr(args, 'note'),
      });
    }

    case 'block': {
      return store.raiseBlocker({
        task_id: taskRef(store, args),
        description: str(args, 'description'),
        raised_by: actor(args, 'actor', DEFAULT_ACTOR),
        attempt_id: optionalStr(args, 'attempt-id'),
      });
    }

    case 'resolve': {
      const disposition = str(args, 'disposition');
      if (disposition !== 'resolved' && disposition !== 'withdrawn') {
        throw new CliError('--disposition must be one of resolved|withdrawn');
      }
      return store.resolveBlocker({
        blocker_id: str(args, 'blocker-id'),
        disposition,
        resolved_by: actor(args, 'actor', DEFAULT_ACTOR),
        explanation: optionalStr(args, 'explanation'),
        evidence_ids: strArray(args, 'evidence'),
        supersedes: optionalStr(args, 'supersedes'),
      });
    }

    case 'settle': {
      const decision = str(args, 'decision');
      if (!['accept', 'retry', 'abandon', 'land'].includes(decision)) {
        throw new CliError('--decision must be one of accept|retry|abandon|land');
      }
      return store.settle({
        task_id: taskRef(store, args),
        attempt_id: str(args, 'attempt-id'),
        decision: decision as 'accept' | 'retry' | 'abandon' | 'land',
        decided_by: actor(args, 'actor', DEFAULT_ACTOR),
        basis: {
          verdict_id: optionalStr(args, 'verdict-id') ?? null,
          attempt_end_id: optionalStr(args, 'attempt-end-id') ?? null,
          blocker_ids: strArray(args, 'blocker'),
        },
        verification_exception: optionalStr(args, 'verification-exception') ?? null,
        rationale: str(args, 'rationale'),
        supersedes: optionalStr(args, 'supersedes'),
      });
    }

    case 'decision': {
      const subjectKind = str(args, 'subject-kind');
      if (!['project', 'topic', 'task', 'attempt'].includes(subjectKind)) {
        throw new CliError('--subject-kind must be one of project|topic|task|attempt');
      }
      const role = str(args, 'role');
      if (role !== 'execution_choice' && role !== 'next_action') {
        throw new CliError('--role must be one of execution_choice|next_action');
      }
      return store.recordDecision({
        subject: { kind: subjectKind as never, id: str(args, 'subject-id') },
        role: role as 'execution_choice' | 'next_action',
        question: str(args, 'question'),
        choice: str(args, 'choice'),
        rationale: str(args, 'rationale'),
        decided_by: actor(args, 'actor', DEFAULT_ACTOR),
        basis: strArray(args, 'basis'),
        supersedes: optionalStr(args, 'supersedes'),
      });
    }

    default:
      throw new CliError(
        `unknown command "${command}". Available: handshake, version, init, migrate, ` +
          `validate, reconcile, show, list, bindings, land, view, topic, task, workspace, ` +
          `bind, declare, dispatch, end, claim, evidence, begin-check, record-check, block, ` +
          `resolve, settle, decision`,
      );
  }
}

// ---------------------------------------------------------------------------
// Validation gate + pre-merge reconciliation
// ---------------------------------------------------------------------------

/**
 * `tallyback validate` — the CI gate.
 *
 * Reports everything wrong with the portable files and exits non-zero if anything is.
 * This is where validation belongs in a branch workflow: a fork produced by merging two
 * histories is caught here, before the branch lands, rather than surfacing later as an
 * unopenable ledger. Problems it can repair are flagged `reconcilable`.
 */
async function runValidate(projectRoot: string): Promise<void> {
  const diagnosis = await diagnoseLedger(projectRoot);
  print({
    ok: diagnosis.ok,
    root: diagnosis.root,
    problems: diagnosis.problems,
    conflicts: diagnosis.conflicts.map((c) => ({
      lineage: c.key,
      type: c.type,
      subject: c.subject,
      heads: c.heads,
    })),
    // What to run next, when there is something to run.
    next: diagnosis.conflicts.length
      ? `tallyback reconcile ${diagnosis.conflicts.map((c) => `--keep <one of ${c.heads.join('|')}>`).join(' ')}`
      : null,
  });
  if (!diagnosis.ok) {
    process.stderr.write(
      `validation failed: ${diagnosis.problems.length} problem(s)\n` +
        diagnosis.problems.map((p) => `  ${p.code} (${p.layer}): ${p.message}`).join('\n') +
        '\n',
    );
    process.exitCode = 1;
  }
}

/**
 * `tallyback reconcile` — collapse forked lineages before a merge lands.
 *
 * With no `--keep`, it lists the decisions that are owed and writes nothing. Each
 * `--keep <id>` names the head that should survive in one forked lineage; a run that does
 * not decide every fork writes nothing at all, because SPEC §5.4 forbids Store choosing a
 * head on its own.
 */
async function runReconcile(projectRoot: string, args: Args): Promise<void> {
  const keep = strArray(args, 'keep');
  const dryRun = args['dry-run'] === 'true' || keep.length === 0;

  const outcome = await reconcileLedger({ projectRoot, keep, dryRun });
  if (!outcome.ok) {
    print({
      ok: false,
      code: outcome.code,
      message: outcome.message,
      conflicts: outcome.conflicts.map((c) => ({
        lineage: c.key,
        type: c.type,
        subject: c.subject,
        heads: c.heads,
      })),
    });
    process.stderr.write(`${outcome.code}: ${outcome.message}\n`);
    process.exitCode = 1;
    return;
  }
  print({
    ok: true,
    wrote: outcome.wrote === true,
    dry_run: dryRun,
    revision: outcome.plan.snapshot.revision,
    rewrites: outcome.plan.rewrites,
  });
}

// ---------------------------------------------------------------------------
// Land (read-only, advisory Git-reality cross-check — docs/land-design.md)
// ---------------------------------------------------------------------------

/**
 * `tallyback land [--target-branch main]` — cross-checks the ledger's `ready_to_land`
 * projection against live Git state. Read-only and advisory: it never merges, rebases,
 * pushes, or writes to the ledger (design §2). Worktrees are resolved the same way Check
 * resolves them, via `runtime/bindings.json`.
 */
async function runLand(store: Store, args: Args): Promise<void> {
  const targetBranch = str(args, 'target-branch', 'main');
  const snapshot = store.currentSnapshot();
  const resolver = createGitResolver();
  const report: LandReport = await buildLandReport(snapshot, resolver, targetBranch);
  print({ target_branch: targetBranch, ...report });
  process.stderr.write(
    `land: ${report.ready.length} ready, ${report.unresolved.length} unresolved, ` +
      `${report.conflicts.length} conflict group(s) against "${targetBranch}"\n`,
  );
}

// ---------------------------------------------------------------------------
// View (read-only, compact per-task tallyback projection — docs/view-design.md)
// ---------------------------------------------------------------------------

/**
 * `tallyback view [--task-id <id>]... [--stale-after-ms <n>]` — assembles the compact
 * per-task shape SPEC §6 calls a "tallyback": declaration, attempts, claims, evidence
 * pointers, blockers, verification, settlement, status, and next_action. Read-only; never
 * writes to the ledger (design §2).
 */
async function runView(store: Store, args: Args): Promise<void> {
  const taskIds = taskRefs(store, args);
  const staleAfterMsRaw = optionalStr(args, 'stale-after-ms');
  const staleAfterMs = staleAfterMsRaw !== undefined ? Number(staleAfterMsRaw) : DEFAULT_STALE_AFTER_MS;
  if (!Number.isFinite(staleAfterMs) || staleAfterMs < 0) {
    throw new CliError('--stale-after-ms must be a non-negative finite number');
  }

  const snapshot = store.currentSnapshot();
  const policy = { now: new Date().toISOString(), staleAfterMs };
  const views = buildTaskViews(snapshot, taskIds.length > 0 ? taskIds : undefined, policy);
  const summary = summarizeTaskViews(views);

  print({ generated_from_revision: snapshot.revision, tasks: views, summary });
  process.stderr.write(
    `view: ${summary.task_count} task(s), ${summary.blocked} blocked, ` +
      `${summary.ready_to_land} ready_to_land, ${summary.stale} stale, ${summary.settled} settled\n`,
  );
}

// ---------------------------------------------------------------------------
// Migration entry point (SPEC §14)
// ---------------------------------------------------------------------------

/**
 * `tallyback migrate --source <legacy.json> [--preview | --apply]`.
 *
 * Preview is the default: nothing is written until `--apply` is passed explicitly, and a
 * ledger that has already been migrated is refused rather than silently re-run. The
 * canonical ids a preview reports are the ids an apply will use.
 */
async function runMigrate(projectRoot: string, args: Args, submitter: Actor): Promise<void> {
  const source = str(args, 'source');
  const loaded = await readLegacySource(source);
  if (!loaded.ok) {
    fail(loaded.code, loaded.message);
  }
  const apply = args['apply'] === 'true';
  const options = {
    projectRoot,
    legacy: loaded.legacy,
    source,
    legacy_schema_version: optionalStr(args, 'legacy-schema-version'),
    created_by: actor(args, 'actor', submitter),
  };
  const outcome: MigrationOutcome = apply
    ? await applyMigration(options)
    : await previewMigration(options);

  if (!outcome.ok) {
    process.stderr.write(`${outcome.code}: ${outcome.message}\n`);
    process.exitCode = 1;
    print({ ok: false, code: outcome.code, message: outcome.message, report: outcome.report });
    return;
  }
  print({
    ok: true,
    kind: outcome.kind,
    resumed: outcome.resumed,
    // A preview is explicit about having written nothing.
    wrote: outcome.kind === 'applied',
    report: outcome.report,
  });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

run().catch((err) => {
  if (err instanceof CliError) {
    process.stderr.write(`error: ${err.message}\n`);
    process.exitCode = 1;
    return;
  }
  const code =
    err && typeof err === 'object' && 'code' in err
      ? String((err as { code: unknown }).code)
      : 'error';
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${code}: ${message}\n`);
  process.exitCode = 1;
});
