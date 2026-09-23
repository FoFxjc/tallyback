# Tallyback Land — behavior (v1, advisory-only)

> Implemented behavior reference for the `tallyback land` command and the
> `src/land/` module. Land is the first ecosystem component built on top of the
> frozen v1 contract; the v1 scope below matches the running implementation.
> History: this file began life as a planning document before `src/land/` was
> written; the wording has been reconciled with the current behavior of
> `src/land/report.ts` and `src/cli.ts:runLand` for the 0.1.0 release.

## 1. What Land is for

README's ecosystem table describes Land's responsibility as "integration readiness,
ordering, conflict awareness, and merge settlement." SPEC §7.2 already anticipates this
component by name: it defines `ready_to_land` as a **graph-level** projection —
`computeProjectionValues` (`src/ledger/projections.ts`) — and explicitly says the other
half, "current Git … facts," is deliberately **not** computed there:

> "The 'current Git' half is a live check this pure, I/O-free function over a `Snapshot`
> cannot perform — that belongs to a host/View layer with filesystem access (SPEC §16),
> never fabricated here."

Land *is* that host layer. It takes the ledger's `ready_to_land` task list (already
correct per `isPositiveVerification` / the verification-exception override —
`src/ledger/projections.ts`; Land does not re-derive or second-guess it) and cross-checks
it against live Git state to answer:

- of the tasks the ledger says are ready to land, which ones' worktrees are actually
  landable right now (branch exists, has commits ahead of the target, no missing ref)?
- if more than one is ready, what order avoids a foreseeable file-level collision?

## 2. Bounded scope for v1

Per `docs/implementation-plan.md` §2 ("no workflow engine," "no multi-writer merge or
dependency-scoped rebase"), Land v1 is **read-only and advisory**:

- It reports readiness and a suggested order. **It never merges, pushes, rebases, or
  writes to the ledger.** No new record type, no CLI mutation. It shells out to `git` only
  for read commands (`rev-parse`, `diff --name-only`, `merge-base`) — never `merge`,
  `rebase`, `push`, or anything that mutates a ref.
- It does not re-implement or override `ready_to_land`. A task Land reports on must
  already be in the Store's `ready_to_land` projection; Land adds a *Git-reality* layer on
  top, it does not replace the *ledger-authority* layer.
- No declared task-dependency field exists anywhere in `contract/schemas/records.schema.json`
  (confirmed: only `supersedes` exists, and that's for record lineage, not task ordering).
  So v1 ordering is **conflict-derived only** — Land does not invent a `depends_on` field.
  If Tallyback later needs declared cross-task dependencies, that is a contract change
  (new schema field + invariant), out of scope here.
- Land resolves candidate branches through bindings (`repo_id`/`workspace_id` →
  root), the same way Check already resolves them via `loadBindings` /
  `discoverBindingsPath` in `src/check/resolution.ts`. It does not invent a second
  binding mechanism.
- The original Attempt's worktree does **not** need to survive: integration can be
  positively proven from any usable Workspace sharing the same `repository_id`.
  Sibling fallback is **positive-proof only** (see §4): Land only consults another
  Workspace when that Workspace can answer the `merge-base --is-ancestor` question
  for the candidate's branch; if no Workspace can, Land reports `git_unresolved`
  rather than fabricating a proof.
- Multiple Workspaces sharing one `repository_id` may be **independent clones or
  handoffs with different ref freshness**. Tallyback does not assume they share an
  object database, and Land never copies a missing ref between them.
- If the candidate branch ref is gone from every Workspace bound to its
  `repository_id`, Tallyback currently cannot reliably prove historical integration
  and **fails closed** with `git_unresolved` — there is no inferred/synthesized
  proof path in v1.

## 3. Inputs

For each `task_id` in `computeProjectionValues(snapshot).ready_to_land`:

1. Find its effective (non-superseded) `land` Settlement, and from `settlement.attempt_id`
   find the `Attempt`.
2. From the Attempt, resolve `workspace_id` / `repository_id` (Attempt already carries
   both — see `src/contract/record-types.ts`'s attempt shape).
3. Resolve the Workspace record for `branch` (optional field on `Workspace`, per
   `contract/schemas/records.schema.json`) — if absent, Land cannot resolve a branch and
   reports `git_unresolved` for that task rather than guessing one.
4. Resolve a usable Workspace under the candidate's `repository_id` via bindings,
   the same way Check already resolves them. All Workspaces bound to that
   `repository_id` are eligible; the Attempt's original Workspace is **not**
   required to still exist. If at least one bound Workspace can answer the Git
   query below, that Workspace is used; otherwise Land reports `git_unresolved`.
   The same `RESOLUTION_CODES` failure modes as Check apply
   (`repository_unbound`, `workspace_unbound`, `path_unavailable`,
   `not_a_git_repository`, ...) — Land reuses `src/check/resolution.ts`'s resolver
   rather than re-implementing worktree resolution.
5. A caller-supplied `--target-branch` (default `main`) names the branch each candidate is
   evaluated against — Land does not guess the default branch from `HEAD` or a remote.

## 4. Readiness classification

For each candidate, in addition to the ledger-level `ready_to_land` membership, Land
assigns exactly one of three buckets:

- `ready` — `status: 'git_ready'`. The branch resolves and
  `git merge-base --is-ancestor <target> <branch>` is false: the candidate is
  currently actionable for integration. A fast-forward or clean three-way merge is
  at least plausible; Land does **not** attempt a merge to find out (merge-conflict
  prediction is out of scope — see §6).
- `unresolved` — `status: 'git_behind'` (branch resolves but is not ahead of the
  target — nothing to land yet) or `status: 'git_unresolved'` (binding missing,
  branch field missing, no Workspace under the candidate's `repository_id` can
  resolve the branch, or the Git command itself failed). Actionable work that
  cannot yet be classified from Git reality; reported with the `ResolutionCode` /
  reason, same shape Check already reports.
- `historical` — `status: 'git_integrated'`. `merge-base --is-ancestor <branch>
  <target>` returned true: every commit on the candidate's branch is already
  reachable from the target. **Not currently actionable** — there is nothing new to
  land. Land proves this via any usable Workspace under the same
  `repository_id` (sibling fallback, positive-proof only); integrated candidates
  **never re-enter** `ready` under any code path, because reporting a candidate as
  ready when Git has already integrated it would lie to the operator.

The CLI exposes these buckets as follows:

- `tallyback land` (default) emits `target_branch`, `ready`, `unresolved`,
  `conflicts` only.
- `tallyback land --all` adds the `historical` bucket to the JSON output for
  archaeology / audit. Historical candidates are never folded into `ready`
  regardless of flags.

If the candidate branch ref is gone from every Workspace bound to its
`repository_id`, Land reports `git_unresolved` — there is no inferred /
synthesized proof path in v1 (see §2).

## 5. Ordering / conflict awareness

Given the set of candidates classified `git_ready`, Land computes the file set each
touches relative to the target branch: `git diff --name-only <target>...<branch>`. Two
candidates that touch an overlapping file set are flagged as a **potential conflict
pair** — advisory only, since Land does not simulate the merge itself. Candidates with no
overlapping files are reported in an arbitrary-but-deterministic order (by `task_id`,
never by wall-clock time, matching the "never by timestamp" rule `docs/branch-workflow.md`
already establishes for fork reconciliation). Candidates that share a conflict are called
out as a group; Land recommends landing the group serially and re-running Land after each
one (since the target's tip moves), rather than proposing an order within the group
itself — proposing a wrong order would be a "workflow engine" judgment call that belongs
to the human/PM agent, not to Land.

## 6. Explicit non-goals (v1)

- No merge simulation / conflict content prediction — file-overlap is a heuristic
  proxy, not a merge dry-run.
- No automatic re-ordering execution, no branch mutation, no ledger writes.
- No declared task dependency graph (see §2).
- No remote fetch — Land operates on the local worktree's current state only, consistent
  with the project-wide "no remote clone/fetch" bounded-scope rule.

## 7. Shape

- `src/land/report.ts` — pure-ish core: given a `Snapshot` + a resolver function (Git I/O
  behind an interface, so it's unit-testable without shelling out, mirroring how
  `src/check/flow.ts` takes a `Checker` function rather than hardcoding a checker) and a
  target branch, returns a `LandReport`: `{ ready: LandCandidate[], unresolved:
  LandCandidate[], conflicts: { task_ids: string[], overlapping_files: string[] }[] }`.
- `src/land/git.ts` — the real Git-backed resolver, built on `runGit`
  (`src/check/resolution.ts`) for `rev-parse`, `merge-base --is-ancestor`, and
  `diff --name-only`.
- CLI: `tallyback land [--target-branch main]` — read-only, JSON to stdout (matching
  `show`/`list`/`validate`'s convention), human summary to stderr. Like `validate`, it
  runs against an already-open Store (`Store.open`) and does not require a mutating
  preflight beyond what read commands already do.
