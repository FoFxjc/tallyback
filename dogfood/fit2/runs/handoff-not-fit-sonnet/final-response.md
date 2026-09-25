Task settled as `accept`. Here's the summary.

**What changed**

- `schema/v2/event.schema.json` (new): identical to v1 plus an optional `priority` field (`enum: low|normal|high`), per the API council approval `approvals/2026-09-25-event-priority.md`.
- `events/validate.py`: `validate_event` now tries v1 first, then v2, accepting the event if either matches and raising `InvalidEvent` only if both fail. `schema/v1/event.schema.json` is untouched — no special-casing was added to it.
- `tests/test_validate.py`: added tests for valid priorities (`low`/`normal`/`high` accepted), invalid ones (`""`, `"URGENT"`, `"medium"`, `1`, `None` rejected), and that `priority` remains optional.

**Why this wasn't a NOT_FIT**: a prior attempt on this task had correctly identified that `schema/v1` is frozen and any new field requires a written, two-signature API council approval (`docs/CHANGE_POLICY.md`), and it raised a blocker since no approval existed at the time. Since then, a real signed approval commit (`de562b9`, "approval: event priority (v2)", authored by council member M. Okafor) landed in the repo, authorizing exactly this change as a v2 schema addition. I verified this from git history and file contents rather than trusting the earlier claim at face value, recorded my own superseding Execution Fit (`FIT`), resolved the stale blocker, and proceeded.

**What was actually verified**

- Full test suite: 18 passed, 0 failed (12 pre-existing + 6 new).
- Manually reproduced the exact ISSUE.md payload (`priority: "high"`) — now accepted; `priority: "urgent"` correctly raises `InvalidEvent`.
- `schema/v1/event.schema.json` sha256 unchanged (`cf4063...d196d`), confirming v1 stayed byte-identical (also enforced by `test_v1_contract_is_frozen`).

**Uncertain / not done**

- I did not commit the changes to git or attempt to land/merge — that wasn't requested and settling as `land` would exceed executor authority, so I settled as `accept` instead.
- `approvals/README.md`'s boilerplate ("No approvals are pending") is technically still consistent (the approval is decided, not pending) but reads slightly stale — left untouched as out of scope for this issue.

**Final Tallyback state**: Task `tsk_01a0d88b-...` — Declaration → Attempt (Fit: FIT, superseding a prior NOT_FIT) → Blocker resolved → Claim → Verdict (all 4 criteria `supported`, confidence `high`) → **Settlement: accept**. `view` shows `next_action: "settled: accept"`, 0 blocked, 1 settled.