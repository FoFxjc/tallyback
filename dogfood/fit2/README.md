# Execution Fit — round 2

Evidence for the Fit ownership / `view.execution_fit` repair and the boundary benchmark.
Earlier Fit evidence (`../fit/`) and the 3×3 benchmark (`../runs/`) are untouched.

| Runs                                                     | Pin       | What                                                                                         |
| -------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------- |
| `repro-cold-haiku-pre-fix`                               | `2f76847` | reproduce Fit inheritance on cold-return                                                     |
| `cold-post-fix-{haiku,sonnet,opus}`                      | `174c45f` | cold-return after `view.execution_fit` + ownership wording                                   |
| `cold-post-fix2-haiku-{a,b}`                             | `10e8acd` | after the "picking up an open Attempt" trigger                                               |
| `boundary-{fit,conditional,not-fit}-{haiku,sonnet,opus}` | `10e8acd` | the 3×3 boundary benchmark (frozen build, no Tallyback change during the nine runs)          |
| `handoff-not-fit-sonnet`                                 | `10e8acd` | a fresh executor resumes the Sonnet NOT_FIT workspace after the missing approval is supplied |

Harness: `scripts/run-one.sh`, `run-cold.sh`, `run-handoff.sh` (fresh headless sessions, the
unchanged `../prompt.txt`, deterministic seeds via `make-seed.sh`, independent collection via
`collect.sh`). Fixtures: `../fixtures/boundary-*` (seed + hidden oracle). Per-run audits:
`runs/*/audit.md`. Analysis: `analysis.md`.
