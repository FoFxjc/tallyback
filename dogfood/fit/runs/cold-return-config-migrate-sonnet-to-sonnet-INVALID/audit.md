# cold-return-config-migrate-sonnet-to-sonnet — INVALID (harness defect)

**Not a cold-return.** Session A was never terminated. `run-cold.sh` killed the process
group led by the `setsid` wrapper, but `timeout` inside `claude-run.sh` moves itself into
its own process group, so the `claude` process survived. Transcript timestamps:
session A 11:11:09 → 11:14:19, session B 11:12:38 → 11:15:42. For ~100 s both sessions
worked in the same workspace and ledger. The snapshots under `session-a/*-at-kill*` show
the state at the *intended* kill point (89 s), not a final state.

What really happened (kept as evidence of the harness fault, not of cold recovery):

- A (still running) finished the whole loop after the "kill": evidence (test_run,
  observation), claim, verdict supported/high with no uncertainty or limitations, end
  `returned`, settle `accept` (not `land`: "changes not committed, pending user review").
- B read the ISSUE, the diff left by A, and ran `handshake` + `view` and the tests. It then
  tried to record **its own** Fit Decision on A's still-open Attempt and was refused:
  `invariant.supersession_conflict` — a second `execution_choice` Decision on the same
  Attempt without `--supersedes` would make two unsuperseded heads. (Interaction-surface
  finding, still valid: the skill says "every executor does its own Fit Check" but gives no
  syntax for a second executor on the *same* Attempt.)
- B then saw `settled: accept` appear in `view` (written by the concurrent A) and reported
  it as "already recorded from an earlier pass on this same attempt", re-verifying the
  tests itself instead of taking the record at face value. It recorded nothing.

Fix: `run-cold.sh` now kills the whole session (`pkill -s`) and aborts if any process from
it survives. The run was repeated as `cold-return-config-migrate-sonnet-to-sonnet`.
