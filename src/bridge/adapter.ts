/**
 * Bridge — generic, host-neutral adapter description (see `docs/bridge-design.md` §3).
 *
 * This module is hand-authored data, not a runtime: it mirrors SPEC §7's five loop
 * commands and the read-only reports (land/view/watch) so a host adapter's skill/manifest
 * content can be rendered from one source of truth instead of re-deriving the loop's
 * semantics in prose. It does not introspect `src/cli.ts` — there is no stable
 * programmatic command registry to introspect (design §3) — so `test/bridge.test.ts`
 * cross-checks these command names against the real CLI dispatch to catch drift.
 */

export interface LoopPhase {
  phase: 'declare' | 'dispatch' | 'observe' | 'verify' | 'settle';
  /** One sentence: what must already be true before this phase runs. */
  precondition: string;
  /** The tallyback CLI command(s) this phase maps to. */
  commands: string[];
  /** SPEC-level rule this phase must not violate (quoted for the skill author). */
  guardrail: string;
}

export const LOOP_PHASES: readonly LoopPhase[] = [
  {
    phase: 'declare',
    precondition:
      'A Task already exists (created via `topic`/`task`) to declare against; superseding an existing Declaration requires naming it explicitly with --supersedes.',
    commands: ['declare'],
    guardrail:
      'Rules validate explicit operations; they never advance state automatically (SPEC §7) — Declare only creates a TaskDeclaration, it does not dispatch or authorize anything else.',
  },
  {
    phase: 'dispatch',
    precondition:
      'A Declaration exists for the Task, and a Repository/Workspace are registered for the Attempt to run in.',
    commands: ['dispatch', 'end'],
    guardrail:
      'Ending an Attempt does not declare the Task complete (SPEC §7) — End records how an Attempt stopped, it never authorizes settlement.',
  },
  {
    phase: 'observe',
    precondition: 'An open Attempt exists to attribute the Claim, Evidence, or Blocker to.',
    commands: ['claim', 'evidence', 'block', 'resolve'],
    guardrail:
      'Adding evidence does not create a positive Verdict (SPEC §7) — Observe records facts, it never renders a verdict.',
  },
  {
    phase: 'verify',
    precondition: 'A Claim exists naming the Declaration and criteria being checked.',
    commands: ['begin-check', 'record-check'],
    guardrail:
      'A passing check does not automatically accept the Task (SPEC §7) — Verify records a CheckInvocation/CheckResult and, within it, Reconciliations and/or a Verdict; it never itself settles the Task.',
  },
  {
    phase: 'settle',
    precondition:
      'A semantically sufficient basis exists for the named decision — a Verdict, an AttemptEnd, and/or named Blockers.',
    commands: ['settle'],
    guardrail:
      'A positive Verdict does not automatically authorize landing (SPEC §7) — Settle requires an explicit, attributed decision naming its basis (SPEC §7.1).',
  },
];

export interface ReadOnlyReport {
  name: 'land' | 'view' | 'watch';
  command: string;
  summary: string;
}

export const READ_ONLY_REPORTS: readonly ReadOnlyReport[] = [
  {
    name: 'land',
    command: 'land',
    summary:
      "Cross-checks the ledger's ready_to_land projection against live Git state. Read-only and advisory: it never merges, rebases, pushes, or writes to the ledger.",
  },
  {
    name: 'view',
    command: 'view',
    summary:
      'Assembles the compact per-task tallyback (SPEC §6): declaration, attempts, claims, evidence pointers, blockers, verification, settlement, status, and next_action. Read-only; never writes to the ledger.',
  },
  {
    name: 'watch',
    command: 'watch',
    summary:
      "Cross-checks every open Attempt against live workspace/Git state for lost / claim_without_branch_advance / unresolved conditions plus the ledger's own stale projection. Read-only and advisory: no Blocker is raised, no ledger write.",
  },
];

export interface HandshakeRequirement {
  command: string;
  /** What a host adapter must check in the handshake output before proceeding. */
  checks: string[];
}

export const HANDSHAKE_REQUIREMENT: HandshakeRequirement = {
  command: 'tallyback handshake',
  checks: [
    'command_api_version matches what this skill/plugin was written against',
    "supported_contract_versions includes the ledger's schema_version before any mutating command runs; an unknown contract major must fail closed and never mutate (SPEC §16)",
    "features lists the interfaces a workflow depends on (e.g. 'land', 'view', 'watch') before relying on them",
  ],
};
