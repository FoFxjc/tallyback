# Tallyback v1 — Migration Mapping

> Planning document. Defines how the existing Store and Check foundations conform to the
> canonical model. No foundation is modified until the written contract is reviewed and
> frozen and development is separately approved.

## 1. Migration rules (Store)

- **One-time, persisted, atomic.** A legacy Store snapshot is upgraded in one conceptual
  Store transaction: generating canonical IDs, preserving existing `Tn` aliases,
  rewriting every internal reference, then writing the mapping into the migrated
  snapshot. Crash-safe multi-file publication is implementation detail; validators prove
  the resulting snapshot + manifest pair is complete and consistent, not that the
  filesystem write was atomic.
- **IDs are never regenerated on later reads.**
- A legacy snapshot that **diverged on two machines before migration** cannot be safely
  merged by heuristics; it requires **explicit reconciliation**.
- **Field-complete and non-fabricating.** Legacy records lacking actor/timestamp use the
  explicit legacy provenance variant (`actor: unknown`, nullable timestamps); no actor is
  synthesized. No TaskDeclaration is synthesized from a task that never had one.
- Store legacy `evidence` strings migrate **losslessly** to `observation` records — they
  remain usable context but do not gain artificial machine-verifiability.
- Store legacy `attempts[]` entries become **one Evidence `observation` each** (not
  Attempt records). A legacy `status: done` is preserved as an **observation**, never as a
  Claim.

## 2. Store field → canonical mapping

| Existing Store field | Canonical representation |
| --- | --- |
| Topic `name` / `goal` | Topic (immutable creation metadata) |
| Topic `status` | Derived projection; **not** migrated as authority |
| `active_topic` | Local runtime/UI preference |
| `current_task` | Derived from open Attempts (no effective AttemptEnd); **not** authoritative |
| `next_action` | Decision with `role: next_action` |
| Blocker `description` / `task_id` | Blocker with generated identity; provenance `migrated` where unavailable |
| Decision `summary` / `rationale` | Scoped Decision; ambiguous scope → migration diagnostic |
| Task `id` (`T1`…) | Task with `task_id` + preserved `alias` |
| Task `evidence` (string array) | Evidence records of `kind: observation` |
| `attempts` (`{description, outcome}`) | Evidence records of `kind: observation` (one per entry); **not** Attempt records |

Migration creates **one canonical Topic per existing Store topic** and rewrites Task
references from topic-name context to `topic_id`. A single-topic project still has one
explicit Topic, not a topicless mode.

## 3. Check conformance

done-or-not must **emit structured verdicts with typed references** to the subject being
judged. Its existing statuses are **preserved in namespaced `native_judgment`** while
mapping contextually into canonical Verdict fields.

### Authenticity → canonical treatment (always in Claim context)

| done-or-not status | Canonical treatment |
| --- | --- |
| `Not audited` | No Verdict |
| `Preliminary` | `finality: preliminary`; does not determine `conclusion` |
| `Partial` | Usually `partially_supported` |
| `Mostly real` | Usually `partially_supported` |
| `Real` | Usually `supported` |
| `Non-operational` | Claim-dependent; finding `non_operational` |
| `Fake` | Usually `contradicted`; preserve native value |
| `Drifted` | Usually `partially_supported` or `contradicted`; finding `drift` |

The mapping is **not** a context-free enum lookup — the Claim's wording matters ("the UI
exists" vs "the feature works end-to-end").

### Presence → canonical treatment

| done-or-not status | Canonical treatment |
| --- | --- |
| `Claimed` | Existence of a Claim, not a Reconciliation |
| `Observed` | Grounded in Evidence/Reconciliation; does **not** automatically produce a Verdict |
| `Inferred` | A semantic judgment in Verdict reasoning, with explicit uncertainty |
| `Confirmed` | Maps to `supported` only when the declared criteria and scope justify it |

### The semantics gate

The two missing-semantics cases remain distinct:

- `check.declaration_semantics_missing` — no usable TaskDeclaration or acceptance criteria exist;
- `check.checker_semantics_missing` — the checker lacks the project model/context it requires.

done-or-not behavior:

- no declared criteria → `verdict_withheld` with `declaration_semantics_missing`;
- criteria exist but no usable feature map → `verdict_withheld` with `checker_semantics_missing`;
- draft feature map + a real bounded judgment possible → Verdict with `finality: preliminary`;
- only some criteria evaluable → explicitly scoped preliminary Verdict, or withholding, per documented checker policy;
- adequate semantics + coverage → a final Verdict may be emitted.

A feature map that materially supports a Verdict is emitted as **Evidence** and cited by
that Verdict — not hidden inside `native_judgment`.
