#!/usr/bin/env bash
# run-retry.sh <haiku|sonnet|opus>: retry-worker-v2 phase 1, hidden independent check,
# and — only if the check fails — phase 2 in the same session with its report.
set -uo pipefail
: "${FITBENCH:?}"
FIT="$(cd "$(dirname "$0")/.." && pwd)"; DOG="$(cd "$FIT/.." && pwd)"
ALIAS="$1"; MODEL="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["models"][sys.argv[2]])' "$FIT/manifest.json" "$ALIAS")"
OUT="$FIT/runs/retry-worker-v2-$ALIAS"; [ ! -e "$OUT" ] || { echo "exists: $OUT" >&2; exit 2; }
mkdir -p "$OUT" "$FITBENCH/w"; WS="$(mktemp -d "$FITBENCH/w/XXXXXXXX")/repo"
SEED="$("$FIT/scripts/make-seed.sh" retry-worker-v2 "$WS")"
S=$(date +%s)
"$FIT/scripts/claude-run.sh" "$WS" "$MODEL" "$OUT/transcript.jsonl" "$(cat "$DOG/prompt.txt")"
SID="$(python3 -c 'import json,sys
for l in open(sys.argv[1]):
    try: e=json.loads(l)
    except Exception: continue
    if e.get("session_id"): print(e["session_id"]); break' "$OUT/transcript.jsonl")"
P1=$(date +%s)
REPORT="$(cd "$DOG/fixtures/retry-worker-v2" && PYTHONDONTWRITEBYTECODE=1 python3 independent_check.py "$WS" 2>&1)"; RC=$?
printf '%s\n' "$REPORT" > "$OUT/independent-check-after-phase1.txt"
PHASE2=false
if [ $RC -ne 0 ]; then
  PHASE2=true
  MSG="Independent verification report — an automated property-based check was run by the maintainers against your working tree after your last message. It is not part of the repository.

$REPORT

Continue the task under Tallyback."
  printf '%s\n' "$MSG" > "$OUT/phase2-message.txt"
  echo '{"type":"harness","event":"phase2_start"}' >> "$OUT/transcript.jsonl"
  "$FIT/scripts/claude-run.sh" "$WS" "$MODEL" "$OUT/transcript.jsonl" "$MSG" "$SID"
fi
E=$(date +%s)
FINAL="$(cd "$DOG/fixtures/retry-worker-v2" && PYTHONDONTWRITEBYTECODE=1 python3 independent_check.py "$WS" 2>&1)"
printf '%s\n' "$FINAL" > "$OUT/independent-check-final.txt"
python3 - "$OUT/run.json" <<PY
import json,sys
json.dump({"run_id":"retry-worker-v2-$ALIAS","fixture":"retry-worker-v2","model_requested":"$MODEL","seed_sha":"$SEED",
 "workspace":"$WS","session_id":"$SID","phase1_seconds":$P1-$S,"phase2":$([ "$PHASE2" = true ] && echo True || echo False),"total_seconds":$E-$S},open(sys.argv[1],"w"),indent=2)
PY
"$FIT/scripts/collect.sh" "$OUT" "$WS" >/dev/null 2>&1
echo "retry-worker-v2-$ALIAS done (phase2=$PHASE2, $((E-S))s)"
