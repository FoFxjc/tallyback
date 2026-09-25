#!/usr/bin/env bash
# run-one.sh <fixture> <model-alias> <run-label>
# One fresh headless session on a fresh deterministic seed, then independent collection.
# Needs FITBENCH (a build of TB_SHA with bin/tallyback) and TB_SHA.
set -uo pipefail
: "${FITBENCH:?}"; : "${TB_SHA:?}"
FIT="$(cd "$(dirname "$0")/.." && pwd)"; DOG="$(cd "$FIT/.." && pwd)"
FX="$1"; M="$2"; LABEL="$3"
MODEL="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["models"][sys.argv[2]])' "$FIT/manifest.json" "$M")"
OUT="$FIT/runs/$LABEL"; [ ! -e "$OUT" ] || { echo "exists: $OUT" >&2; exit 2; }
mkdir -p "$OUT" "$FITBENCH/w"; WS="$(mktemp -d "$FITBENCH/w/XXXXXXXX")/repo"
SEED="$("$FIT/scripts/make-seed.sh" "$FX" "$WS")"
S=$(date +%s)
"$FIT/scripts/claude-run.sh" "$WS" "$MODEL" "$OUT/transcript.jsonl" "$(cat "$DOG/prompt.txt")"
E=$(date +%s)
python3 - "$OUT/run.json" <<PY
import json,sys
json.dump({"run_id":"$LABEL","tallyback_sha":"$TB_SHA","fixture":"$FX","model_requested":"$MODEL",
 "seed_sha":"$SEED","workspace":"$WS","session_seconds":$((E-S))},open(sys.argv[1],"w"),indent=2)
PY
"$FIT/scripts/collect.sh" "$OUT" "$WS" >/dev/null 2>&1
echo "$LABEL: $((E-S))s"
