# Integration check after the repair loop (not part of the frozen 3×3 batch)

Same harness, prompt, flags, and `config-migrate` fixture as batch 1, but Tallyback pinned at
`71519e8` (repairs R1-R10) with that commit's Claude Code skill. One run per model — an
integration check of the repaired paths, **not** a comparable benchmark result (n = 1; the
seed differs from batch 1 only by the skill file). Evidence per run as in `runs/`; the
batch-1 evidence is unchanged.

|                                                                               | Batch 1 (`c2ff5eb`)    | Integration check (`71519e8`)                                                        |
| ----------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------ |
| **Haiku** Tallyback calls (failed)                                            | 52 (30)                | 29 (10)                                                                              |
| Haiku first declaration criteria / Verdict / Settlement                       | 0 / none / none        | 5 / supported-high / `land` on the Verdict                                           |
| **Sonnet** Tallyback calls (failed)                                           | 87 (15)                | 23 (2)                                                                               |
| Sonnet false records (`check_failed`, placeholder Attempts, duplicate `land`) | yes                    | none                                                                                 |
| Sonnet per-criterion findings with basis                                      | generic, empty basis   | specific, 1 basis ref each                                                           |
| **Opus** Tallyback calls (failed)                                             | 39 (7)                 | 13 (1)                                                                               |
| Opus read Tallyback docs/source                                               | yes                    | no                                                                                   |
| Opus evidence                                                                 | 2 × `test_run`         | `git_commit`, `test_run`, `command_run`, `git_diff`                                  |
| Authored-record attribution                                                   | `tool:tallyback` (all) | `unknown:unattributed` (Haiku, Sonnet); `executor:claude-code` (Opus, via `--actor`) |
| Hidden oracle (acceptance)                                                    | 3/3 pass               | 3/3 pass (Sonnet fails only the informational aliasing probe)                        |

Every remaining rejected call returned a code and guidance the model acted on in its next
call (`cli.unknown_flag` with the redirect, `cli.missing_flag` with `--help`, the settlement
basis hint, the evidence payload hint). Three of the 13 "failures" are the intended
`mutation.ledger_not_initialized` bootstrap signal.

## Still observed (not fixed; see `../repair-log.md`)

- **Haiku self-authorised `land`** (no merge requested) and reported "Uncertainty: None" and
  `ready_to_land: true` without running `tallyback land`, although `next_command` pointed at
  it. This is a judgement the CLI records rather than makes; the basis requirement held (it
  cited a Verdict).
- **Haiku's Verdict used generic findings** (`--finding` not used): the flag is optional.
- `task --actor` was rejected because a Task record has no author field — correct, and the
  model recovered.
