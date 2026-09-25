#!/usr/bin/env bash
# Execute one benchmark run in a fresh workspace and collect its evidence.
#
#   run.sh <fixture> <haiku|sonnet|opus>
#
# Requires: BENCH (scratch dir holding bin/tallyback -> the pinned Tallyback build).
set -euo pipefail

FIXTURE="$1"
ALIAS="$2"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
: "${BENCH:?set BENCH to the benchmark scratch directory}"

MODEL="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["models"][sys.argv[2]])' "$HERE/benchmark-manifest.json" "$ALIAS")"
EXPECTED_SEED="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["fixtures"][sys.argv[2]]["seed_sha"])' "$HERE/benchmark-manifest.json" "$FIXTURE")"
RUN_ID="$FIXTURE-$ALIAS"
OUT="$HERE/runs/$RUN_ID"
[ ! -e "$OUT" ] || { echo "run $RUN_ID already exists; refusing to overwrite evidence" >&2; exit 2; }
mkdir -p "$OUT" "$BENCH/w"

# Fresh, neutrally named workspace: the path reveals neither fixture nor model.
WS_PARENT="$(mktemp -d "$BENCH/w/XXXXXXXX")"
WS="$WS_PARENT/repo"
SEED="$("$HERE/scripts/make-seed.sh" "$FIXTURE" "$WS")"
[ "$SEED" = "$EXPECTED_SEED" ] || { echo "seed drift: $SEED != $EXPECTED_SEED" >&2; exit 3; }
[ ! -e "$WS/.tallyback" ] || { echo "workspace unexpectedly has a ledger" >&2; exit 3; }

START="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
START_S="$(date +%s)"
set +e
(
  cd "$WS"
  env -u CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD PATH="$BENCH/bin:$PATH" \
    timeout 2700 claude -p "$(cat "$HERE/prompt.txt")" \
      --model "$MODEL" \
      --output-format stream-json --verbose \
      --strict-mcp-config --setting-sources project \
      --allowedTools "Bash Read Edit Write Glob Grep Skill TodoWrite Agent Task"
) > "$OUT/transcript.jsonl" 2> "$OUT/claude-stderr.txt"
EXIT=$?
set -e
END="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
END_S="$(date +%s)"

python3 - "$OUT/run.json" <<PY
import json, sys
json.dump({
  "run_id": "$RUN_ID", "fixture": "$FIXTURE", "model_alias": "$ALIAS", "model_requested": "$MODEL",
  "seed_sha": "$SEED", "workspace": "$WS", "started_at": "$START", "ended_at": "$END",
  "wall_clock_seconds": $END_S - $START_S, "claude_exit_code": $EXIT,
}, open(sys.argv[1], "w"), indent=2)
PY

"$HERE/scripts/collect.sh" "$RUN_ID" "$WS"
echo "$RUN_ID done (exit $EXIT, $((END_S - START_S))s)"
