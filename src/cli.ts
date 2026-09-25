#!/usr/bin/env node
/**
 * Reference CLI — thin host adapter over the deterministic core library.
 *
 * Land and Watch resolve workspaces via `runtime/bindings.json` under THIS process's
 * `--project-root` (`store.root`), passed explicitly as `bindingsPath` — never via
 * `resolveWorkspace`'s default `discoverBindingsPath()`, which walks up from
 * `process.cwd()` and has no reason to agree with `--project-root` when the two differ
 * (the ordinary case for any caller that doesn't `cd` into the project first).
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

import { join } from 'node:path';
import {
  diagnoseLedger,
  isLedgerAbsent,
  newId,
  nowIso,
  reconcileLedger,
  Store,
  type LedgerDiagnosis,
} from './ledger/index.js';
import {
  applyMigration,
  previewMigration,
  readLegacySource,
  type MigrationOutcome,
} from './check/migration-workflow.js';
import { buildLandReport, createGitResolver, type LandReport } from './land/index.js';
import {
  buildTaskViews,
  DEFAULT_STALE_AFTER_MS,
  deriveLedgerNextAction,
  summarizeTaskViews,
} from './view/index.js';
import { buildWatchReport, createWatchResolver } from './watch/index.js';
import { canMutateContractVersion, handshake } from './version.js';
import {
  checkUsage,
  COMMAND_SPECS,
  describeEvidencePayload,
  EVIDENCE_KINDS,
  renderUsage,
} from './cli-spec.js';
import {
  ACTOR_KINDS,
  ATTEMPT_END_OUTCOMES,
  CHECK_RESULT_OUTCOMES,
  DECISION_ROLES,
  DECISION_SUBJECT_KINDS,
  DISPOSITIONS,
  SETTLEMENT_DECISIONS,
} from './contract/index.js';
import type {
  Actor,
  ActorKind,
  ConfidenceLevel,
  Diagnostic,
  Evidence,
  Finality,
  Finding,
  Reconciliation,
  Verdict,
  VerdictConclusion,
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
const BOOLEAN_FLAGS = new Set([
  'apply',
  'preview',
  'dry-run',
  'help',
  'allow-partial',
  'all',
  'repair-header',
  'no-criteria',
]);

function parseArgs(argv: string[]): { command: string; args: Args; positionals: string[] } {
  const args: Args = {};
  const positionals: string[] = [];
  // Flags may precede the command word (`tallyback --project-root x view`). Leading
  // `--key value` / `--key=value` pairs are collected first and validated with the rest.
  let start = 0;
  while (start < argv.length && argv[start]!.startsWith('--') && argv[start] !== '--help') {
    const token = argv[start]!;
    const eq = token.indexOf('=');
    if (eq > 2) {
      args[token.slice(2, eq)] = token.slice(eq + 1);
      start += 1;
    } else if (BOOLEAN_FLAGS.has(token.slice(2))) {
      args[token.slice(2)] = 'true';
      start += 1;
    } else {
      if (argv[start + 1] === undefined) {
        throw new CliError(`${token} requires a value`, 'cli.missing_flag');
      }
      args[token.slice(2)] = argv[start + 1]!;
      start += 2;
    }
  }
  const [command, ...rest] = argv.slice(start);

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
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }

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
  return { command: command ?? 'handshake', args, positionals };
}

function str(args: Args, key: string, fallback?: string): string {
  const value = args[key];
  if (typeof value === 'string') return value;
  if (fallback !== undefined) return fallback;
  throw new CliError(`missing required --${key}`, 'cli.missing_flag');
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

/** Parse a `--key` value restricted to one of `allowed`, erroring with the same message
 * shape every enum flag has always used: `--key must be one of a|b|c`. */
function enumArg<T extends string>(args: Args, key: string, allowed: readonly T[]): T {
  const value = str(args, key);
  if (!(allowed as readonly string[]).includes(value)) {
    throw new CliError(`--${key} must be one of ${allowed.join('|')}`, 'cli.invalid_value');
  }
  return value as T;
}

/** Parse an `--actor` / `--as` value of the form `kind:id`. */
function actor(args: Args, key: string, fallback: Actor): Actor {
  const raw = optionalStr(args, key);
  if (!raw) return fallback;
  return parseActor(raw, `--${key}`);
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

/** The command being run, for usage diagnostics raised deep inside argument parsing. */
let currentCommand = '';
/** The `--kind` of an `evidence` command, for payload diagnostics. */
let currentKind = '';

/** A usage error: the command was not run and nothing was written. */
class CliError extends Error {
  constructor(
    message: string,
    readonly code = 'cli.usage_error',
  ) {
    super(message);
  }
}

/**
 * Who authored a record when the command does not say (`--actor`).
 *
 * The CLI cannot know which agent or person is typing, so it does not guess. A host that
 * does know — a bridge or an agent runtime — sets `TALLYBACK_ACTOR=kind:id` explicitly;
 * otherwise the record says `unknown:unattributed`. It used to say `tool:tallyback`, which
 * attributed an agent's Claims, Verdicts, and Settlements to Tallyback itself (dogfood F7,
 * 8/9 runs). The operation's provenance (`--as`, default `tool:tallyback`) is separate: the
 * tool really does submit the append.
 */
const UNATTRIBUTED: Actor = { kind: 'unknown', id: 'unattributed' };
let DEFAULT_ACTOR: Actor = UNATTRIBUTED;

function parseActor(raw: string, source: string): Actor {
  const idx = raw.indexOf(':');
  const kind = raw.slice(0, idx) as ActorKind;
  if (idx <= 0 || idx === raw.length - 1 || !ACTOR_KINDS.includes(kind)) {
    throw new CliError(
      `${source} must be "kind:id" with kind one of ${ACTOR_KINDS.join('|')} (got "${raw}")`,
      'cli.invalid_value',
    );
  }
  return { kind, id: raw.slice(idx + 1) };
}

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
// Ledger absence (bootstrap state)
// ---------------------------------------------------------------------------

/**
 * Reported when the project root provably has no ledger (neither portable file exists).
 * The counterpart of `mutation.ledger_already_initialized`, in the same namespace.
 */
const LEDGER_NOT_INITIALIZED = 'mutation.ledger_not_initialized';

/** Quote a value for a POSIX shell only when it needs it. */
function shellArg(value: string): string {
  return /^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Open the ledger for a command that needs one.
 *
 * "No ledger here" is a machine-known state, so it is reported as a structured outcome
 * with one runnable recovery command, not as the filesystem exception `Store.open` hits
 * first. Only proven absence (`isLedgerAbsent`) is classified this way: a partial,
 * unreadable, corrupt, or contradictory ledger rethrows its own failure unchanged.
 *
 * `tallyback init` with no `--repository` registers init's own documented default
 * repository, so the command below is exact without guessing an alias here.
 */
async function openLedger(projectRoot: string, explicitRoot?: string): Promise<Store | null> {
  try {
    return await Store.open(projectRoot);
  } catch (err) {
    if (!(await isLedgerAbsent(projectRoot))) throw err;
    const message = `No Tallyback ledger exists at ${join(projectRoot, '.tallyback')}.`;
    print({
      ok: false,
      code: LEDGER_NOT_INITIALIZED,
      message,
      next_action: {
        command:
          explicitRoot === undefined
            ? 'tallyback init'
            : `tallyback init --project-root ${shellArg(explicitRoot)}`,
        reason: 'Initialize Tallyback before viewing or recording tracked work.',
      },
    });
    process.stderr.write(`${LEDGER_NOT_INITIALIZED}: ${message}\n`);
    process.exitCode = 1;
    return null;
  }
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

/**
 * Compact top-level usage, printed by `tallyback --help` / `tallyback help`.
 *
 * `--help` / `help` are natural first commands for a new user and must work from any
 * directory, including one with no `.tallyback/` project yet — so this is handled before
 * any project-root resolution or Store open below. There is no per-command help system;
 * this deliberately stays a short, deterministic string rather than a generated help
 * subsystem. Full flag-level detail lives in README.md and src/cli.ts.
 */
const HELP_TEXT = `tallyback — Git-native accountability ledger for delegated agent work

Usage: tallyback <command> [--flag value ...]

Capability / bootstrap:
  handshake, version, init, migrate

Core loop (declare -> dispatch -> observe -> verify -> settle):
  topic, task, workspace, bind, declare, dispatch, end, claim, evidence,
  begin-check, record-check, verdict, block, resolve, settle, decision

Read-only reports / gates:
  show, list, bindings, land, view, watch, validate, reconcile

Run with no command for the capability handshake.
Flags, accepted values, and examples for one command: tallyback <command> --help
`;

async function run(): Promise<void> {
  const { command, args, positionals } = parseArgs(process.argv.slice(2));
  currentCommand = command;

  // Top-level help must work before any project-root / Store resolution: a new user
  // reaching for `--help` should never be met with a raw ENOENT for a ledger that
  // doesn't exist yet.
  if (command === '--help' || command === 'help') {
    // `tallyback help <command>` prints that command's usage.
    const topic = positionals[0];
    const spec = topic ? COMMAND_SPECS.get(topic) : undefined;
    if (topic && !spec) throw new CliError(`unknown command "${topic}"`, 'cli.unknown_command');
    process.stdout.write(spec ? renderUsage(spec) : HELP_TEXT);
    return;
  }

  // `tallyback <command> --help` never runs the command — it used to be parsed and then
  // ignored, so `tallyback task … --help` created a Task.
  if (args['help'] === 'true') {
    const spec = COMMAND_SPECS.get(command);
    if (!spec) throw new CliError(`unknown command "${command}"`, 'cli.unknown_command');
    process.stdout.write(renderUsage(spec));
    return;
  }

  // Unknown input fails closed, before any ledger is opened or written: an undeclared
  // flag, a repeated single-value flag, or a stray positional token is a usage error.
  const problem = checkUsage(command, args, positionals);
  if (problem) throw new CliError(problem.message, problem.code);

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
  const envActor = process.env['TALLYBACK_ACTOR'];
  DEFAULT_ACTOR =
    optionalStr(args, 'as') !== undefined
      ? submitter
      : envActor
        ? parseActor(envActor, 'TALLYBACK_ACTOR')
        : UNATTRIBUTED;

  if (command === 'init') {
    const repositories = strArray(args, 'repository').map((alias) => ({ alias }));
    const topicName = optionalStr(args, 'topic');
    const goal = optionalStr(args, 'goal');
    const store = await Store.init(projectRoot, {
      project_id: optionalStr(args, 'project-id'),
      repositories: repositories.length > 0 ? repositories : undefined,
      topic: topicName ? { name: topicName, goal: goal ?? '' } : undefined,
      created_by: actor(args, 'actor', DEFAULT_ACTOR),
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
  const store = await openLedger(projectRoot, optionalStr(args, 'project-root'));
  if (!store) return;
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

  if (command === 'watch') {
    await runWatch(store, args);
    return;
  }

  // Mutating commands: preflight the capability handshake against the ledger.
  preflight(store.currentSnapshot().schema_version);

  const dispatched = await dispatch(store, command, args, submitter);
  const hint = isRejected(dispatched) ? cliHint(command, dispatched as RejectedOutcome) : null;
  const outcome = hint ? { ...(dispatched as object), hint } : dispatched;
  print(outcome);
  // A rejected mutation is an ordinary outcome for the library, but for a shell it is a
  // failure: `tallyback claim … && tallyback settle …` and any CI step must not carry on
  // as though the append landed. The machine-readable body still goes to stdout.
  if (isRejected(outcome)) {
    const { code, message } = outcome as { code?: string; message?: string };
    process.stderr.write(
      `${code ?? 'error'}: ${message ?? 'the mutation was rejected'}\n` +
        (hint ? `hint: ${hint}\n` : ''),
    );
    process.exitCode = 1;
  }
}

interface RejectedOutcome {
  ok: false;
  code?: string;
  message?: string;
}

/**
 * Translate a rejection phrased in contract-record terms into the flags that fix it.
 *
 * The validator speaks the wire format (`basis.verdict_id`, `/records/0/workspace_id`);
 * a CLI caller needs `--verdict-id`, `--workspace-id`. The machine-readable `code` and the
 * validator's `message` are passed through unchanged; this only adds a `hint`.
 */
function cliHint(command: string, outcome: RejectedOutcome): string | null {
  const message = outcome.message ?? '';
  if (command === 'settle' && outcome.code === 'invariant.settlement_basis_matrix') {
    if (/requires exactly one of/.test(message)) {
      return (
        'accept and land need exactly one basis: --verdict-id <ver_…> (a Verdict recorded with ' +
        '`tallyback verdict`), or --verification-exception "<why this is accepted without a ' +
        'Verdict>" — an explicit, attributed override. Passing tests are not a Verdict.'
      );
    }
    if (/must not cite a verdict/.test(message)) {
      return 'retry and abandon must not pass --verdict-id; cite --attempt-end-id and/or --blocker instead.';
    }
    if (/verification_exception/.test(message)) {
      return '--verification-exception is only for accept/land; retry and abandon take --attempt-end-id and/or --blocker.';
    }
  }
  if (command === 'decision' && outcome.code === 'invariant.supersession_conflict') {
    return (
      'a Decision with this subject and role already exists; Decisions are revised, never ' +
      'duplicated. Record yours with --supersedes <dec_…> (the current one is ' +
      '`attempts[].execution_fit.decision_id` in `tallyback view` for a Fit, or in `tallyback show`). ' +
      'A Fit belongs to the executor that made it: record your own, do not reuse it.'
    );
  }
  if (command === 'evidence' && /payload|evidence kind/.test(message)) {
    const kind = EVIDENCE_KINDS.find((k) => k === currentKind);
    return (
      (kind
        ? `--payload for kind ${describeEvidencePayload(kind)}. `
        : `--kind must be one of ${EVIDENCE_KINDS.join('|')}. `) +
      'Put the human-readable result (counts, failing tests) in --note. ' +
      'See `tallyback evidence --help` for every kind.'
    );
  }
  if (command === 'record-check') {
    return (
      'record-check takes complete contract records. To judge a Claim, use ' +
      '`tallyback verdict --claim <clm_…> --criterion <code>=<assessment> --confidence <level> ' +
      '--rationale "…"`, which records the CheckInvocation, CheckResult, and Verdict together. ' +
      'If no Verdict was reached, record that honestly with --outcome verdict_withheld; ' +
      'use check_failed only when the check itself failed.'
    );
  }
  const field = /\/records\/\d+\/([a-z_]+)/.exec(message)?.[1];
  const flag = field?.replace(/_/g, '-');
  if (flag && COMMAND_SPECS.get(command)?.flags.some((f) => f.name === flag)) {
    const idPrefix = /must match pattern "\^([a-z]+_)\[0-9a-f\]\{8\}/.exec(message)?.[1];
    if (idPrefix) {
      return `--${flag} must be a ${idPrefix}<UUIDv7> id, not a name or path; find ids with \`tallyback list\` or \`tallyback view\`.`;
    }
    return `check --${flag}: ${message.replace(/^\/records\/\d+\/[a-z_]+\s*/, '')}. See \`tallyback ${command} --help\`.`;
  }
  return null;
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

async function dispatch(
  store: Store,
  command: string,
  args: Args,
  submitter: Actor,
): Promise<unknown> {
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
        invoked_by: actor(args, 'actor', DEFAULT_ACTOR),
      });
    }

    case 'record-check': {
      const outcome = enumArg(args, 'outcome', CHECK_RESULT_OUTCOMES);
      const verdicts = jsonArray<Verdict>(args, 'verdict');
      if (verdicts.length > 1) {
        throw new CliError('--verdict may be given at most once (a result carries one Verdict)');
      }
      const verdict = verdicts[0] as unknown;
      if (
        verdict !== undefined &&
        (typeof verdict !== 'object' ||
          verdict === null ||
          typeof (verdict as { verdict_id?: unknown }).verdict_id !== 'string')
      ) {
        throw new CliError(
          '--verdict must be a complete Verdict record (it has no verdict_id); nothing was ' +
            'recorded. To judge a Claim without writing raw records, use `tallyback verdict`',
          'cli.invalid_value',
        );
      }
      return store.recordCheckResult({
        check_invocation_id: str(args, 'invocation-id'),
        outcome,
        diagnostics: diagnostics(args, 'diagnostic'),
        reconciliations: jsonArray<Reconciliation>(args, 'reconciliation'),
        produced_evidence: jsonArray<Evidence>(args, 'evidence-record'),
        verdict: verdicts[0] ?? null,
        produced_by: actor(args, 'actor', DEFAULT_ACTOR),
      });
    }

    case 'declare': {
      const criteria = strArray(args, 'criterion').map((c) => {
        const idx = c.indexOf(':');
        if (idx <= 0) throw new CliError('--criterion must be "code:statement"');
        return { code: c.slice(0, idx), statement: c.slice(idx + 1) };
      });
      // A declaration without criteria cannot be judged later (`tallyback verdict` has
      // nothing to assess). The contract allows it, so the CLI does not forbid it — but it
      // must be deliberate, not the silent result of a forgotten or misspelled flag.
      const noCriteria = args['no-criteria'] === 'true';
      if (criteria.length === 0 && !noCriteria) {
        throw new CliError(
          'declare needs at least one --criterion "code:statement" (repeat per acceptance ' +
            'criterion) — criteria are what a Verdict later assesses. To record a declaration ' +
            'without any, deliberately, pass --no-criteria',
          'cli.missing_flag',
        );
      }
      if (criteria.length > 0 && noCriteria) {
        throw new CliError('--no-criteria contradicts --criterion', 'cli.invalid_value');
      }
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
      const outcome = enumArg(args, 'outcome', ATTEMPT_END_OUTCOMES);
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
      currentKind = kind;
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
      const disposition = enumArg(args, 'disposition', DISPOSITIONS);
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
      const decision = enumArg(args, 'decision', SETTLEMENT_DECISIONS);
      return store.settle({
        task_id: taskRef(store, args),
        attempt_id: str(args, 'attempt-id'),
        decision,
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
      const subjectKind = enumArg(args, 'subject-kind', DECISION_SUBJECT_KINDS);
      const role = enumArg(args, 'role', DECISION_ROLES);
      return store.recordDecision({
        subject: { kind: subjectKind, id: str(args, 'subject-id') },
        role,
        question: str(args, 'question'),
        choice: str(args, 'choice'),
        rationale: str(args, 'rationale'),
        decided_by: actor(args, 'actor', DEFAULT_ACTOR),
        basis: strArray(args, 'basis'),
        supersedes: optionalStr(args, 'supersedes'),
      });
    }
    case 'verdict': {
      return runVerdict(store, args, submitter);
    }

    default:
      throw new CliError(
        `unknown command "${command}". Available: handshake, version, init, migrate, ` +
          `validate, reconcile, show, list, bindings, land, view, watch, topic, task, workspace, ` +
          `bind, declare, dispatch, end, claim, evidence, begin-check, record-check, verdict, ` +
          `block, resolve, settle, decision`,
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
/** The `tallyback reconcile …` invocation that would fix a diagnosis, if any would. */
function reconcileHint(diagnosis: LedgerDiagnosis): string | null {
  const flags = diagnosis.conflicts.map((c) => `--keep <one of ${c.heads.join('|')}>`);
  if (diagnosis.problems.some((p) => p.code === 'invariant.project_repositories_mismatch')) {
    flags.push('--repair-header');
  }
  return flags.length > 0 ? `tallyback reconcile ${flags.join(' ')}` : null;
}

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
    next: reconcileHint(diagnosis),
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
  const repairHeader = args['repair-header'] === 'true';
  // Nothing is written without an explicit decision: a `--keep` per fork, or
  // `--repair-header` to rebuild project.json from the authoritative state.json.
  const dryRun = args['dry-run'] === 'true' || (keep.length === 0 && !repairHeader);

  const outcome = await reconcileLedger({ projectRoot, keep, dryRun, repairHeader });
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
    ...(outcome.plan.header ? { header: outcome.plan.header } : {}),
  });
}

// ---------------------------------------------------------------------------
// Verdict (ergonomic Verdict authoring — SPEC §5.4, §8.1)
// ---------------------------------------------------------------------------

/** Allowed per-criterion assessments and overall Verdict conclusions (closed contract enum). */
const VERDICT_ASSESSMENTS: readonly VerdictConclusion[] = [
  'supported',
  'partially_supported',
  'unsupported',
  'contradicted',
];

const CONFIDENCE_LEVELS: readonly ConfidenceLevel[] = ['low', 'medium', 'high'];

/**
 * Parse a `--criterion <ref>=<assessment>` pair, where `<ref>` is either the generated
 * `cri_<UUIDv7>` criterion id or the human-meaningful `code` declared in the
 * TaskDeclaration. The canonical Verdict always stores only `criterion_id` — this is a
 * CLI ergonomic, not a contract change (SPEC §5.4). Throws CliError with an actionable
 * message on a malformed token, an unknown ref, an ambiguous code (the same code is
 * reused by two criteria), or a ref that resolves to no criterion in this declaration.
 *
 * Cross-form duplicates (e.g. `backup=supported` and `cri_<UUIDv7>=supported` for the
 * same Criterion) are caught by the caller's `seenIds` set, not here — both forms resolve
 * to the same canonical `criterion_id`, which the per-criterion duplicate detection already
 * rejects.
 */
function parseCriterionAssessment(
  raw: string,
  declaredCriterionIds: ReadonlySet<string>,
  codeToCriterionIds: ReadonlyMap<string, string[]>,
  declarationId: string,
): { criterion_id: string; assessment: VerdictConclusion } {
  const eq = raw.indexOf('=');
  if (eq <= 0) {
    throw new CliError(
      `--criterion must be "<ref>=<assessment>" where <ref> is a cri_<UUIDv7> id OR the code declared on the TaskDeclaration; one of supported|partially_supported|unsupported|contradicted; got "${raw}"`,
    );
  }
  const criterionRef = raw.slice(0, eq);
  const assessment = raw.slice(eq + 1);

  let criterionId: string | undefined;
  if (declaredCriterionIds.has(criterionRef)) {
    // Author supplied the canonical criterion id directly.
    criterionId = criterionRef;
  } else {
    const candidates = codeToCriterionIds.get(criterionRef);
    if (candidates !== undefined && candidates.length === 1) {
      criterionId = candidates[0]!;
    } else if (candidates !== undefined && candidates.length > 1) {
      // The same `code` was declared twice on this declaration — there is no single
      // criterion to assess. Refusing beats silently picking one: the operator either
      // fixes the declaration or supplies the `cri_<UUIDv7>` id to disambiguate.
      throw new CliError(
        `--criterion "${criterionRef}" is ambiguous: code is declared on ${candidates.length} criteria in declaration ${declarationId} (${candidates.join(', ')}); use the cri_<UUIDv7> id to disambiguate`,
      );
    }
  }

  if (criterionId === undefined) {
    const allCodes = [...codeToCriterionIds.keys()].sort();
    const allIds = [...declaredCriterionIds].sort();
    throw new CliError(
      `--criterion "${criterionRef}" is neither a declared code (${allCodes.join(', ')}) ` +
        `nor a cri_<UUIDv7> id (${allIds.join(', ')}) on declaration ${declarationId}`,
    );
  }

  if (!(VERDICT_ASSESSMENTS as readonly string[]).includes(assessment)) {
    throw new CliError(
      `--criterion assessment for ${criterionId} must be one of ${VERDICT_ASSESSMENTS.join('|')}; got "${assessment}"`,
    );
  }
  return { criterion_id: criterionId, assessment: assessment as VerdictConclusion };
}

/**
 * `tallyback verdict` — ergonomic Verdict authoring on top of the existing Check flow.
 *
 * The command mechanically handles everything a human/PM cannot get wrong about syntax
 * and record construction (Verdict id, issued_at, scope.unevaluated_criteria, finding
 * shape, the surrounding CheckInvocation + CheckResult) while forcing every actual
 * judgment — each criterion's assessment, the overall rationale, the confidence level,
 * uncertainty, and limitations — to be supplied explicitly.
 *
 * No claim of "tests/Git/claim say it is done" is silently mapped to `supported`.
 * Reuses `Store.beginCheckFor` and `Store.recordCheckResult`; never writes a Settlement.
 */
async function runVerdict(store: Store, args: Args, submitter: Actor): Promise<unknown> {
  const snapshot = store.currentSnapshot();

  // -- Resolve claim ---------------------------------------------------------
  const claimId = str(args, 'claim');
  const claim = snapshot.claims.find((c) => c.claim_id === claimId);
  if (!claim) {
    throw new CliError(`--claim: no Claim ${claimId} in this ledger`);
  }

  const attemptFromFlag = optionalStr(args, 'attempt');
  if (attemptFromFlag !== undefined && attemptFromFlag !== claim.attempt_id) {
    throw new CliError(
      `--attempt ${attemptFromFlag} does not match the Claim's attempt ${claim.attempt_id}; a Verdict judges one Claim, not an arbitrary Attempt`,
    );
  }

  // -- Resolve declaration ---------------------------------------------------
  const declaration = snapshot.declarations.find((d) => d.declaration_id === claim.declaration_id);
  if (!declaration) {
    throw new CliError(
      `--claim references declaration ${claim.declaration_id} which is not present in this ledger`,
    );
  }

  const declaredCriteriaById = new Map(
    declaration.criteria.map((c) => [c.criterion_id, c] as const),
  );
  const declaredCriterionIds = new Set(declaredCriteriaById.keys());
  if (declaredCriterionIds.size === 0) {
    throw new CliError(
      `declaration ${declaration.declaration_id} has no criteria; nothing to assess`,
    );
  }

  // Build the code → [criterion_id] map. The same `code` may legitimately appear on more
  // than one criterion (the schema permits it); the CLI resolves uniquely only when the
  // declaration happens to be unambiguous, and otherwise forces the operator to supply the
  // `cri_<UUIDv7>` id. We never modify the declaration here.
  const codeToCriterionIds = new Map<string, string[]>();
  for (const c of declaration.criteria) {
    const list = codeToCriterionIds.get(c.code);
    if (list) list.push(c.criterion_id);
    else codeToCriterionIds.set(c.code, [c.criterion_id]);
  }

  // -- Parse per-criterion assessments --------------------------------------
  const rawCriteria = strArray(args, 'criterion');
  if (rawCriteria.length === 0) {
    throw new CliError(
      `at least one --criterion <ref>=<assessment> is required; <ref> may be a cri_<UUIDv7> id or the criterion's declared code`,
    );
  }

  const assessments: { criterion_id: string; assessment: VerdictConclusion }[] = [];
  const seenIds = new Set<string>();
  const duplicateIds: string[] = [];
  for (const raw of rawCriteria) {
    const parsed = parseCriterionAssessment(
      raw,
      declaredCriterionIds,
      codeToCriterionIds,
      declaration.declaration_id,
    );
    if (seenIds.has(parsed.criterion_id)) {
      duplicateIds.push(parsed.criterion_id);
      continue;
    }
    seenIds.add(parsed.criterion_id);
    assessments.push(parsed);
  }
  if (duplicateIds.length > 0) {
    throw new CliError(
      `duplicate --criterion assessments for: ${[...new Set(duplicateIds)].join(', ')}; each criterion may be assessed at most once`,
    );
  }

  const evaluatedIds = assessments.map((a) => a.criterion_id);
  const unevaluatedIds = [...declaredCriterionIds].filter((id) => !seenIds.has(id));
  const allowPartial = args['allow-partial'] === 'true';
  if (unevaluatedIds.length > 0 && !allowPartial) {
    const lines = unevaluatedIds
      .map((id) => {
        const crit = declaredCriteriaById.get(id);
        return `  - ${id}${crit ? ` (${crit.code})` : ''}`;
      })
      .join('\n');
    throw new CliError(
      `${unevaluatedIds.length} declared criteria were not assessed:\n${lines}\n` +
        `Provide an explicit assessment for each criterion, or pass --allow-partial to leave some unevaluated.`,
    );
  }

  // -- Validate evidence / reconciliation references ------------------------
  const evidenceFlag = strArray(args, 'evidence');
  const evidenceIds = [...(evidenceFlag.length > 0 ? evidenceFlag : claim.evidence_ids)];
  const reconciliationIds = [...strArray(args, 'reconciliation')];
  const knownEvidence = new Set(snapshot.evidence.map((e) => e.evidence_id));
  const knownReconciliation = new Set(snapshot.reconciliations.map((r) => r.reconciliation_id));
  const missingEvidence = evidenceIds.filter((id) => !knownEvidence.has(id));
  const missingReconciliation = reconciliationIds.filter((id) => !knownReconciliation.has(id));
  const referenceProblems: string[] = [];
  if (missingEvidence.length > 0) {
    referenceProblems.push(
      `--evidence references not in this ledger: ${missingEvidence.join(', ')}`,
    );
  }
  if (missingReconciliation.length > 0) {
    referenceProblems.push(
      `--reconciliation references not in this ledger: ${missingReconciliation.join(', ')}`,
    );
  }
  if (referenceProblems.length > 0) {
    throw new CliError(referenceProblems.join('\n'));
  }

  // -- Required enums + strings ---------------------------------------------
  const confidence = enumArg(args, 'confidence', CONFIDENCE_LEVELS);
  const finality = (optionalStr(args, 'finality') ?? 'final') as Finality;
  const rationale = str(args, 'rationale');
  const confidenceRationale = optionalStr(args, 'confidence-rationale') ?? rationale;
  const conclusionFlag = optionalStr(args, 'conclusion');

  const conclusion: VerdictConclusion = (() => {
    if (conclusionFlag !== undefined) {
      if (!(VERDICT_ASSESSMENTS as readonly string[]).includes(conclusionFlag)) {
        throw new CliError(
          `--conclusion must be one of ${VERDICT_ASSESSMENTS.join('|')}; got "${conclusionFlag}"`,
        );
      }
      return conclusionFlag as VerdictConclusion;
    }
    // Safe to auto-derive ONLY when every criterion is evaluated AND every assessment
    // agrees. Mixed assessments or any unevaluated criterion require the operator to
    // state the overall conclusion explicitly — `Verdict.conclusion` is a semantic
    // judgment, not a mechanical aggregation.
    const assessmentValues = assessments.map((a) => a.assessment);
    if (unevaluatedIds.length > 0) {
      throw new CliError(
        `--conclusion is required when some criteria are left unevaluated (${unevaluatedIds.length} unevaluated); ` +
          `pass --conclusion one of ${VERDICT_ASSESSMENTS.join('|')}.`,
      );
    }
    const first = assessmentValues[0]!;
    const uniform = assessmentValues.every((a) => a === first);
    if (!uniform) {
      const distinct = [...new Set(assessmentValues)];
      throw new CliError(
        `--conclusion is required when per-criterion assessments are mixed (saw ${distinct.join(', ')}); ` +
          `pass --conclusion one of ${VERDICT_ASSESSMENTS.join('|')}.`,
      );
    }
    return first;
  })();
  // -- Optional metadata + actor identity -----------------------------------
  const uncertainty = strArray(args, 'uncertainty');
  const limitations = strArray(args, 'limitation');
  const checkerId = optionalStr(args, 'checker-id') ?? 'operator-authored';
  const checkerVersion = optionalStr(args, 'checker-version') ?? 'v1';
  if (!checkerId || !checkerVersion) {
    throw new CliError('--checker-id and --checker-version must be non-empty when provided');
  }
  const issuedBy = actor(args, 'actor', DEFAULT_ACTOR);

  // -- Per-criterion findings (optional, explicit) ---------------------------
  // `--finding <ref>=<summary>` and `--finding-basis <ref>=<evi_…|rec_…>` say *what*
  // supports each criterion. Without them a finding keeps the generic summary and an empty
  // basis_refs — never a citation nobody supplied.
  const assessedIds = new Set(assessments.map((a) => a.criterion_id));
  const resolveFindingRef = (flag: string, raw: string): [string, string] => {
    const eq = raw.indexOf('=');
    if (eq <= 0 || eq === raw.length - 1) {
      throw new CliError(
        `--${flag} must be "<code|cri_…>=<value>"; got "${raw}"`,
        'cli.invalid_value',
      );
    }
    const ref = raw.slice(0, eq);
    const ids = declaredCriterionIds.has(ref) ? [ref] : (codeToCriterionIds.get(ref) ?? []);
    if (ids.length !== 1 || !assessedIds.has(ids[0]!)) {
      throw new CliError(
        `--${flag} "${ref}" must name a criterion assessed by a --criterion in this command`,
        'cli.invalid_value',
      );
    }
    return [ids[0]!, raw.slice(eq + 1)];
  };
  const findingSummaries = new Map<string, string>();
  for (const raw of strArray(args, 'finding')) {
    const [id, summary] = resolveFindingRef('finding', raw);
    if (findingSummaries.has(id)) {
      throw new CliError(`--finding given twice for ${id}`, 'cli.invalid_value');
    }
    findingSummaries.set(id, summary);
  }
  const findingBasis = new Map<string, string[]>();
  for (const raw of strArray(args, 'finding-basis')) {
    const [id, ref] = resolveFindingRef('finding-basis', raw);
    if (!knownEvidence.has(ref) && !knownReconciliation.has(ref)) {
      throw new CliError(
        `--finding-basis ${ref} is not an Evidence or Reconciliation in this ledger`,
        'cli.invalid_value',
      );
    }
    findingBasis.set(id, [...(findingBasis.get(id) ?? []), ref]);
  }
  // A per-criterion citation is also part of what the Verdict as a whole rests on.
  for (const refs of findingBasis.values()) {
    for (const ref of refs) {
      if (knownEvidence.has(ref) && !evidenceIds.includes(ref)) evidenceIds.push(ref);
      if (knownReconciliation.has(ref) && !reconciliationIds.includes(ref)) {
        reconciliationIds.push(ref);
      }
    }
  }

  // -- Construct Verdict + Findings -----------------------------------------
  const findings: Finding[] = assessments.map((a) => {
    const crit = declaredCriteriaById.get(a.criterion_id)!;
    return {
      criterion_id: a.criterion_id,
      assessment: a.assessment,
      summary: findingSummaries.get(a.criterion_id) ?? `${crit.code}: assessed as ${a.assessment}`,
      basis_refs: [...new Set(findingBasis.get(a.criterion_id) ?? [])].sort(),
    };
  });

  const verdict: Verdict = {
    verdict_id: newId('ver_'),
    subject: { kind: 'claim', id: claimId },
    declaration_id: declaration.declaration_id,
    scope: {
      evaluated_criteria: evaluatedIds,
      unevaluated_criteria: unevaluatedIds,
    },
    conclusion,
    finality,
    basis: {
      evidence_ids: evidenceIds,
      reconciliation_ids: reconciliationIds,
    },
    findings,
    confidence: {
      level: confidence,
      rationale: confidenceRationale,
    },
    rationale,
    uncertainty,
    limitations,
    issued_by: issuedBy,
    issued_at: nowIso(),
    checker: { id: checkerId, version: checkerVersion },
  };

  // -- Record through the canonical Check flow ------------------------------
  const begun = await store.beginCheckFor({
    claim_id: claimId,
    checker: { id: checkerId, version: checkerVersion },
    invoked_by: issuedBy,
  });
  if (!begun.ok) {
    return begun;
  }

  return store.recordCheckResult({
    check_invocation_id: begun.invocation.check_invocation_id,
    outcome: 'verdict_emitted',
    verdict,
    produced_by: issuedBy,
    diagnostics: [],
  });
}

// ---------------------------------------------------------------------------
// Land (read-only, advisory Git-reality cross-check — docs/land-design.md)
// ---------------------------------------------------------------------------

/**
 * `tallyback land [--target-branch main] [--all]` — cross-checks the ledger's
 * `ready_to_land` projection against live Git state. Read-only and advisory: it never
 * merges, rebases, pushes, or writes to the ledger (design §2). Worktrees are resolved the
 * same way Check resolves them, via `runtime/bindings.json`.
 *
 * Candidate classification is fixed at the resolver/report boundary:
 *   - `ready`      = `status: 'git_ready'` — currently actionable for integration.
 *   - `unresolved` = `status: 'git_behind' | 'git_unresolved'` — actionable but Git
 *                    reality cannot yet resolve it.
 *   - `historical` = `status: 'git_integrated'` — already integrated; not actionable.
 *
 * By default, the CLI omits the `historical` bucket from the JSON output entirely (it
 * only emits `target_branch`, `ready`, `unresolved`, `conflicts`). `--all` adds the
 * `historical` bucket back into the output — never into `ready` — for callers who want
 * to audit / inspect already-integrated history. Reclassifying an integrated candidate
 * as `ready` would be a lie (telling the operator to "land me" work that has already
 * landed) and is explicitly avoided.
 */
async function runLand(store: Store, args: Args): Promise<void> {
  const targetBranch = str(args, 'target-branch', 'main');
  const snapshot = store.currentSnapshot();
  const resolver = createGitResolver({
    bindingsPath: join(store.root, 'runtime', 'bindings.json'),
  });
  const report: LandReport = await buildLandReport(snapshot, resolver, targetBranch);

  // Default invocation: emit only the actionable surface. `--all` re-adds the
  // `historical` bucket as a sibling of `ready` / `unresolved` — never folding integrated
  // candidates into `ready` (which would lie about readiness).
  const out: Record<string, unknown> = {
    target_branch: targetBranch,
    ready: report.ready,
    unresolved: report.unresolved,
    conflicts: report.conflicts,
  };
  const includeAll = args['all'] === 'true';
  if (includeAll) out.historical = report.historical;
  print(out);

  const historicalTail =
    includeAll && report.historical.length > 0 ? `, ${report.historical.length} historical` : '';
  process.stderr.write(
    `land: ${report.ready.length} ready, ${report.unresolved.length} unresolved, ` +
      `${report.conflicts.length} conflict group(s)${historicalTail} against "${targetBranch}"\n`,
  );
}

// ---------------------------------------------------------------------------
// View (read-only, compact per-task tallyback projection — docs/view-design.md)
// ---------------------------------------------------------------------------

/**
 * `tallyback view [--task-id <id>]... [--stale-after-ms <n>]` — assembles the compact
 * per-task shape SPEC §6 calls a "tallyback": declaration, attempts, claims, evidence
 * pointers, blockers, verification, settlement, status, and next_action. Read-only;
 * never writes to the ledger (design §2).
 *
 * View is a pure-Snapshot projection (SPEC §5.11: Settlement is not a Task status).
 * Every Task is surfaced regardless of Settlement decision; effective Settlements are
 * reported via `next_action: "settled: <decision>"` and `status.settled`, exactly as
 * v1 specified. Active-vs-historical filtering is intentionally NOT applied here —
 * it is an open retention-design question for a future evidence-driven slice.
 */
async function runView(store: Store, args: Args): Promise<void> {
  const taskIds = taskRefs(store, args);
  const staleAfterMsRaw = optionalStr(args, 'stale-after-ms');
  const staleAfterMs =
    staleAfterMsRaw !== undefined ? Number(staleAfterMsRaw) : DEFAULT_STALE_AFTER_MS;
  if (!Number.isFinite(staleAfterMs) || staleAfterMs < 0) {
    throw new CliError('--stale-after-ms must be a non-negative finite number');
  }

  const snapshot = store.currentSnapshot();
  const policy = { now: new Date().toISOString(), staleAfterMs };
  const views = buildTaskViews(snapshot, taskIds.length > 0 ? taskIds : undefined, policy);
  const summary = summarizeTaskViews(views);

  // An initialized ledger with no Task has no per-task next_action to follow yet; name the
  // next missing record instead of leaving an empty `tasks` array to be interpreted.
  const ledgerNext = taskIds.length === 0 ? deriveLedgerNextAction(snapshot) : null;
  print({
    generated_from_revision: snapshot.revision,
    tasks: views,
    summary,
    ...(ledgerNext ? { next_action: ledgerNext } : {}),
  });
  process.stderr.write(
    `view: ${summary.task_count} task(s), ${summary.blocked} blocked, ` +
      `${summary.ready_to_land} ready_to_land, ${summary.stale} stale, ${summary.settled} settled\n`,
  );
}

// ---------------------------------------------------------------------------
// Watch (read-only, on-demand lost / claim_without_branch_advance detection — docs/watch-design.md)
// ---------------------------------------------------------------------------

/**
 * `tallyback watch [--stale-after-ms <n>]` — cross-checks every open Attempt (no
 * `AttemptEnd`, no effective Settlement) against live workspace/Git state: `lost` when the
 * bound workspace no longer resolves, `claim_without_branch_advance` when a Claim exists
 * but the branch shows no commits since dispatch (observation only — does not judge the
 * claim), `unresolved` when there is no branch to check, plus the ledger's own `stale`
 * projection. Read-only and advisory only: no Blocker is raised, no ledger write (design §2).
 */
async function runWatch(store: Store, args: Args): Promise<void> {
  const staleAfterMsRaw = optionalStr(args, 'stale-after-ms');
  const staleAfterMs =
    staleAfterMsRaw !== undefined ? Number(staleAfterMsRaw) : DEFAULT_STALE_AFTER_MS;
  if (!Number.isFinite(staleAfterMs) || staleAfterMs < 0) {
    throw new CliError('--stale-after-ms must be a non-negative finite number');
  }

  const snapshot = store.currentSnapshot();
  const policy = { now: new Date().toISOString(), staleAfterMs };
  const resolver = createWatchResolver({
    bindingsPath: join(store.root, 'runtime', 'bindings.json'),
  });
  const report = await buildWatchReport(snapshot, resolver, policy);

  print(report);
  process.stderr.write(
    `watch: ${report.summary.open_attempts} open attempt(s), ${report.summary.stale} stale, ` +
      `${report.summary.lost} lost, ${report.summary.claim_without_branch_advance} claim_without_branch_advance, ` +
      `${report.summary.unresolved} unresolved\n`,
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
  if (apply && args['preview'] === 'true') {
    throw new CliError('--preview and --apply are mutually exclusive; nothing was written');
  }
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
    // Same shape as every other rejected outcome: machine-readable on stdout, a one-line
    // `code: message` on stderr. The command did not run.
    const helpful =
      (err.code === 'cli.missing_flag' || err.code === 'cli.invalid_value') &&
      COMMAND_SPECS.has(currentCommand)
        ? `${err.message}. See \`tallyback ${currentCommand} --help\`.`
        : err.message;
    print({ ok: false, code: err.code, message: helpful });
    process.stderr.write(`${err.code}: ${helpful}\n`);
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
