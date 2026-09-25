#!/usr/bin/env bash
# claude-run.sh <workspace> <model> <out-jsonl> <prompt-text> [resume-session-id]
# One headless Claude Code session with the benchmark's flags; appends to <out-jsonl>.
set -uo pipefail
: "${FITBENCH:?}"
WS="$1"; MODEL="$2"; OUT="$3"; PROMPT="$4"; RESUME="${5:-}"
cd "$WS"
env -u CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD PATH="$FITBENCH/bin:$PATH" \
  timeout 2700 claude -p "$PROMPT" ${RESUME:+--resume "$RESUME"} --model "$MODEL" \
  --output-format stream-json --verbose --strict-mcp-config --setting-sources project \
  --allowedTools "Bash Read Edit Write Glob Grep Skill TodoWrite Agent Task" >> "$OUT" 2>> "${OUT%.jsonl}.stderr.txt"
