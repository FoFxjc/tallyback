# Branch workflow: merge, validate, reconcile

> How a Tallyback ledger survives being edited on two branches at once.

## 1. The problem merges create

A `TaskDeclaration` is immutable. Revising it means appending a new declaration that
`supersedes` the old one, so a task's declarations form a **lineage** — a chain ending in
one *head*, the declaration currently in force.

Two branches revising the same declaration each produce a valid single-headed lineage.
Merging their `state.json` files produces one lineage with **two heads**:

```
Alice's branch     Bob's branch          after the merge
  D1 ← A             D1 ← B                D1 ← A
                                           D1 ← B      ← two heads
```

SPEC §5.4 is explicit about what must *not* happen next:

> Concurrent unsuperseded heads are an explicit declaration conflict requiring
> reconciliation; Store must not choose one by timestamp.

Picking the newer one would silently discard a human decision. So the fork is refused, and
somebody has to say which revision is in force.

The same applies to every supersession-capable type, each with its own lineage key:

| type | lineage |
| --- | --- |
| `dcl_` TaskDeclaration | task |
| `set_` Settlement | (task, attempt) |
| `ate_` AttemptEnd | attempt |
| `rec_` Reconciliation | evidence |
| `brs_` BlockerResolution | blocker |
| `dec_` Decision | (subject, role) |

## 2. A fork cannot be created by Tallyback, and cannot be appended away

**Nothing in the write path can create one.** `declare` without `supersedes` on a task that
already has a declaration is rejected; so is a batch containing two; so is the loser of a
race where both writers supersede the same head. A fork only enters a ledger through a
merge or a hand edit.

**Nothing in the write path can remove one either.** `supersedes` is single-valued, so a
new record supersedes exactly one head and leaves the other live:

```
D1 ← A, D1 ← B          two heads
+ C supersedes A   →    heads {B, C}      still two
+ C supersedes B   →    heads {A, C}      still two
```

Collapsing a fork therefore means changing an edge on a record that already exists. That
is a **file-level repair belonging to the merge**, not a ledger mutation — which is why it
lives in `tallyback reconcile` and not in the Store command surface.

## 3. Where each piece runs

| when | command | behavior |
| --- | --- | --- |
| merge / ready-to-push / branch wrap-up | `tallyback reconcile` | repairs the fork, before the branch lands |
| CI | `tallyback validate` | exits non-zero if anything is still wrong |
| every ordinary operation | `Store.open` | fails closed — the writer never builds on an ambiguous base |

`validate` and `reconcile` deliberately run **before** `Store.open`. Both exist for a
ledger `Store.open` refuses: a gate has to report what is wrong, and a repair tool has to
be able to read its input.

## 4. The flow

```console
$ tallyback validate                       # CI gate; exit 1
{
  "ok": false,
  "problems": [
    { "layer": "state", "code": "invariant.supersession_conflict",
      "message": "lineage declaration|task:tsk_…3bb has 2 concurrent unsuperseded heads (dcl_…00a, dcl_…00b)",
      "reconcilable": true }
  ],
  "conflicts": [
    { "lineage": "declaration|task:tsk_…3bb", "type": "declaration",
      "heads": ["dcl_…00a", "dcl_…00b"] }
  ],
  "next": "tallyback reconcile --keep <one of dcl_…00a|dcl_…00b>"
}

$ tallyback reconcile                      # no --keep: lists what is owed, writes nothing
mutation.reconcile_decision_required: 1 forked lineage(s) still need a decision …
Reconciliation never picks a head for you (SPEC §5.4).

$ tallyback reconcile --keep dcl_…00a      # the human decides
{ "ok": true, "wrote": true, "revision": 3,
  "rewrites": [ { "record_id": "dcl_…00a", "from": "dcl_…321f", "to": "dcl_…00b" } ] }

$ tallyback validate                       # exit 0
{ "ok": true, "problems": [], "conflicts": [] }
```

`validate` writes machine-readable JSON to stdout and a human summary to stderr, so it
works both as a CI gate and at a prompt.

## 5. The repair: chain

`--keep A` makes `A` the single head by chaining the losing heads before it:

```
before               after --keep A
  D1 ← A               D1 ← B ← A
  D1 ← B               head = A
```

- **Every id survives.** Anything anchored to a losing head — Attempts, Claims, Verdicts —
  keeps resolving. The alternative (dropping the loser and re-authoring it) would cascade
  through every record that referenced it.
- **One record's bytes change**, the kept head's `supersedes` edge. That is acceptable
  precisely here: the losing head has only ever existed on the branch being merged, and has
  never been part of the shared lineage. The merge is where its relationship to the trunk
  gets decided.
- **The order is by canonical id, never by time.** With three or more heads the losers are
  chained in id order, so the result is reproducible and carries no implied chronology.
- **The result is validated before anything is written.** A repair that would leave the
  snapshot invalid writes nothing.
- **A repair bumps the revision**, so any holder of the old one must re-read.

## 6. What reconciliation will not do

- It will not pick a head. Every forked lineage needs its own `--keep`; a run that cannot
  decide all of them writes nothing.
- It will not accept an id that is not a live head of a fork — a typo fails loudly rather
  than silently doing nothing.
- It will not touch a ledger with problems it cannot fix. Those are reported separately
  (`reconcilable: false`) and must be resolved by hand first.
- It will not run while another writer holds the store lock, and it re-reads under that
  lock before writing.

## 7. Suggested CI wiring

```yaml
- run: npx tallyback validate            # fails the build on any unreconciled fork
```

Put it after the merge commit is created and before the branch is allowed to land. The
fork is then caught at the moment someone can still make the decision cheaply, rather than
surfacing later as a ledger nobody can open.
