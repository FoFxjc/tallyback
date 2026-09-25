#!/usr/bin/env bash
# run-handoff.sh <source-run> <model-alias> <run-label> <overlay-dir>
# Copy a finished run's workspace (Git + ledger as the previous executor left them), commit
# <overlay-dir> on top as a human (e.g. a missing approval), then start a fresh session with
# the unchanged prompt. Needs FITBENCH (a build of TB_SHA) and TB_SHA.
set -uo pipefail
: "${FITBENCH:?}"; : "${TB_SHA:?}"
FIT="$(cd "$(dirname "$0")/.." && pwd)"; DOG="$(cd "$FIT/.." && pwd)"
SRC="$FIT/runs/$1"; M="$2"; LABEL="$3"; OVERLAY="$(cd "$4" && pwd)"
MODEL="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["models"][sys.argv[2]])' "$FIT/manifest.json" "$M")"
OUT="$FIT/runs/$LABEL"; [ ! -e "$OUT" ] || { echo "exists: $OUT" >&2; exit 2; }
SRCWS="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["workspace"])' "$SRC/run.json")"
FX="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["fixture"])' "$SRC/run.json")"
SEED="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["seed_sha"])' "$SRC/run.json")"
mkdir -p "$OUT"; WS="$(mktemp -d "$FITBENCH/w/XXXXXXXX")/repo"; cp -a "$SRCWS" "$WS"
rm -f "$WS/.tallyback/runtime/bindings.json"
cp -r "$OVERLAY/." "$WS/"
git -C "$WS" add -- $(cd "$OVERLAY" && find . -type f | sed 's|^\./||')
GIT_AUTHOR_NAME="M. Okafor" GIT_AUTHOR_EMAIL="okafor@council.invalid" GIT_COMMITTER_NAME="M. Okafor" \
  GIT_COMMITTER_EMAIL="okafor@council.invalid" git -C "$WS" -c commit.gpgsign=false commit -q -m "approval: event priority (v2)"
S=$(date +%s)
"$FIT/scripts/claude-run.sh" "$WS" "$MODEL" "$OUT/transcript.jsonl" "$(cat "$DOG/prompt.txt")"
E=$(date +%s)
python3 - "$OUT/run.json" <<PY
import json,sys
json.dump({"run_id":"$LABEL","tallyback_sha":"$TB_SHA","fixture":"$FX","source_run":"$1","overlay":"$4",
 "model_requested":"$MODEL","seed_sha":"$SEED","workspace":"$WS","session_seconds":$((E-S))},open(sys.argv[1],"w"),indent=2)
PY
"$FIT/scripts/collect.sh" "$OUT" "$WS" >/dev/null 2>&1
echo "$LABEL: $((E-S))s"
