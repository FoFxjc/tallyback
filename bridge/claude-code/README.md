# Tallyback — Claude Code plugin

This directory renders the host-neutral adapter description in
[`src/bridge/adapter.ts`](../../src/bridge/adapter.ts) into a Claude Code plugin: a
`.claude-plugin/plugin.json` manifest and one skill (`skills/tallyback/SKILL.md`) that
walks a model through the Tallyback loop (declare/dispatch/observe/verify/settle) plus the
read-only reports (land/view/watch).

Per `docs/bridge-design.md` and SPEC §16 ("Any current host plugin/submission expectations
are time-sensitive and non-normative; cite the host's official documentation rather than
inlining them as permanent contract rules"): the plugin manifest and skill file shapes here
follow Claude Code's documented format as of the time this directory was written —

- https://code.claude.com/docs/en/plugins
- https://code.claude.com/docs/en/skills

Claude Code's plugin/skill format is not part of the Tallyback contract and can change
independently of it. Before assuming anything in `.claude-plugin/plugin.json` or
`skills/tallyback/SKILL.md` still matches the current format, re-check those two pages
rather than trusting this file's age.

The plugin version (`0.1.0` in `plugin.json`) tracks this directory independently of the
main package's version and of the contract's version — SPEC §16: "Contract,
implementation, and plugin versions are independent, joined only by compatibility ranges."

## Attribution

Tallyback does not guess who authored a record. Records written without `--actor` are
attributed to `$TALLYBACK_ACTOR` when the host sets it, otherwise to `unknown:unattributed`.
In Claude Code the project's `.claude/settings.json` can set it for every Bash call:

```json
{ "env": { "TALLYBACK_ACTOR": "executor:claude-code" } }
```

Use an id that is true for your setup; a per-command `--actor` still overrides it (for
example a separate verifier recording a Verdict as `subagent:<name>`).

## Execution Fit Check

The skill asks the executor, after `dispatch` and before any work, whether it can
responsibly attempt **and verify** the Attempt (criteria, capability, verification path,
tools/authority), answering `FIT`, `CONDITIONAL`, or `NOT_FIT`. It is recorded as an
existing contract record — a `Decision` on the Attempt with role `execution_choice` — and
revised with `--supersedes`. It is guidance for the executor only: Tallyback core does not
read, require, or act on it, and works unchanged when a host skips it.
