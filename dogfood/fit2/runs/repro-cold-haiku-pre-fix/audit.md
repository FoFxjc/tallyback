# repro-cold-haiku-pre-fix — audit

Reproduction of the fit cold-return inheritance gap at the **pre-fix** pin `2f76847`
(same skill and CLI as `../../../fit/runs/cold-return-config-migrate-haiku-to-haiku`).
Session A 12:05:19 → 12:06:24 (killed at the checkpoint), session B 12:06:31 → 12:09:06, fresh.

- A: Attempt `…2021da`, Fit `FIT: credible path to do and verify` (recorded without `--actor`,
  so attributed `unknown:unattributed`), uncommitted edit to `migrate.py`.
- B: ISSUE → skill → `view` → read code/tests → edited. **It never recorded a Fit and never
  tried to**: it worked under A's FIT silently (worse than the earlier run, where it at least
  tried, was refused, and then adopted A's). It never ran `git status`/`git diff` before
  editing over A's change.
- B then: evidence, claim, verdict `supported/high` with no uncertainty/limitations,
  **`git commit` on `main`** (`ade3630`), **`settle land`**. Code is correct (oracle 6/6).

Inheritance reproduced 2/2 for Haiku at this pin. Causes on the surface: `view` did not show
the Fit, and the skill gave no concrete resume procedure (no `--supersedes` recipe, no
"check `git diff`").
