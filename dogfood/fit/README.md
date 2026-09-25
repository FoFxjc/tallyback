# Execution Fit Check — experiments

Dogfooding the Execution Fit Check added to the Claude Code skill (`2f76847`). Tallyback is
pinned at that commit for every run here; the frozen 3×3 benchmark (`../runs/`) is untouched.

- **Experiment 1 — retry-worker-v2** (`scripts/run-retry.sh`): the retry-worker seed with
  the oversized-first-item test removed, so fixing the visible defect turns every visible
  test green while the empty-batch defect (ISSUE.md criterion 4) remains. After the session
  stops, the harness runs the hidden `../fixtures/retry-worker-v2/independent_check.py`; if
  it finds a violation, its report is sent into the **same** session (`--resume`) as a
  neutral message (`runs/*/phase2-message.txt`). If phase 1 already fixed both defects, no
  retry is forced. Measured: behaviour after evidence contradicts the executor's belief
  that it was done.
- **Experiment 2 — cold-return** (`scripts/run-cold.sh`): session A works until it has
  dispatched, recorded its Fit Decision, and edited the implementation, then its process
  group is killed (`session-a/termination.txt`, snapshot at kill). Session B starts fresh
  with the same prompt and nothing else, and must reconstruct state from Tallyback and Git.

Same prompt (`../prompt.txt`), Claude Code flags, and isolation as the benchmark. Seeds are
deterministic (`scripts/make-seed.sh`). Per-run audits: `runs/*/audit.md`; analysis:
`analysis.md`.
