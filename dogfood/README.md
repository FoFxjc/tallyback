# Tallyback dogfood benchmark — 3 fixtures × 3 models

A controlled, reproducible observation of how agents at three capability levels (Haiku,
Sonnet, Opus) naturally use Tallyback while fixing real but bounded bugs. It is not a
coding leaderboard and not a demo: a run where an agent misuses Tallyback is evidence.

## Frozen inputs

Everything a run depends on is pinned in [`benchmark-manifest.json`](benchmark-manifest.json):

| Input                    | Pin                                                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Tallyback implementation | commit `c2ff5eb` (built from a detached worktree; never modified during the batch)                          |
| Tallyback skill          | `bridge/claude-code/skills/tallyback/SKILL.md` at that commit, installed as the project skill in every seed |
| Fixture seeds            | deterministic commits (`scripts/make-seed.sh`: fixed author/committer/date)                                 |
| Task prompt              | [`prompt.txt`](prompt.txt), identical for all nine runs (sha256 in the manifest)                            |
| Models                   | `claude-haiku-4-5-20251001`, `claude-sonnet-5`, `claude-opus-5-5`                                           |
| Harness                  | Claude Code headless (`claude -p`), flags and versions in the manifest                                      |

## Fixtures

| Fixture                                     | Tests                          | Seeded defect                                                   | Visible suite at seed |
| ------------------------------------------- | ------------------------------ | --------------------------------------------------------------- | --------------------- |
| [`tiny-cache`](fixtures/tiny-cache)         | cold-start usability, overhead | expired entry recomputed but its timestamp is not refreshed     | 10 passed             |
| [`config-migrate`](fixtures/config-migrate) | epistemic discipline           | migration drops unrelated keys; existing tests don't cover them | 10 passed             |
| [`retry-worker`](fixtures/retry-worker)     | retry / multi-attempt honesty  | oversized item dropped; empty batch survives the naive fix      | 7 passed, 2 failed    |

Each fixture has:

- `seed/` — the repository the model receives (plus `ISSUE.md` with the acceptance criteria);
- `oracle/test_oracle.py` — hidden acceptance checks, **never** shown to the model, run
  by the harness afterwards; validated to fail on the seed and pass on
  `oracle/reference/` (a minimal correct fix). `test_info_*` checks probe stricter
  readings than ISSUE.md states and are reported separately.

## Procedure

```sh
export BENCH=<scratch dir containing bin/tallyback -> pinned Tallyback dist/cli.js>
scripts/run.sh <fixture> <haiku|sonnet|opus>
```

`run.sh` builds a fresh seed in a neutrally named directory (the path names neither the
fixture nor the model), verifies the seed SHA against the manifest, runs the model with the
exact prompt and no further input, then `collect.sh` gathers evidence **from the workspace,
not from the model's prose**:

| Evidence                                                               | File under `runs/<fixture>-<model>/`                |
| ---------------------------------------------------------------------- | --------------------------------------------------- |
| run identity, SHAs, wall clock, exit code                              | `run.json`                                          |
| model identity as served, turns, cost, tool-call counts                | `metrics.json`                                      |
| full transcript                                                        | `transcript.jsonl`, readable `tool-calls.md`        |
| Tallyback command sequence / rejections                                | `tallyback-commands.jsonl`, `rejected-tallyback.md` |
| final Git diff / status / log                                          | `git/`                                              |
| visible suite, hidden oracle, "do the new tests catch the seeded bug?" | `tests/`                                            |
| complete ledger, final `view` / `validate` / `watch`                   | `tallyback/`                                        |
| model's final response                                                 | `final-response.md`                                 |
| per-run audit (reality vs ledger)                                      | `audit.md`                                          |

`tests/final-tests-vs-seeded-impl.txt` runs the model's final test suite against the
**seeded** implementation file: tests that fail there are the ones that actually
demonstrate the bug (acceptance criterion "add a regression test").

## Rules kept during the batch

- No change to Tallyback, fixtures, criteria, prompt, skill, or environment between runs.
- No hints and no human intervention after a run starts; any intervention is recorded.
- Tallyback defects found mid-batch go to `analysis/product-findings.md`, unfixed until all
  nine runs finish.

Analysis lives in [`analysis/`](analysis/).
