# Tallyback Bridge — design (v1: generic adapter + one Claude Code plugin)

> Planning document, matching the pattern of `docs/land-design.md`, `docs/view-design.md`,
> and `docs/watch-design.md`. Bridge is the fourth and final host-layer component defined
> in README's ecosystem table; this document defines its v1 scope before anything under
> `src/bridge/` or `bridge/` is written.

## 1. What Bridge is for, and why it needs two layers

README: *"Adapters for agent hosts, stores, and worktree managers."* Unlike Land/View/
Watch, no part of the contract names a concrete shape for Bridge — SPEC §16
("Distribution and host adaptation") describes the *policy* a host adapter must follow
(mandatory capability handshake, fail-closed on an unknown contract major, no CLI-
subcommand passthrough) but deliberately does not name a host, because "the distribution
profile is a separately versioned, non-normative deliverable."

Picking a single concrete host without a host-neutral layer underneath it would violate
SPEC's own "Host neutral" design principle (README/SPEC principle 5) — a Claude-Code-only
Bridge would be a fork of the concept, not an implementation of it. So Bridge v1 is two
layers:

1. **A generic adapter description** (`src/bridge/adapter.ts`) — a host-neutral,
   data-driven description of the five loop phases (declare/dispatch/observe/verify/
   settle) plus the read-only reports (land/view/watch): what each phase's precondition
   is, which `tallyback` CLI command backs it, and what the capability handshake requires
   before it runs. This is the "template" — any future host adapter (a different agent
   host, a different plugin system) is built by rendering this same data into that host's
   own manifest/skill format, not by re-deriving the loop from scratch.
2. **One concrete adapter**: a Claude Code plugin (`bridge/claude-code/`) that renders
   layer 1 into Claude Code's actual plugin/skill format, so it can be installed and used
   today. This is the "first public profile, one plugin with one initial skill" SPEC §16
   already anticipates.

## 2. Bounded scope for v1

- **The generic layer is data, not a plugin system of its own.** `src/bridge/adapter.ts`
  exports a typed registry (phase → precondition text → CLI command template → required
  handshake feature) and nothing else — no plugin loader, no host-discovery mechanism, no
  second CLI. It exists so the Claude Code plugin's skill content is generated from one
  source of truth instead of hand-duplicating the loop's semantics in prose.
- **The skill never bypasses the handshake.** SPEC §16: *"Every mutating workflow performs
  this preflight... never mutate on compatibility failure."* The CLI already enforces this
  server-side (`preflight()` in `src/cli.ts`) — Bridge does not weaken or duplicate that
  check, it surfaces it: the skill's own instructions tell the model to run
  `tallyback handshake` first and stop if the reported `command_api_version`/
  `supported_contract_versions` don't match what the skill was written against, exactly as
  SPEC §16 requires of a host adapter. This is belt-and-suspenders documentation-level
  enforcement, not a second technical gate — the CLI's own `preflight()` is what actually
  fails closed.
- **The skill exposes phases, not a CLI passthrough.** SPEC §16: *"not a CLI-subcommand
  passthrough."* The `SKILL.md` content walks the model through *which phase applies now*
  and *what its precondition is* (e.g. "before Verify, a Claim with at least one Evidence
  reference must exist") — it does not just forward `$ARGUMENTS` to `tallyback` verbatim.
  A user typing a raw command is still free to do so directly in a shell; the skill's job
  is the semantic layer SPEC calls for.
- **No marketplace, no CI publishing pipeline, no plugin dependency graph.** Per
  `docs/implementation-plan.md` §2's non-goals (no MCP/marketplace submission for this
  milestone) and SPEC §16's own non-goals list. The plugin directory is structured so it
  *could* be published later, but publishing itself is out of scope here.
- **Claude Code's plugin/skill format is treated as time-sensitive**, per SPEC §16: *"Any
  current host plugin/submission expectations are time-sensitive and non-normative; cite
  the host's official documentation rather than inlining them as permanent contract
  rules."* The concrete files in `bridge/claude-code/` follow the format documented at
  code.claude.com/docs (plugin manifest, skills reference) as of this writing; a
  `bridge/claude-code/README.md` says so explicitly and points at those docs rather than
  asserting the format as contract-level fact.
- **No new schema, no new record type, no ledger writes** — same as Land/View/Watch.
  Bridge is glue over the existing CLI, not a new capability.

## 3. Layer 1: the generic adapter description

`src/bridge/adapter.ts` exports:

```ts
export interface LoopPhase {
  phase: 'declare' | 'dispatch' | 'observe' | 'verify' | 'settle';
  /** One sentence: what must already be true before this phase runs. */
  precondition: string;
  /** The tallyback CLI command(s) this phase maps to. */
  commands: string[];
  /** SPEC-level rule this phase must not violate (quoted for the skill author). */
  guardrail: string;
}

export const LOOP_PHASES: readonly LoopPhase[];

export interface ReadOnlyReport {
  name: 'land' | 'view' | 'watch';
  command: string;
  summary: string;
}

export const READ_ONLY_REPORTS: readonly ReadOnlyReport[];

export interface HandshakeRequirement {
  command: string;
  /** What a host adapter must check in the handshake output before proceeding. */
  checks: string[];
}

export const HANDSHAKE_REQUIREMENT: HandshakeRequirement;
```

Populated directly from what already exists — `LOOP_PHASES` mirrors SPEC §7's five
commands and their existing CLI mapping (`declare`, `dispatch`, `claim`/`evidence`/`block`,
`begin-check`/`record-check`, `settle`); `READ_ONLY_REPORTS` mirrors `land`/`view`/`watch`.
This module hand-authors that data once — it does not introspect `src/cli.ts` at runtime
(there is no stable programmatic command registry to introspect; `src/cli.ts`'s dispatch
is a chain of `if`/`switch` statements, not a data structure). A future refactor could make
`src/cli.ts` render itself from this registry instead of the other way around, but that is
out of scope for v1: this registry is additive documentation-as-data, not a rewrite of the
CLI's dispatch.

One small, related gap this design surfaces: `FEATURE_INTERFACES` in `src/version.ts`
(`['store', 'check', 'migration']`) predates Land/View/Watch and does not list them, so a
host adapter checking the handshake's `features` array cannot currently detect their
presence. Fixing `FEATURE_INTERFACES` to add `'land'`, `'view'`, `'watch'` is small,
in-scope, and directly needed for `HANDSHAKE_REQUIREMENT` to be meaningful — do it as part
of this work, not as a separate task.

## 4. Layer 2: the Claude Code plugin

```
bridge/claude-code/
├── .claude-plugin/
│   └── plugin.json
├── skills/
│   └── tallyback/
│       └── SKILL.md
└── README.md          # time-sensitivity note + link to code.claude.com/docs
```

- `plugin.json` — `name`, `description`, `version` (starts at `0.1.0`, tracks this
  directory independently of the main package's `version` per SPEC §16: *"Contract,
  implementation, and plugin versions are independent, joined only by compatibility
  ranges"*).
- `skills/tallyback/SKILL.md` — frontmatter `description` (when the model should reach for
  it: driving a Tallyback-tracked task through its lifecycle) and body content
  **generated from `LOOP_PHASES`/`READ_ONLY_REPORTS`/`HANDSHAKE_REQUIREMENT`** (by hand for
  v1 — a `scripts/render-claude-code-skill.ts` that emits `SKILL.md` from the registry is a
  reasonable fast-follow, not required for v1): handshake-first instruction, one section
  per loop phase naming its precondition/command/guardrail, one section listing the
  read-only reports and when to reach for each (e.g. "after `settle --decision land`,
  before relying on integration: land" — `land` reports on already-authorized work, it
  does not precede or substitute for the Settle that authorizes it).
- `README.md` in `bridge/claude-code/` — states the plugin format was current as of this
  writing per code.claude.com/docs/en/plugins and /skills, and that a maintainer should
  re-check those docs before assuming the manifest shape is still accurate (SPEC §16's own
  time-sensitivity instruction, applied concretely).

## 5. Non-goals (v1)

- No marketplace listing, no `claude plugin install` publishing flow.
- No second host adapter beyond Claude Code (a generic layer exists so a second one is
  *possible* later, not so one ships now).
- No plugin dependency graph, no MCP server, no hooks.
- No attempt to make `src/cli.ts` self-describe from the Layer 1 registry — the registry
  is hand-authored to mirror the CLI, not generated from it or generating it, in v1.
- No automated test that actually loads the plugin inside a running Claude Code instance
  (out of reach for this repo's test suite) — verification is: the JSON is valid, the
  Markdown frontmatter parses, and the documented CLI commands it references actually
  exist (a test can grep `src/cli.ts` for each command name the skill mentions, so the
  skill can't silently drift from the real command surface).

## 6. Shape / file list

- `src/bridge/adapter.ts` — `LOOP_PHASES`, `READ_ONLY_REPORTS`, `HANDSHAKE_REQUIREMENT` as
  described in §3.
- `src/bridge/index.ts` — barrel, matching `src/land/index.ts`'s pattern.
- `src/version.ts` — add `'land'`, `'view'`, `'watch'` to `FEATURE_INTERFACES` (§3's gap).
- `bridge/claude-code/.claude-plugin/plugin.json`, `bridge/claude-code/skills/tallyback/SKILL.md`,
  `bridge/claude-code/README.md` as described in §4.
- `test/bridge.test.ts` — asserts `LOOP_PHASES`/`READ_ONLY_REPORTS` cover exactly the real
  CLI commands (cross-checked against `src/cli.ts`'s command list, the way §5 describes),
  and that `bridge/claude-code/.claude-plugin/plugin.json` is valid JSON with the required
  fields, and that `SKILL.md` has parseable YAML frontmatter with a non-empty
  `description`.
