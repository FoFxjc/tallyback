# Tallyback Land — design (v1, advisory-only)

> Planning document, matching the pattern of `docs/contract-bundle.md` and
> `docs/branch-workflow.md`. Land is the first ecosystem component built on top of the
> frozen contract; this document defines its v1 scope before `src/land/` is written.

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
correct per the verdict-finality / verification-exception matrix — Land does not
re-derive or second-guess it) and cross-checks it against live Git state to answer:

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
- Land needs a live worktree per candidate task, resolved the same way Check already
  resolves one: via `runtime/bindings.json` (`repo_id -> workspace_id -> root`), loaded
  with the existing `loadBindings`/`discoverBindingsPath` helpers in
  `src/check/resolution.ts`. It does not invent a second binding mechanism.

## 3. Inputs

For each `task_id` in `computeProjectionValues(snapshot).ready_to_land`:

1. Find its effective (non-superseded) `land` Settlement, and from `settlement.attempt_id`
   find the `Attempt`.
2. From the Attempt, resolve `workspace_id` / `repository_id` (Attempt already carries
   both — see `src/contract/record-types.ts`'s attempt shape).
3. Resolve the Workspace record for `branch` (optional field on `Workspace`, per
   `contract/schemas/records.schema.json`) — if absent, Land cannot resolve a branch and
   reports `git_unresolved` for that task rather than guessing one.
4. Resolve the local worktree root via bindings (`repo_id`/`workspace_id`), the same
   `RESOLUTION_CODES` failure modes as Check apply here (`repository_unbound`,
   `workspace_unbound`, `path_unavailable`, `not_a_git_repository`, ...) — Land reuses
   `src/check/resolution.ts`'s resolver rather than re-implementing worktree resolution.
5. A caller-supplied `--target-branch` (default `main`) names the branch each candidate is
   evaluated against — Land does not guess the default branch from `HEAD` or a remote.

## 4. Readiness classification

For each candidate, in addition to the ledger-level `ready_to_land` membership:

- `git_ready` — the branch exists, resolves via `git rev-parse --verify`, and
  `git merge-base --is-ancestor <target> <branch>` succeeds (the candidate branch is not
  behind the target in a way `git diff` can't reconcile) — i.e., a fast-forward or clean
  three-way merge is at least plausible. Land does **not** attempt a merge to find out; a
  merge-conflict prediction is out of scope for v1 (see §6).
- `git_unresolved` — binding missing, branch field missing, or the Git command itself
  failed (`environment_unavailable`, `not_a_git_repository`, etc.). Reported with the
  `ResolutionCode`/reason, same shape Check already reports.
- `git_behind` — branch resolves but is not ahead of the target at all (nothing to land).

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
