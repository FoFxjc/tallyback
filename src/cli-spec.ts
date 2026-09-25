/**
 * The CLI's declared command surface: every command, every flag it accepts, and which of
 * those are required, repeatable, boolean, or restricted to a closed set of values.
 *
 * This table is the single source the CLI checks input against *before* it opens or
 * mutates a ledger. Unknown input fails closed: a flag a command does not declare, a
 * non-repeatable flag given twice, or a stray positional token is a usage error, never
 * something to ignore. (Dogfood evidence: ignored flags such as `--criteria`,
 * `--dry-run`, or `--branch` on `dispatch` produced real but wrong ledger records — a
 * criteria-less declaration, a junk declaration, an Attempt without its branch.)
 *
 * Not re-exported from the public barrel; it describes `src/cli.ts` only.
 */

import {
  ATTEMPT_END_OUTCOMES,
  CHECK_RESULT_OUTCOMES,
  DECISION_ROLES,
  DECISION_SUBJECT_KINDS,
  DISPOSITIONS,
  SETTLEMENT_DECISIONS,
} from './contract/index.js';

export interface FlagSpec {
  name: string;
  description: string;
  required?: boolean;
  /** May be given more than once; the values are collected in order. */
  repeatable?: boolean;
  /** Takes no value (`--flag`). */
  boolean?: boolean;
  /** Closed set of accepted values. */
  values?: readonly string[];
  /** Placeholder shown in usage, e.g. `tsk_…`. */
  placeholder?: string;
}

export interface CommandSpec {
  name: string;
  summary: string;
  flags: FlagSpec[];
  /** Canonical, copy-pasteable invocations (placeholders in `<…>`). */
  examples: string[];
  /** Whether the command writes to the ledger (or its machine-local bindings). */
  mutates: boolean;
}

/** Evidence kinds accepted by the frozen v1 contract (`records.schema.json#/$defs/evidence_kind`). */
export const EVIDENCE_KINDS = [
  'git_commit',
  'git_diff',
  'file_snapshot',
  'command_run',
  'test_run',
  'artifact',
  'observation',
  'extension',
] as const;

const ACTOR_HELP =
  'attribute the record to kind:id (kind: human|subagent|executor|tool|unknown|migrated)';

const actorFlag = (what = 'the record'): FlagSpec => ({
  name: 'actor',
  placeholder: 'kind:id',
  description: `who authored ${what}; ${ACTOR_HELP}`,
});

/** Flags every command accepts. */
export const GLOBAL_FLAGS: FlagSpec[] = [
  { name: 'project-root', placeholder: 'path', description: 'project directory (default: cwd)' },
  { name: 'as', placeholder: 'kind:id', description: `submitter of the operation; ${ACTOR_HELP}` },
  { name: 'help', boolean: true, description: 'show this command’s flags and examples' },
];

const commands: CommandSpec[] = [
  // -- Capability / bootstrap ---------------------------------------------------------
  {
    name: 'handshake',
    summary: 'Print the capability handshake (versions and features).',
    flags: [],
    examples: ['tallyback handshake'],
    mutates: false,
  },
  {
    name: 'version',
    summary: 'Print the implementation version.',
    flags: [],
    examples: ['tallyback version'],
    mutates: false,
  },
  {
    name: 'init',
    summary: 'Create a new ledger in this project.',
    flags: [
      {
        name: 'repository',
        repeatable: true,
        placeholder: 'alias',
        description: 'register a repository alias (default: one repository, "main")',
      },
      { name: 'topic', placeholder: 'name', description: 'also create a first Topic' },
      { name: 'goal', placeholder: 'text', description: 'goal of the first Topic' },
      { name: 'project-id', placeholder: 'prj_…', description: 'use this project id' },
      actorFlag('the first Topic'),
    ],
    examples: [
      'tallyback init',
      'tallyback init --repository main --topic release --goal "ship v1"',
    ],
    mutates: true,
  },
  {
    name: 'migrate',
    summary: 'Preview or apply a one-time migration from a legacy store.',
    flags: [
      { name: 'source', required: true, placeholder: 'file', description: 'legacy store JSON' },
      { name: 'preview', boolean: true, description: 'report what would be written (default)' },
      { name: 'apply', boolean: true, description: 'write the migrated ledger' },
      {
        name: 'legacy-schema-version',
        placeholder: 'version',
        description: 'legacy schema version',
      },
      actorFlag('migrated records'),
    ],
    examples: [
      'tallyback migrate --source legacy.json',
      'tallyback migrate --source legacy.json --apply',
    ],
    mutates: true,
  },
  // -- Read-only reports / gates ------------------------------------------------------
  {
    name: 'show',
    summary: 'Print the full ledger snapshot.',
    flags: [],
    examples: ['tallyback show'],
    mutates: false,
  },
  {
    name: 'list',
    summary: 'List repositories, workspaces, topics, and tasks with their ids.',
    flags: [
      {
        name: 'what',
        values: ['repositories', 'workspaces', 'topics', 'tasks', 'all'],
        description: 'which collection to list (default: all)',
      },
    ],
    examples: ['tallyback list', 'tallyback list --what tasks'],
    mutates: false,
  },
  {
    name: 'bindings',
    summary: 'Print machine-local workspace bindings.',
    flags: [],
    examples: ['tallyback bindings'],
    mutates: false,
  },
  {
    name: 'view',
    summary: 'Compact per-task state and next_action. Start here.',
    flags: [
      {
        name: 'task-id',
        repeatable: true,
        placeholder: 'tsk_…|alias',
        description: 'restrict to these tasks',
      },
      { name: 'stale-after-ms', placeholder: 'ms', description: 'staleness window (default 48h)' },
    ],
    examples: ['tallyback view', 'tallyback view --task-id <tsk_…>'],
    mutates: false,
  },
  {
    name: 'watch',
    summary: 'Cross-check open Attempts against live workspace/Git state.',
    flags: [
      { name: 'stale-after-ms', placeholder: 'ms', description: 'staleness window (default 48h)' },
    ],
    examples: ['tallyback watch'],
    mutates: false,
  },
  {
    name: 'land',
    summary: 'Cross-check ready_to_land settlements against live Git state (never merges).',
    flags: [
      {
        name: 'target-branch',
        placeholder: 'branch',
        description: 'integration branch (default: main)',
      },
      { name: 'all', boolean: true, description: 'also report historical settlements' },
    ],
    examples: ['tallyback land', 'tallyback land --target-branch main'],
    mutates: false,
  },
  {
    name: 'validate',
    summary: 'CI gate: report every problem with the ledger files.',
    flags: [],
    examples: ['tallyback validate'],
    mutates: false,
  },
  {
    name: 'reconcile',
    summary: 'Repair forked lineages (and, explicitly, a disagreeing project.json).',
    flags: [
      {
        name: 'keep',
        repeatable: true,
        placeholder: 'record id',
        description: 'the head to keep, one per forked lineage',
      },
      { name: 'repair-header', boolean: true, description: 'rewrite project.json from state.json' },
      { name: 'dry-run', boolean: true, description: 'plan only; write nothing' },
    ],
    examples: ['tallyback reconcile', 'tallyback reconcile --keep <dcl_…>'],
    mutates: true,
  },
  // -- Bootstrap records ----------------------------------------------------------------
  {
    name: 'topic',
    summary: 'Create a Topic (every Task belongs to one).',
    flags: [
      { name: 'name', required: true, placeholder: 'name', description: 'topic name' },
      { name: 'goal', placeholder: 'text', description: 'what the topic is for' },
      actorFlag('the Topic'),
    ],
    examples: ['tallyback topic --name release --goal "ship v1"'],
    mutates: true,
  },
  {
    name: 'task',
    summary: 'Create a Task under a Topic.',
    flags: [
      { name: 'topic-id', required: true, placeholder: 'top_…', description: 'owning Topic' },
      { name: 'title', required: true, placeholder: 'text', description: 'task title' },
      { name: 'alias', placeholder: 'T1', description: 'local human alias for --task-id' },
    ],
    examples: ['tallyback task --topic-id <top_…> --title "Fix slugify"'],
    mutates: true,
  },
  {
    name: 'workspace',
    summary: 'Register a Workspace (a checkout/branch) of a Repository.',
    flags: [
      {
        name: 'repository-id',
        required: true,
        placeholder: 'repo_…',
        description: 'owning Repository',
      },
      { name: 'branch', placeholder: 'branch', description: 'the branch this workspace works on' },
      { name: 'ref', placeholder: 'ref', description: 'a fixed Git ref instead of a branch' },
    ],
    examples: ['tallyback workspace --repository-id <repo_…> --branch fix/slugify'],
    mutates: true,
  },
  {
    name: 'bind',
    summary: 'Bind a Workspace to a local path (machine-local; never committed).',
    flags: [
      { name: 'repository-id', required: true, placeholder: 'repo_…', description: 'Repository' },
      { name: 'workspace-id', required: true, placeholder: 'wsp_…', description: 'Workspace' },
      {
        name: 'root',
        required: true,
        placeholder: 'path',
        description: 'absolute path of the checkout',
      },
    ],
    examples: ['tallyback bind --repository-id <repo_…> --workspace-id <wsp_…> --root "$PWD"'],
    mutates: true,
  },
  // -- Declare --------------------------------------------------------------------------
  {
    name: 'declare',
    summary: 'Declare what the Task must achieve, with acceptance criteria.',
    flags: [
      { name: 'task-id', required: true, placeholder: 'tsk_…|alias', description: 'the Task' },
      { name: 'objective', required: true, placeholder: 'text', description: 'what done means' },
      {
        name: 'criterion',
        repeatable: true,
        placeholder: 'code:statement',
        description: 'one acceptance criterion; repeat per criterion',
      },
      {
        name: 'supersedes',
        placeholder: 'dcl_…',
        description: 'the current declaration this one replaces',
      },
      actorFlag('the declaration'),
    ],
    examples: [
      'tallyback declare --task-id <tsk_…> --objective "Refreshed entries stay cached" ' +
        '--criterion "refresh:The refreshed value stays cached for a full TTL" ' +
        '--criterion "tests:A regression test demonstrates the bug"',
    ],
    mutates: true,
  },
  // -- Dispatch -------------------------------------------------------------------------
  {
    name: 'dispatch',
    summary: 'Start an Attempt at a declared Task in a Workspace.',
    flags: [
      { name: 'task-id', required: true, placeholder: 'tsk_…|alias', description: 'the Task' },
      {
        name: 'declaration-id',
        required: true,
        placeholder: 'dcl_…',
        description: 'current declaration',
      },
      { name: 'repository-id', required: true, placeholder: 'repo_…', description: 'Repository' },
      {
        name: 'workspace-id',
        required: true,
        placeholder: 'wsp_…',
        description: 'Workspace (the branch lives on the Workspace, see `workspace --branch`)',
      },
      { name: 'executor', placeholder: 'kind:id', description: `who does the work; ${ACTOR_HELP}` },
      {
        name: 'dispatcher',
        placeholder: 'kind:id',
        description: `who dispatched it; ${ACTOR_HELP}`,
      },
      { name: 'session-id', placeholder: 'id', description: 'executor session id' },
    ],
    examples: [
      'tallyback dispatch --task-id <tsk_…> --declaration-id <dcl_…> --repository-id <repo_…> ' +
        '--workspace-id <wsp_…> --executor executor:<agent>',
    ],
    mutates: true,
  },
  {
    name: 'end',
    summary: 'Record how an Attempt stopped (never settles the Task).',
    flags: [
      { name: 'attempt-id', required: true, placeholder: 'att_…', description: 'the Attempt' },
      {
        name: 'outcome',
        required: true,
        values: ATTEMPT_END_OUTCOMES,
        description: 'how it stopped',
      },
      { name: 'reason', placeholder: 'text', description: 'why' },
      { name: 'supersedes', placeholder: 'ate_…', description: 'the AttemptEnd this one replaces' },
      actorFlag('the AttemptEnd'),
    ],
    examples: ['tallyback end --attempt-id <att_…> --outcome returned --reason "fix committed"'],
    mutates: true,
  },
  // -- Observe --------------------------------------------------------------------------
  {
    name: 'claim',
    summary: 'Record what an Attempt claims it did (a claim, not a fact).',
    flags: [
      { name: 'task-id', required: true, placeholder: 'tsk_…|alias', description: 'the Task' },
      { name: 'attempt-id', required: true, placeholder: 'att_…', description: 'the Attempt' },
      {
        name: 'declaration-id',
        required: true,
        placeholder: 'dcl_…',
        description: 'the declaration the Attempt was dispatched under',
      },
      { name: 'statement', required: true, placeholder: 'text', description: 'the claim' },
      {
        name: 'evidence',
        repeatable: true,
        placeholder: 'evi_…',
        description: 'Evidence supporting the claim; repeat per record',
      },
      actorFlag('the claim'),
    ],
    examples: [
      'tallyback claim --task-id <tsk_…> --attempt-id <att_…> --declaration-id <dcl_…> ' +
        '--statement "…" --evidence <evi_…>',
    ],
    mutates: true,
  },
  {
    name: 'evidence',
    summary: 'Record an inspectable piece of Evidence (link it from a claim with --evidence).',
    flags: [
      { name: 'kind', required: true, values: EVIDENCE_KINDS, description: 'evidence kind' },
      {
        name: 'payload',
        required: true,
        placeholder: 'json',
        description: 'kind-specific JSON payload',
      },
      { name: 'note', placeholder: 'text', description: 'free-text note' },
      actorFlag('the evidence'),
    ],
    examples: [
      `tallyback evidence --kind observation --payload '{"text":"pytest -q: 11 passed"}'`,
      `tallyback evidence --kind git_commit --payload '{"repository_id":"<repo_…>","object_id":"<sha>","object_format":"sha1"}'`,
    ],
    mutates: true,
  },
  {
    name: 'block',
    summary: 'Raise a Blocker on a Task.',
    flags: [
      { name: 'task-id', required: true, placeholder: 'tsk_…|alias', description: 'the Task' },
      { name: 'description', required: true, placeholder: 'text', description: 'what blocks it' },
      { name: 'attempt-id', placeholder: 'att_…', description: 'the Attempt it blocks' },
      actorFlag('the Blocker'),
    ],
    examples: ['tallyback block --task-id <tsk_…> --description "needs API key"'],
    mutates: true,
  },
  {
    name: 'resolve',
    summary: 'Resolve or withdraw a Blocker.',
    flags: [
      { name: 'blocker-id', required: true, placeholder: 'blk_…', description: 'the Blocker' },
      { name: 'disposition', required: true, values: DISPOSITIONS, description: 'outcome' },
      { name: 'explanation', placeholder: 'text', description: 'why' },
      {
        name: 'evidence',
        repeatable: true,
        placeholder: 'evi_…',
        description: 'supporting Evidence',
      },
      { name: 'supersedes', placeholder: 'brs_…', description: 'the resolution this one replaces' },
      actorFlag('the resolution'),
    ],
    examples: [
      'tallyback resolve --blocker-id <blk_…> --disposition resolved --explanation "key added"',
    ],
    mutates: true,
  },
  // -- Verify ---------------------------------------------------------------------------
  {
    name: 'verdict',
    summary:
      'Judge a Claim criterion by criterion (records CheckInvocation → CheckResult → Verdict).',
    flags: [
      { name: 'claim', required: true, placeholder: 'clm_…', description: 'the Claim judged' },
      {
        name: 'criterion',
        required: true,
        repeatable: true,
        placeholder: '<code|cri_…>=<assessment>',
        description:
          'assessment per criterion: supported|partially_supported|unsupported|contradicted',
      },
      {
        name: 'confidence',
        required: true,
        values: ['low', 'medium', 'high'],
        description: 'confidence level',
      },
      {
        name: 'rationale',
        required: true,
        placeholder: 'text',
        description: 'why, citing the checks',
      },
      { name: 'attempt', placeholder: 'att_…', description: 'the Attempt (default: the claim’s)' },
      { name: 'allow-partial', boolean: true, description: 'allow leaving criteria unassessed' },
      {
        name: 'evidence',
        repeatable: true,
        placeholder: 'evi_…',
        description: 'Evidence the Verdict rests on',
      },
      {
        name: 'reconciliation',
        repeatable: true,
        placeholder: 'rec_…',
        description: 'Reconciliations the Verdict rests on',
      },
      { name: 'finality', values: ['final', 'preliminary'], description: 'default: final' },
      { name: 'confidence-rationale', placeholder: 'text', description: 'why this confidence' },
      {
        name: 'conclusion',
        values: ['supported', 'partially_supported', 'unsupported', 'contradicted'],
        description: 'overall conclusion (required with --allow-partial or mixed assessments)',
      },
      {
        name: 'uncertainty',
        repeatable: true,
        placeholder: 'text',
        description: 'a stated uncertainty',
      },
      {
        name: 'limitation',
        repeatable: true,
        placeholder: 'text',
        description: 'a stated limitation',
      },
      {
        name: 'checker-id',
        placeholder: 'id',
        description: 'checker identity (default: operator-authored)',
      },
      {
        name: 'checker-version',
        placeholder: 'version',
        description: 'checker version (default: v1)',
      },
      actorFlag('the Verdict'),
    ],
    examples: [
      'tallyback verdict --claim <clm_…> --criterion refresh=supported --criterion tests=supported ' +
        '--confidence high --rationale "…" --evidence <evi_…>',
    ],
    mutates: true,
  },
  {
    name: 'begin-check',
    summary: 'Open a CheckInvocation over a Claim (low-level; prefer `verdict`).',
    flags: [
      { name: 'claim-id', required: true, placeholder: 'clm_…', description: 'the Claim' },
      { name: 'checker-id', required: true, placeholder: 'id', description: 'checker identity' },
      {
        name: 'checker-version',
        required: true,
        placeholder: 'version',
        description: 'checker version',
      },
      actorFlag('the invocation'),
    ],
    examples: [
      'tallyback begin-check --claim-id <clm_…> --checker-id pytest --checker-version 8.3.3',
    ],
    mutates: true,
  },
  {
    name: 'record-check',
    summary: 'Record a CheckResult with raw contract records (low-level; prefer `verdict`).',
    flags: [
      {
        name: 'invocation-id',
        required: true,
        placeholder: 'chk_…',
        description: 'the CheckInvocation',
      },
      {
        name: 'outcome',
        required: true,
        values: CHECK_RESULT_OUTCOMES,
        description: 'result outcome',
      },
      { name: 'verdict', placeholder: 'json', description: 'a complete Verdict record (JSON)' },
      {
        name: 'reconciliation',
        repeatable: true,
        placeholder: 'json',
        description: 'a complete Reconciliation record',
      },
      {
        name: 'evidence-record',
        repeatable: true,
        placeholder: 'json',
        description: 'a complete Evidence record',
      },
      {
        name: 'diagnostic',
        repeatable: true,
        placeholder: 'code:message',
        description: 'a diagnostic',
      },
      actorFlag('the CheckResult'),
    ],
    examples: ['tallyback record-check --invocation-id <chk_…> --outcome verdict_withheld'],
    mutates: true,
  },
  // -- Settle ---------------------------------------------------------------------------
  {
    name: 'settle',
    summary: 'Record an explicit, attributed decision about the Task.',
    flags: [
      { name: 'task-id', required: true, placeholder: 'tsk_…|alias', description: 'the Task' },
      {
        name: 'attempt-id',
        required: true,
        placeholder: 'att_…',
        description: 'the Attempt settled',
      },
      {
        name: 'decision',
        required: true,
        values: SETTLEMENT_DECISIONS,
        description: 'the decision',
      },
      { name: 'rationale', required: true, placeholder: 'text', description: 'why' },
      {
        name: 'verdict-id',
        placeholder: 'ver_…',
        description: 'basis: the Verdict (accept/land need this or --verification-exception)',
      },
      {
        name: 'verification-exception',
        placeholder: 'text',
        description: 'basis: an explicit, attributed decision to proceed without a Verdict',
      },
      { name: 'attempt-end-id', placeholder: 'ate_…', description: 'basis: the AttemptEnd' },
      { name: 'blocker', repeatable: true, placeholder: 'blk_…', description: 'basis: a Blocker' },
      { name: 'supersedes', placeholder: 'set_…', description: 'the Settlement this one replaces' },
      actorFlag('the Settlement'),
    ],
    examples: [
      'tallyback settle --task-id <tsk_…> --attempt-id <att_…> --decision accept --verdict-id <ver_…> --rationale "…"',
    ],
    mutates: true,
  },
  {
    name: 'decision',
    summary: 'Record a coordination Decision (execution choice or next action).',
    flags: [
      {
        name: 'subject-kind',
        required: true,
        values: DECISION_SUBJECT_KINDS,
        description: 'what it is about',
      },
      { name: 'subject-id', required: true, placeholder: 'id', description: 'the subject record' },
      { name: 'role', required: true, values: DECISION_ROLES, description: 'decision role' },
      { name: 'question', required: true, placeholder: 'text', description: 'the question' },
      { name: 'choice', required: true, placeholder: 'text', description: 'the choice made' },
      { name: 'rationale', required: true, placeholder: 'text', description: 'why' },
      {
        name: 'basis',
        repeatable: true,
        placeholder: 'id',
        description: 'records the decision rests on',
      },
      { name: 'supersedes', placeholder: 'dec_…', description: 'the Decision this one replaces' },
      actorFlag('the Decision'),
    ],
    examples: [
      'tallyback decision --subject-kind task --subject-id <tsk_…> --role next_action ' +
        '--question "retry?" --choice "retry with a narrower fix" --rationale "…"',
    ],
    mutates: true,
  },
];

export const COMMAND_SPECS: ReadonlyMap<string, CommandSpec> = new Map(
  commands.map((c) => [c.name, c]),
);

/** A usage problem found before any command logic runs. */
export interface UsageProblem {
  code:
    'cli.unknown_command' | 'cli.unknown_flag' | 'cli.repeated_flag' | 'cli.unexpected_argument';
  message: string;
}

/**
 * Check parsed input against the declared surface. Returns the first problem, or null.
 *
 * `args` holds each flag's value(s); `positionals` holds tokens that were not flags or
 * flag values.
 */
export function checkUsage(
  command: string,
  args: Record<string, string | string[]>,
  positionals: string[],
): UsageProblem | null {
  const spec = COMMAND_SPECS.get(command);
  if (!spec) {
    return {
      code: 'cli.unknown_command',
      message: `unknown command "${command}". Available: ${[...COMMAND_SPECS.keys()].join(', ')}`,
    };
  }
  const declared = new Map<string, FlagSpec>();
  for (const f of [...GLOBAL_FLAGS, ...spec.flags]) declared.set(f.name, f);

  for (const [name, value] of Object.entries(args)) {
    const flag = declared.get(name);
    if (!flag) {
      const accepted = spec.flags.map((f) => `--${f.name}`).join(' ') || '(none)';
      return {
        code: 'cli.unknown_flag',
        message:
          `\`${command}\` does not accept --${name}; nothing was recorded. ` +
          `Accepted flags: ${accepted}. See \`tallyback ${command} --help\`.`,
      };
    }
    if (Array.isArray(value) && !flag.repeatable) {
      return {
        code: 'cli.repeated_flag',
        message: `--${name} may be given only once for \`${command}\`; nothing was recorded.`,
      };
    }
  }
  if (positionals.length > 0) {
    return {
      code: 'cli.unexpected_argument',
      message:
        `\`${command}\` takes no positional arguments (got ${positionals.map((p) => JSON.stringify(p)).join(', ')}); ` +
        `pass values with flags. See \`tallyback ${command} --help\`.`,
    };
  }
  return null;
}

/** The per-command usage text printed by `tallyback <command> --help` / `tallyback help <command>`. */
export function renderUsage(spec: CommandSpec): string {
  const line = (f: FlagSpec): string => {
    const value = f.boolean
      ? ''
      : ` <${f.values ? f.values.join('|') : (f.placeholder ?? 'value')}>`;
    return `  --${f.name}${value}${f.repeatable ? '  (repeatable)' : ''}\n      ${f.description}`;
  };
  const required = spec.flags.filter((f) => f.required);
  const optional = spec.flags.filter((f) => !f.required);
  const parts = [
    `tallyback ${spec.name} — ${spec.summary}`,
    '',
    `Usage: tallyback ${spec.name}${required.map((f) => ` --${f.name} <${f.placeholder ?? f.values?.join('|') ?? 'value'}>`).join('')}${optional.length ? ' [options]' : ''}`,
  ];
  if (required.length) parts.push('', 'Required:', ...required.map(line));
  if (optional.length) parts.push('', 'Options:', ...optional.map(line));
  parts.push('', 'Global:', ...GLOBAL_FLAGS.map(line));
  parts.push('', 'Examples:', ...spec.examples.map((e) => `  ${e}`));
  parts.push('', spec.mutates ? 'Writes to the ledger.' : 'Read-only.');
  return `${parts.join('\n')}\n`;
}
